import json
from pathlib import Path
import struct
import tempfile
import unittest
import httpx
from fastapi.testclient import TestClient
from jarvis_backend.app import create_app
from jarvis_backend.contracts import Turn
from jarvis_backend.intelligence import choose_route
from jarvis_backend.local_engine import loopback_url
from jarvis_backend.model_setup import inspect_gguf
from jarvis_backend.identity import instruction,pronounce

HEADERS={'Authorization':'Bearer '+'v3-test-token-'*5}


def gguf(architecture='gemma4'):
    def string(value):
        data=value.encode();return struct.pack('<Q',len(data))+data
    return b'GGUF'+struct.pack('<IQQ',3,1,1)+string('general.architecture')+struct.pack('<I',8)+string(architecture)


class IntelligenceTests(unittest.TestCase):
    def app(self,handler):
        client=httpx.AsyncClient(transport=httpx.MockTransport(handler))
        return TestClient(create_app('v3-test-token-'*5,client))

    def test_router_privacy_and_structural_policy(self):
        base=dict(text='Explain the task',mode='hybrid',route='auto',cloud_enabled=True,cloud_consent=True)
        self.assertEqual(choose_route(Turn(**base),True,True)[0],'local')
        self.assertEqual(choose_route(Turn(**base,private=True),False,True)[0],'local')
        self.assertEqual(choose_route(Turn(**base,complexity='complex'),True,True)[0],'cloud')
        self.assertEqual(choose_route(Turn(**{**base,'cloud_consent':False}),False,True)[0],'local')
        self.assertEqual(choose_route(Turn(**base),False,True)[0],'cloud')

    def test_local_endpoint_rejects_remote_redirect_and_credentials(self):
        self.assertEqual(loopback_url('http://127.0.0.1:8080/'),'http://127.0.0.1:8080')
        for value in ['https://evil.example','http://169.254.169.254:80','http://user:key@localhost:8080',
                      'http://localhost:8080/private','http://localhost:8080?host=evil']:
            with self.assertRaises(ValueError): loopback_url(value)

    def test_real_provider_streams_and_bounded_context(self):
        prompts=[]
        def provider(request):
            self.assertEqual(request.url.host,'127.0.0.1')
            if request.method=='GET': return httpx.Response(200,json={'data':[{'id':'gemma-4-local'}]})
            body=json.loads(request.content);prompts.append(body['messages'])
            text='data: '+json.dumps({'choices':[{'delta':{'content':'Salut, '}}]})+'\n\n'
            text+='data: '+json.dumps({'choices':[{'delta':{'content':'sunt Twenty One.'}}]})+'\n\n'
            text+='data: '+json.dumps({'choices':[],'usage':{'prompt_tokens':20,'completion_tokens':8}})+'\n\ndata: [DONE]\n\n'
            return httpx.Response(200,text=text,headers={'content-type':'text/event-stream'})
        with self.app(provider) as app:
            turn={'text':'Salut','route':'auto','local_backend':'llama','session_id':'one','personality':'professional'}
            for text in ['Salut','What is your name?']:
                turn['text']=text
                events=[json.loads(line) for line in app.post('/v2/stream',headers=HEADERS,json=turn).text.splitlines()]
                self.assertEqual([e['text'] for e in events if e['kind']=='token'],['Salut, ','sunt Twenty One.'])
                self.assertEqual(events[-1]['provider_name'],'llama')
                self.assertEqual(events[-1]['usage']['output_tokens'],8)
            self.assertEqual(len(prompts[1]),4)
            self.assertIn('professional',prompts[1][0]['content'])

    def test_private_local_request_never_contacts_cloud(self):
        hosts=[]
        def provider(request):
            hosts.append(request.url.host)
            if request.method=='GET': return httpx.Response(503)
            return httpx.Response(500)
        with self.app(provider) as app:
            events=app.post('/v2/stream',headers={**HEADERS,'X-Cloud-Key':'fixture-key'},json={
                'text':'private notes','mode':'hybrid','route':'auto','cloud_provider':'gemini',
                'cloud_model':'gemini-3.8-flash','cloud_enabled':True,'cloud_consent':True,'private':True}).text
            self.assertNotIn('generativelanguage.googleapis.com',hosts)
            self.assertIn('offline',events)

    def test_gemini_discovery_and_function_call(self):
        def provider(request):
            if request.url.host=='127.0.0.1': return httpx.Response(503)
            self.assertEqual(request.headers['x-goog-api-key'],'fixture-key')
            if request.method=='GET': return httpx.Response(200,json={'models':[{
                'name':'models/gemini-3.8-flash','supportedGenerationMethods':['generateContent']}]})
            body=json.loads(request.content)
            if 'functionResponse' in body['contents'][-1]['parts'][0]:
                self.assertEqual(body['contents'][-2]['parts'][0]['thoughtSignature'],'opaque-fixture')
                self.assertEqual(body['contents'][-1]['parts'][0]['functionResponse']['response']['result'],'actual local result')
                return httpx.Response(200,text='data: '+json.dumps({'candidates':[{'content':{'parts':[{'text':'Confirmed from the actual result.'}]}}]})+'\n\n')
            self.assertEqual(len(body['contents']),1)
            event={'candidates':[{'content':{'parts':[{'functionCall':{'name':'open_app','args':{'app':'calculator'}},'thoughtSignature':'opaque-fixture'}]}}]}
            event['usageMetadata']={'promptTokenCount':10,'candidatesTokenCount':2,'thoughtsTokenCount':3}
            return httpx.Response(200,text='data: '+json.dumps(event)+'\n\n')
        with self.app(provider) as app:
            result=app.post('/v2/stream',headers={**HEADERS,'X-Cloud-Key':'fixture-key'},json={
                'text':'Open calculator','mode':'cloud','route':'cloud','cloud_provider':'gemini',
                'cloud_model':'gemini-3.8-flash','cloud_enabled':True,'cloud_consent':True,'input_price':1.0,'output_price':2.0})
            final=json.loads(result.text.splitlines()[-1])
            self.assertEqual(final['tool'],{'name':'open_app','arguments':{'app':'calculator'}})
            self.assertTrue(final['continuation'])
            self.assertEqual(final['usage']['reasoning_tokens'],3)
            self.assertAlmostEqual(final['estimated_cost'],20/1_000_000)
            denied=app.post('/v2/tools/continue',headers=HEADERS,json={'continuation':final['continuation'],'text':'actual local result'})
            self.assertEqual(denied.json()['provider'],'offline')
            repeated=app.post('/v2/stream',headers={**HEADERS,'X-Cloud-Key':'fixture-key'},json={'text':'Open calculator','mode':'cloud','route':'cloud','cloud_provider':'gemini','cloud_model':'gemini-3.8-flash','cloud_enabled':True,'cloud_consent':True})
            nonce=json.loads(repeated.text.splitlines()[-1])['continuation']
            approved=app.post('/v2/tools/continue',headers=HEADERS,json={'continuation':nonce,'text':'actual local result','cloud_consent':True})
            self.assertIn('Confirmed from the actual result',approved.json()['text'])

    def test_identity_pronunciation_preserves_technical_numbers(self):
        self.assertEqual(pronounce('Sunt 21. Motorul are 21 de dinți.'),'Sunt Twenty One. Motorul are 21 de dinți.')
        self.assertIn('Twenty One',instruction('ro','casual'))
        self.assertIn('professional',instruction('en','professional'))

    def test_gguf_validation_rejects_substitutions(self):
        with tempfile.TemporaryDirectory() as root:
            model=Path(root)/'model.gguf';model.write_bytes(gguf())
            self.assertEqual(inspect_gguf(model)['general.architecture'],'gemma4')
            model.write_bytes(gguf('llama'))
            with self.assertRaises(ValueError): inspect_gguf(model)

    def test_download_requires_approval_and_license(self):
        with self.app(lambda r:httpx.Response(500)) as app:
            response=app.post('/v2/local',headers=HEADERS,json={'action':'install','value':'none','directory':'/tmp'})
            self.assertEqual(response.status_code,400)
            self.assertIn('approval',response.text)

    def test_private_history_is_excluded_even_when_later_context_sharing_is_allowed(self):
        cloud_bodies=[]
        def provider(request):
            cloud=request.url.host=='generativelanguage.googleapis.com'
            if request.method=='GET':
                return httpx.Response(200,json={'models':[{'name':'models/gemini-3.8-flash','supportedGenerationMethods':['generateContent']}]} if cloud else {'data':[{'id':'gemma-4-local'}]})
            body=json.loads(request.content)
            if cloud:cloud_bodies.append(body)
            event={'candidates':[{'content':{'parts':[{'text':'Public answer'}]}}]} if cloud else {'choices':[{'delta':{'content':'local reply'}}]}
            return httpx.Response(200,text='data: '+json.dumps(event)+'\n\n')
        with self.app(provider) as app:
            base={'session_id':'context','local_backend':'llama','cloud_provider':'gemini','cloud_model':'gemini-3.8-flash','text':'PRIVATE-SECRET','private':True}
            app.post('/v2/stream',headers=HEADERS,json=base)
            app.post('/v2/stream',headers=HEADERS,json={**base,'private':False,'text':'public local context'})
            cloud={**base,'mode':'cloud','route':'cloud','private':False,'cloud_enabled':True,'cloud_consent':True,'text':'cloud question'}
            app.post('/v2/stream',headers={**HEADERS,'X-Cloud-Key':'fixture-key'},json=cloud)
            app.post('/v2/stream',headers={**HEADERS,'X-Cloud-Key':'fixture-key'},json={**cloud,'share_context':True})
            self.assertEqual(len(cloud_bodies[0]['contents']),1)
            self.assertIn('public local context',json.dumps(cloud_bodies[1]))
            self.assertNotIn('PRIVATE-SECRET',json.dumps(cloud_bodies))

    def test_cloud_failure_falls_back_once_to_local(self):
        generations=[]
        def provider(request):
            cloud=request.url.host=='generativelanguage.googleapis.com'
            if request.method=='GET':return httpx.Response(200,json={'models':[{'name':'models/gemini-3.8-flash','supportedGenerationMethods':['generateContent']}]} if cloud else {'data':[{'id':'gemma-4-local'}]})
            generations.append(request.url.host)
            if cloud:return httpx.Response(429,text='secret-provider-body')
            return httpx.Response(200,text='data: '+json.dumps({'choices':[{'delta':{'content':'Local fallback answer'}}]})+'\n\n')
        with self.app(provider) as app:
            response=app.post('/v2/stream',headers={**HEADERS,'X-Cloud-Key':'fixture-key'},json={'text':'complex technical request','mode':'cloud','route':'cloud','local_backend':'llama','cloud_provider':'gemini','cloud_model':'gemini-3.8-flash','cloud_enabled':True,'cloud_consent':True})
            events=[json.loads(line) for line in response.text.splitlines()]
            self.assertEqual(events[-1]['provider'],'local');self.assertIn('fallback',[e['kind'] for e in events])
            self.assertEqual(generations,['generativelanguage.googleapis.com','127.0.0.1'])
            self.assertNotIn('secret-provider-body',response.text)

    def test_v2_cancel_releases_stream_and_tool_followup(self):
        import asyncio
        from jarvis_backend.providers import ProviderError
        async def check():
            started=asyncio.Event()
            async def provider(request):
                if request.method=='GET':return httpx.Response(200,json={'data':[{'id':'gemma-4-local'}]})
                started.set();await asyncio.sleep(30)
                return httpx.Response(200,text='data: {}\n\n')
            provider_client=httpx.AsyncClient(transport=httpx.MockTransport(provider))
            application=create_app('v3-test-token-'*5,provider_client)
            async with application.router.lifespan_context(application):
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=application),base_url='http://test',headers=HEADERS) as app:
                    task=asyncio.create_task(app.post('/v2/stream',json={'text':'wait','local_backend':'llama'}))
                    await asyncio.wait_for(started.wait(),2)
                    self.assertEqual((await app.post('/v2/stream',json={'text':'conflict'})).status_code,409)
                    await app.post('/v1/cancel',json={})
                    self.assertIn('cancelled',(await asyncio.wait_for(task,2)).text)
                    # Also cover the non-streaming tool-result continuation endpoint.
                    started.clear()
                    async def continuation(*_args):started.set();await asyncio.sleep(30);raise ProviderError('late')
                    application.state.intelligence.continue_tool=continuation
                    task=asyncio.create_task(app.post('/v2/tools/continue',json={'continuation':'x'*30,'text':'actual local result'}))
                    await asyncio.wait_for(started.wait(),2);await app.post('/v1/cancel',json={})
                    self.assertIn('actual local result',(await asyncio.wait_for(task,2)).json()['text'])
                    self.assertEqual((await app.get('/v1/health')).status_code,200)
            await provider_client.aclose()
        asyncio.run(check())

    def test_hybrid_uses_measured_latency_and_configured_spending_warning(self):
        def provider(request):
            cloud=request.url.host=='generativelanguage.googleapis.com'
            if request.method=='GET':return httpx.Response(200,json={'models':[{'name':'models/gemini-3.8-flash','supportedGenerationMethods':['generateContent']}]} if cloud else {'data':[{'id':'gemma-4-local'}]})
            event={'candidates':[{'content':{'parts':[{'text':'Cloud answer'}]}}]} if cloud else {'choices':[{'delta':{'content':'Local answer'}}]}
            return httpx.Response(200,text='data: '+json.dumps(event)+'\n\n')
        with self.app(provider) as app:
            core=app.app.state.intelligence;core.last_latency={'local':16000,'cloud':500}
            base={'text':'A routine request','route':'auto','mode':'hybrid','local_backend':'llama','cloud_provider':'gemini','cloud_model':'gemini-3.8-flash','cloud_enabled':True,'cloud_consent':True}
            response=app.post('/v2/stream',headers={**HEADERS,'X-Cloud-Key':'fixture-key'},json=base)
            self.assertEqual(json.loads(response.text.splitlines()[-1])['provider'],'cloud')
            core.last_latency={'local':16000,'cloud':500};core.cost=2
            response=app.post('/v2/stream',headers={**HEADERS,'X-Cloud-Key':'fixture-key'},json={**base,'warning_budget':1.0})
            final=json.loads(response.text.splitlines()[-1]);self.assertEqual(final['provider'],'local');self.assertIn('spending',final['route_reason'])
