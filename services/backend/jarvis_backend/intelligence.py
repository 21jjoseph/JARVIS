"""Replaceable providers, bounded context and a privacy-first hybrid router."""
import asyncio
from collections import deque
import json
import re
import secrets
import time
from .contracts import Turn, tool_schemas, validate_tool
from .identity import instruction
from .local_engine import loopback_url
from .providers import limited_json, ProviderError
import httpx


async def sse(response):
    total=0
    async for line in response.aiter_lines():
        total+=len(line)
        if total>1_000_000 or len(line)>128_000: raise ProviderError('Stream exceeded its size limit')
        if not line.startswith('data:'): continue
        data=line[5:].strip()
        if not data or data=='[DONE]': continue
        try: value=json.loads(data)
        except ValueError: raise ProviderError('Provider returned an invalid stream') from None
        if not isinstance(value,dict): raise ProviderError('Invalid stream event')
        yield value


def check_status(response):
    if response.status_code in (401,403): raise ProviderError('Authentication rejected. Check the key and model access.')
    if response.status_code==429: raise ProviderError('Provider rate limit reached. No automatic retry was made.')
    if response.status_code>=300: raise ProviderError(f'Provider returned HTTP {response.status_code}. Check model availability.')


class ChatProvider:
    def __init__(self,name,client,model,endpoint='',key='',headers=None):
        self.name=name;self.client=client;self.model=model;self.endpoint=endpoint;self.key=key
        self.headers=headers or {}
        if name=='llama': self.endpoint=loopback_url(endpoint)

    async def discover(self):
        if self.name=='gemini':
            if not self.key: raise ProviderError('Configure a Gemini API key in AI Intelligence first')
            result=[];page=''
            for _ in range(10):
                body=await limited_json(self.client,'GET','https://generativelanguage.googleapis.com/v1beta/models',
                    headers={'x-goog-api-key':self.key},params={'pageSize':100,**({'pageToken':page} if page else {})})
                for item in body.get('models',[]):
                    name=item.get('name','').removeprefix('models/')
                    if re.fullmatch(r'[A-Za-z0-9_.:-]{1,150}',name):
                        result.append({'id':name,'methods':item.get('supportedGenerationMethods',[]),
                            'input_limit':item.get('inputTokenLimit'),'output_limit':item.get('outputTokenLimit')})
                page=body.get('nextPageToken','')
                if not page: break
            return result
        if self.name=='llama':
            body=await limited_json(self.client,'GET',self.endpoint+'/v1/models',headers=self.headers)
            return [{'id':m['id'],'methods':['generateContent','stream']} for m in body.get('data',[]) if isinstance(m.get('id'),str)]
        if self.name=='ollama':
            body=await limited_json(self.client,'GET','http://127.0.0.1:11434/api/tags')
            return [{'id':m['name'],'methods':['generateContent']} for m in body.get('models',[]) if isinstance(m.get('name'),str)]
        if not self.key: raise ProviderError('Configure the OpenAI API key first')
        body=await limited_json(self.client,'GET','https://api.openai.com/v1/models',headers={'Authorization':'Bearer '+self.key})
        return [{'id':m['id'],'methods':['generateContent','stream']} for m in body.get('data',[]) if isinstance(m.get('id'),str)]

    async def health(self):
        try:
            models=await self.discover()
            return {'available':bool(models),'models':models,'error':None,'provider':self.name}
        except (httpx.HTTPError,ValueError,ProviderError):
            return {'available':False,'models':[],'error':self.name+' is unavailable or not configured','provider':self.name}

    async def stream(self,messages,tools=True,prior=None,result=None):
        if self.name=='gemini':
            contents=[]
            for message in messages[1:]:
                contents.append({'role':'model' if message['role']=='assistant' else 'user',
                                 'parts':[{'text':message['content']}]})
            if prior is not None:
                contents+=prior
                contents.append({'role':'user','parts':[{'functionResponse':{'name':result['name'],
                    'response':{'result':result['text']}}}]})
            payload={'systemInstruction':{'parts':[{'text':messages[0]['content']}]},
                     'contents':contents,'generationConfig':{'maxOutputTokens':512}}
            if tools:
                payload['tools']=[{'functionDeclarations':[{'name':s['function']['name'],
                    'description':s['function']['description'],'parametersJsonSchema':s['function']['parameters']} for s in tool_schemas()]}]
            url=f'https://generativelanguage.googleapis.com/v1beta/models/{self.model}:streamGenerateContent?alt=sse'
            headers={'x-goog-api-key':self.key}
        else:
            payload={'model':self.model,'messages':messages,'stream':self.name!='ollama'}
            if prior is not None:
                payload['messages']=messages+prior+[{'role':'tool','tool_call_id':result['id'],'content':result['text']}]
            if tools: payload['tools']=tool_schemas()
            if self.name=='ollama':
                payload['options']={'num_ctx':4096,'num_predict':512};payload['keep_alive']='5m'
                body=await limited_json(self.client,'POST','http://127.0.0.1:11434/api/chat',json=payload)
                message=body.get('message',{});text=message.get('content','')
                calls=message.get('tool_calls') or []
                tool=self.parse_tool(calls[0]['function']) if len(calls)==1 else None
                if len(calls)>1: raise ProviderError('Only one desktop action is permitted at a time')
                yield {'kind':'final','text':text[:4000],'tool':tool,'raw':[message],
                    'usage':{'input_tokens':body.get('prompt_eval_count',0),'output_tokens':body.get('eval_count',0)},
                    'streaming':False,'call_id':'ollama-tool'}
                return
            payload.update(max_tokens=512,stream_options={'include_usage':True})
            if self.name=='llama':
                url=self.endpoint+'/v1/chat/completions';headers=self.headers
                # The server enforces its 4096-token context; history is already bounded.
            else:
                url='https://api.openai.com/v1/chat/completions';headers={'Authorization':'Bearer '+self.key}
        text='';functions={};parts=[];usage={};call_id='';raw=None
        async with self.client.stream('POST',url,json=payload,headers=headers) as response:
            check_status(response)
            async for event in sse(response):
                if self.name=='gemini':
                    if 'usageMetadata' in event:
                        u=event['usageMetadata'];usage={'input_tokens':u.get('promptTokenCount',0),'output_tokens':u.get('candidatesTokenCount',0),'reasoning_tokens':u.get('thoughtsTokenCount',0)}
                    for candidate in event.get('candidates',[]):
                        for part in candidate.get('content',{}).get('parts',[]):
                            if part.get('thought'): continue
                            if 'functionCall' in part: parts.append(part)
                            piece=part.get('text','')
                            if piece:
                                text+=piece;yield {'kind':'token','text':piece}
                else:
                    if event.get('usage'):
                        u=event['usage'];reasoning=(u.get('completion_tokens_details') or {}).get('reasoning_tokens',0)
                        usage={'input_tokens':u.get('prompt_tokens',0),'output_tokens':u.get('completion_tokens',0)-reasoning,'reasoning_tokens':reasoning}
                    for choice in event.get('choices',[]):
                        delta=choice.get('delta',{})
                        piece=delta.get('content') or ''
                        if piece: text+=piece;yield {'kind':'token','text':piece}
                        for call in delta.get('tool_calls',[]):
                            index=call.get('index',0);current=functions.setdefault(index,{'name':'','arguments':''})
                            if len(functions)>1: raise ProviderError('Multiple simultaneous tool calls are not permitted')
                            fn=call.get('function',{});current['name']+=fn.get('name','');current['arguments']+=fn.get('arguments','')
                            call_id=call.get('id') or call_id
                if len(text)>4000 or sum(len(str(v)) for v in functions.values())>8000:
                    raise ProviderError('Generated reply exceeded its limit')
        if self.name=='gemini':
            if len(parts)>1: raise ProviderError('Multiple simultaneous tool calls are not permitted')
            tool=self.parse_tool(parts[0]['functionCall']) if parts else None
            raw=[{'role':'model','parts':parts or [{'text':text}]}]
            call_id=tool['name'] if tool else ''
        else:
            tool=self.parse_tool(next(iter(functions.values()))) if functions else None
            raw=[{'role':'assistant','content':text,**({'tool_calls':[{'id':call_id,'type':'function','function':next(iter(functions.values()))}]} if tool else {})}]
        if not text and not tool: raise ProviderError('Provider returned an empty or blocked response')
        yield {'kind':'final','text':text,'tool':tool,'raw':raw,'usage':usage,'streaming':True,'call_id':call_id}

    @staticmethod
    def parse_tool(function):
        try:
            arguments=function.get('arguments',function.get('args',{}))
            if isinstance(arguments,str): arguments=json.loads(arguments)
            return validate_tool(function['name'],arguments)
        except (ValueError,KeyError,TypeError): raise ProviderError('Unsupported tool or invalid arguments; nothing was executed') from None


