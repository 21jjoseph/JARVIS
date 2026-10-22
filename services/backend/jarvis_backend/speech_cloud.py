"""Gemini speech through documented REST and Live API schemas; always opt-in."""
import asyncio
import base64
from contextlib import suppress
import json
import re
import httpx
from fastapi import WebSocket,WebSocketDisconnect
from pydantic import Field
from .contracts import StrictModel
from .intelligence import ChatProvider,check_status
from .providers import ProviderError
from websockets.asyncio.client import connect


class SpeechRequest(StrictModel):
    model:str=Field(min_length=1,max_length=150,pattern=r'^[A-Za-z0-9_.:-]+$')
    text:str=Field(default='',max_length=400)
    voice:str=Field(default='Charon',max_length=80,pattern=r'^[A-Za-z0-9_-]+$')
    vocabulary:list[str]=Field(default_factory=list,max_length=100)
    consent:bool=False
    cloud_enabled:bool=False
    local_only:bool=True
    key:str=Field(default='',max_length=512)


async def ensure_model(client,config,method,key):
    if not config.consent or not config.cloud_enabled or config.local_only:
        raise ProviderError('Cloud speech needs explicit consent and Hybrid or Cloud mode')
    if not key: raise ProviderError('Gemini API key is not configured')
    catalog=await ChatProvider('gemini',client,config.model,key=key).discover()
    model=next((model for model in catalog if model['id']==config.model),None)
    if not model or not any(method.lower() in value.lower() for value in model['methods']):
        raise ProviderError('The requested speech model or API capability is not available for this key')


async def synthesize(client:httpx.AsyncClient,config:SpeechRequest,key:str):
    await ensure_model(client,config,'generateContent',key)
    response_body=bytearray()
    async with client.stream('POST',f'https://generativelanguage.googleapis.com/v1beta/models/{config.model}:generateContent',
        headers={'x-goog-api-key':key},json={'contents':[{'parts':[{'text':config.text}]}],
        'generationConfig':{'responseModalities':['AUDIO'],'speechConfig':{'voiceConfig':{
            'prebuiltVoiceConfig':{'voiceName':config.voice}}}}}) as response:
        check_status(response)
        async for chunk in response.aiter_bytes():
            response_body.extend(chunk)
            if len(response_body)>8_000_000: raise ProviderError('Cloud speech output exceeded the audio limit')
    try:
        body=json.loads(response_body)
        audio=next(p['inlineData'] for c in body.get('candidates',[]) for p in c.get('content',{}).get('parts',[]) if 'inlineData' in p)
        data=base64.b64decode(audio['data'],validate=True);mime=audio.get('mimeType','')
        rate=int((re.search(r'rate=(\d+)',mime) or ['','24000'])[1])
        if not mime.startswith(('audio/L16','audio/pcm','audio/wav')) or rate not in (16000,22050,24000,44100,48000):
            raise ValueError('Unsupported audio format')
        if not data or len(data)>rate*2*90+4096: raise ValueError('Invalid audio duration')
        return {'audio':audio['data'],'mime':mime,'sample_rate':rate,'provider':'gemini'}
    except (ValueError,KeyError,TypeError,StopIteration):
        raise ProviderError('Cloud TTS returned an unsupported or empty audio response') from None


async def relay_live(client_ws:WebSocket,client:httpx.AsyncClient,config:SpeechRequest,connector=connect):
    await ensure_model(client,config,'bidiGenerateContent',config.key)
    if any(not word or len(word)>64 or any(ch in word for ch in '\r\n\0') for word in config.vocabulary):
        raise ProviderError('Invalid vocabulary hints')
    uri='wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
    async with connector(uri,additional_headers={'x-goog-api-key':config.key},max_size=1_000_000,
                         open_timeout=10,close_timeout=2,compression=None) as cloud:
        await cloud.send(json.dumps({'setup':{'model':'models/'+config.model,
            'generationConfig':{'responseModalities':['TEXT']},
            'inputAudioTranscription':{'languageCodes':['ro','en'],
                'customVocabulary':config.vocabulary,'mode':'VERBATIM'}}}))
        for _ in range(10):
            event=json.loads(await asyncio.wait_for(cloud.recv(),10))
            if 'error' in event: raise ProviderError('Gemini rejected the Live speech setup')
            if 'setupComplete' in event: break
        else: raise ProviderError('Gemini Live did not confirm session setup')
        await client_ws.send_json({'kind':'ready','provider':'gemini'})
        finish=asyncio.Event();segments=[];received=0
        async def upload():
            nonlocal received
            while True:
                event=await client_ws.receive()
                if event['type']=='websocket.disconnect': raise WebSocketDisconnect()
                if event.get('bytes') is not None:
                    pcm=event['bytes'];received+=len(pcm)
                    if len(pcm)>4096 or len(pcm)%2 or received>512_000: raise ProviderError('Audio packet or utterance exceeded its bound')
                    await cloud.send(json.dumps({'realtimeInput':{'audio':{
                        'data':base64.b64encode(pcm).decode(),'mimeType':'audio/pcm;rate=16000'}}}))
                elif event.get('text'):
                    if len(event['text'])>1000: raise ProviderError('Invalid speech control')
                    control=json.loads(event['text'])
                    if control.get('type')=='finish':
                        finish.set();await cloud.send(json.dumps({'realtimeInput':{'audioStreamEnd':True}}));return
                    raise ProviderError('Unknown speech control')
        async def download():
            async for raw in cloud:
                event=json.loads(raw)
                if 'error' in event: raise ProviderError('Gemini Live reported an audio-processing error')
                content=event.get('serverContent',{})
                transcript=content.get('inputTranscription')
                if transcript and isinstance(transcript.get('text'),str):
                    segments.append(transcript['text'])
                    if sum(map(len,segments))>4000: raise ProviderError('Transcript exceeded its bound')
                    await client_ws.send_json({'kind':'partial','text':''.join(segments)})
                if finish.is_set() and (content.get('turnComplete') or (transcript and transcript.get('finished'))):
                    await client_ws.send_json({'kind':'final','text':''.join(segments),'segments':segments,'provider':'gemini'});return
            raise ProviderError('Cloud transcription closed before a final result')
        up=asyncio.create_task(upload());down=asyncio.create_task(download())
        try:
            async with asyncio.timeout(45):
                done,_=await asyncio.wait([up,down],return_when=asyncio.FIRST_COMPLETED)
                for task in done: task.result()
                if down not in done: await asyncio.wait_for(down,15)
        finally:
            for task in (up,down):
                if not task.done(): task.cancel()
                with suppress(asyncio.CancelledError,WebSocketDisconnect,ProviderError): await task
