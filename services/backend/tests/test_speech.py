import asyncio
import base64
import json
import unittest
import httpx
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from jarvis_backend.app import create_app
from jarvis_backend.providers import ProviderError
from jarvis_backend.speech_cloud import SpeechRequest,synthesize,relay_live

TOKEN='speech-fixture-token-'*3

class SpeechTests(unittest.IsolatedAsyncioTestCase):
    async def test_speech_denies_upload_before_any_network_io(self):
        calls=[]
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r:calls.append(r))) as client:
            for config in [SpeechRequest(model='preferred'),SpeechRequest(model='preferred',consent=True,cloud_enabled=True,local_only=True)]:
                with self.assertRaises(ProviderError):await synthesize(client,config,'fixture-key')
            self.assertEqual(calls,[])

    async def test_tts_discovers_exact_model_and_uses_official_audio_schema(self):
        def provider(request):
            self.assertEqual(request.headers['x-goog-api-key'],'fixture-key')
            if request.method=='GET':return httpx.Response(200,json={'models':[{'name':'models/fixture-tts','supportedGenerationMethods':['generateContent']}]})
            body=json.loads(request.content)
            self.assertEqual(body['generationConfig']['responseModalities'],['AUDIO'])
            self.assertEqual(body['generationConfig']['speechConfig']['voiceConfig']['prebuiltVoiceConfig']['voiceName'],'Charon')
            self.assertEqual(body['contents'][0]['parts'][0]['text'],'Sunt Twenty One.')
            return httpx.Response(200,json={'candidates':[{'content':{'parts':[{'inlineData':{'mimeType':'audio/L16;codec=pcm;rate=24000','data':base64.b64encode(b'\0\0\1\0').decode()}}]}}]})
        async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
            config=SpeechRequest(model='fixture-tts',text='Sunt Twenty One.',consent=True,cloud_enabled=True,local_only=False)
            value=await synthesize(client,config,'fixture-key')
            self.assertEqual(value['sample_rate'],24000)
            with self.assertRaises(ProviderError):await synthesize(client,config.model_copy(update={'model':'requested-but-unavailable'}),'fixture-key')

    async def test_live_pcm_protocol_raw_transcript_and_vocabulary(self):
        sent=[];events=asyncio.Queue()
        class Cloud:
            async def __aenter__(self):return self
            async def __aexit__(self,*args):pass
            async def send(self,text):
                payload=json.loads(text);sent.append(payload)
                if payload.get('realtimeInput',{}).get('audioStreamEnd'):
                    await events.put(json.dumps({'serverContent':{'inputTranscription':{'text':'deschide CoppeliaSim.','finished':True},'turnComplete':True}}))
            async def recv(self):return json.dumps({'setupComplete':{}})
            def __aiter__(self):return self
            async def __anext__(self):return await events.get()
        def connector(uri,**kwargs):
            self.assertTrue(uri.startswith('wss://generativelanguage.googleapis.com/'))
            self.assertEqual(kwargs['additional_headers'],{'x-goog-api-key':'fixture-key'})
            return Cloud()
        received=[{'type':'websocket.receive','bytes':b'\0\0'*100},{'type':'websocket.receive','text':'{"type":"finish"}'}]
        output=[]
        class Browser:
            async def receive(self):return received.pop(0)
            async def send_json(self,value):output.append(value)
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r:httpx.Response(200,json={'models':[{'name':'models/fixture-live','supportedGenerationMethods':['bidiGenerateContent']}]}))) as client:
            await relay_live(Browser(),client,SpeechRequest(model='fixture-live',key='fixture-key',consent=True,cloud_enabled=True,local_only=False,vocabulary=['CoppeliaSim','NEMA17']),connector)
        self.assertEqual(sent[0]['setup']['inputAudioTranscription'],{'languageCodes':['ro','en'],'customVocabulary':['CoppeliaSim','NEMA17'],'mode':'VERBATIM'})
        self.assertEqual(sent[1]['realtimeInput']['audio']['mimeType'],'audio/pcm;rate=16000')
        self.assertEqual(output[-1]['text'],'deschide CoppeliaSim.')
        self.assertEqual(output[-1]['segments'],['deschide CoppeliaSim.'])

    def test_local_speech_websocket_auth_origin_and_privacy(self):
        with TestClient(create_app(TOKEN,httpx.AsyncClient(transport=httpx.MockTransport(lambda r:httpx.Response(500))))) as app:
            for headers in [{},{'Origin':'https://evil.example','Sec-WebSocket-Protocol':'21-audio, '+TOKEN}]:
                with self.assertRaises(WebSocketDisconnect):
                    with app.websocket_connect('/v2/speech/live',headers=headers):pass
            with app.websocket_connect('/v2/speech/live',subprotocols=['21-audio',TOKEN]) as ws:
                ws.send_json({'model':'preferred','key':'fixture-key','local_only':True})
                error=ws.receive_json()
                self.assertEqual(error['kind'],'error');self.assertNotIn('fixture-key',json.dumps(error))