def choose_route(turn:Turn,local_ok:bool,cloud_ok:bool,history_chars:int=0):
    if turn.private or turn.mode=='local' or turn.route=='local': return 'local','Local-only privacy or user selection'
    if not turn.cloud_enabled or not turn.cloud_consent: return 'local','Cloud sending has not been authorized for this request'
    if turn.mode=='cloud' or turn.route=='cloud':
        return ('cloud','Explicit cloud selection') if cloud_ok else ('local','Cloud unavailable; trying compatible local fallback')
    if not local_ok and cloud_ok: return 'cloud','Local model unavailable and cloud use is authorized'
    # Transparent structural signals plus an explicit user override, not a keyword-only classifier.
    complexity=turn.complexity=='complex' or (turn.complexity=='auto' and
        sum([len(turn.text)>240,turn.text.count('?')+turn.text.count('\n')>=3,history_chars>2500])>=2)
    if complexity and cloud_ok: return 'cloud','Complex request according to the documented structural policy'
    return 'local','Conservative local default for routine or uncertain requests'


class Intelligence:
    def __init__(self,local_client,remote_client,engine):
        self.local_client=local_client;self.remote_client=remote_client;self.engine=engine
        self.sessions={};self.continuations={};self.cost=0.0
        self.last_latency={}

    def providers(self,turn,key):
        endpoint=loopback_url(turn.local_endpoint)
        local=ChatProvider(turn.local_backend,self.local_client,turn.local_model or 'gemma-4-local',endpoint,
                          headers=self.engine.headers(endpoint))
        cloud=ChatProvider(turn.cloud_provider,self.remote_client,turn.cloud_model,key=key)
        return local,cloud

    async def run(self,turn,key):
        started=time.perf_counter();local,cloud=self.providers(turn,key)
        local_health=await local.health()
        cloud_ok=bool(key and turn.cloud_enabled and turn.cloud_consent and not turn.private and turn.mode!='local' and turn.route!='local')
        # A cloud model must be discoverable for this key before generation is attempted.
        if cloud_ok:
            cloud_health=await cloud.health()
            cloud_ok=any(m['id']==turn.cloud_model and 'generateContent' in m['methods'] for m in cloud_health['models'])
        history=self.sessions.get(turn.session_id,deque(maxlen=8))
        selected,reason=choose_route(turn,local_health['available'],cloud_ok,sum(len(m['content']) for m in history))
        if turn.mode=='hybrid' and turn.route=='auto' and not turn.private and cloud_ok and local_health['available']:
            if selected=='local' and turn.complexity!='simple' and self.last_latency.get('local',0)>15_000 and self.last_latency.get('cloud',float('inf'))<self.last_latency['local']:
                selected,reason='cloud','Last local completion exceeded 15 seconds; the measured cloud completion was faster and cloud use is authorized'
            if selected=='cloud' and turn.warning_budget and self.cost>=turn.warning_budget:
                selected,reason='local','Estimated session spending warning reached; automatic routing prefers the available local provider'
        order=[selected]
        if selected=='cloud' and local_health['available']: order.append('local')
        if selected=='local' and turn.mode=='hybrid' and turn.route!='local' and not turn.private and cloud_ok: order.append('cloud')
        yield {'kind':'route','provider':selected,'reason':reason}
        for attempt,route in enumerate(order):
            provider=local if route=='local' else cloud
            if route=='cloud' and not cloud_ok: continue
            context=[{'role':m['role'],'content':m['content']} for m in history
                     if route=='local' or (turn.share_context and not m.get('private',False))]
            while sum(len(m['content']) for m in context)>3000: context.pop(0)
            messages=[{'role':'system','content':instruction(turn.language,turn.personality)},*context,{'role':'user','content':turn.text}]
            first_token=None;sent=False
            if route=='local':
                self.engine.touch();self.engine.active_requests+=1
            try:
                async for event in provider.stream(messages):
                    if event['kind']=='token':
                        sent=True
                        if first_token is None: first_token=(time.perf_counter()-started)*1000
                        yield {**event,'provider':route,'model':provider.model}
                    elif event['kind']=='final':
                        if event['tool']:
                            nonce=secrets.token_urlsafe(24)
                            self.continuations[nonce]={'expires':time.monotonic()+90,'turn':turn,'provider':provider,
                                'messages':messages,'raw':event['raw'],'call_id':event['call_id'],'tool':event['tool'],'route':route}
                            if len(self.continuations)>20: self.continuations.pop(next(iter(self.continuations)))
                        else:
                            nonce=None
                            history.extend([{'role':'user','content':turn.text,'private':turn.private},
                                            {'role':'assistant','content':event['text'],'private':turn.private}])
                            self.sessions[turn.session_id]=history
                            if len(self.sessions)>10: self.sessions.pop(next(iter(self.sessions)))
                        usage={key:value if isinstance(value,int) and 0<=value<=10_000_000 else 0 for key,value in event['usage'].items()};estimate=None
                        total_ms=(time.perf_counter()-started)*1000;self.last_latency[route]=total_ms
                        throughput=usage.get('output_tokens',0)/((total_ms-first_token)/1000) if first_token is not None and total_ms>first_token and usage.get('output_tokens',0) else None
                        if route=='cloud' and (turn.input_price or turn.output_price):
                            estimate=(usage.get('input_tokens',0)*turn.input_price+(usage.get('output_tokens',0)+usage.get('reasoning_tokens',0))*turn.output_price)/1_000_000
                            self.cost+=estimate
                        yield {'kind':'final','text':event['text'],'tool':event['tool'],'continuation':nonce,
                            'provider':route,'provider_name':provider.name,'model':provider.model,'error':None,
                            'route_reason':reason if attempt==0 else 'Previous provider failed; authorized fallback used',
                            'metrics':{'ttft_ms':first_token,'total_ms':total_ms,'tokens_per_second':throughput},
                            'usage':usage,'estimated_cost':estimate,'session_estimated_cost':self.cost,
                            'spend_warning':bool(turn.warning_budget and self.cost>=turn.warning_budget),
                            'streaming':event['streaming']}
                        return
            except (httpx.HTTPError,ProviderError,ValueError,TypeError,KeyError) as error:
                if sent:
                    reason='Provider stream was interrupted. Partial output was not mixed with a fallback.'
                    break  # Never blend partial answers from different providers.
                if attempt+1<len(order):
                    yield {'kind':'fallback','provider':order[attempt+1],'reason':'Provider unavailable; switching to the authorized fallback'}
                    continue
                reason=str(error) if isinstance(error,ProviderError) else 'AI provider unavailable or returned invalid data'
            finally:
                if route=='local': self.engine.active_requests=max(0,self.engine.active_requests-1)
        yield {'kind':'final','text':'','provider':'offline','provider_name':None,'model':None,'tool':None,
               'error':reason,'metrics':{'ttft_ms':None,'total_ms':(time.perf_counter()-started)*1000}}

    async def continue_tool(self,nonce,text,allow_cloud=False):
        started=time.perf_counter();first=None
        item=self.continuations.pop(nonce,None)
        if not item or item['expires']<time.monotonic(): raise ProviderError('Tool continuation expired')
        if item['route']=='cloud' and not allow_cloud: raise ProviderError('Sending a tool result to cloud requires separate consent')
        result={'id':item['call_id'],'name':item['tool']['name'],'text':text[:8000]}
        final=None
        if item['route']=='local': self.engine.touch();self.engine.active_requests+=1
        try:
            async for event in item['provider'].stream(item['messages'],tools=False,prior=item['raw'],result=result):
                if event['kind']=='token' and first is None:first=(time.perf_counter()-started)*1000
                if event['kind']=='final': final=event
        finally:
            if item['route']=='local': self.engine.active_requests=max(0,self.engine.active_requests-1)
        if not final: raise ProviderError('No tool-result reply returned')
        turn=item['turn'];history=self.sessions.setdefault(turn.session_id,deque(maxlen=8))
        history.extend([{'role':'user','content':turn.text,'private':turn.private},
                        {'role':'assistant','content':final['text'],'private':turn.private}])
        if len(self.sessions)>10:self.sessions.pop(next(iter(self.sessions)))
        usage={key:value if isinstance(value,int) and 0<=value<=10_000_000 else 0 for key,value in final['usage'].items()}
        estimate=None
        if item['route']=='cloud' and (turn.input_price or turn.output_price):
            estimate=(usage.get('input_tokens',0)*turn.input_price+(usage.get('output_tokens',0)+usage.get('reasoning_tokens',0))*turn.output_price)/1_000_000
            self.cost+=estimate
        return {'text':final['text'],'provider':item['route'],'provider_name':item['provider'].name,
                'model':item['provider'].model,'tool':None,'error':None,'usage':usage,
                'metrics':{'ttft_ms':first,'total_ms':(time.perf_counter()-started)*1000},
                'estimated_cost':estimate,'session_estimated_cost':self.cost,
                'spend_warning':bool(turn.warning_budget and self.cost>=turn.warning_budget)}
