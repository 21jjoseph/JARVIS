import asyncio
import json
import unittest
import httpx
from fastapi.testclient import TestClient
from jarvis_backend.app import create_app

TOKEN = 'test-session-token-' * 4
HEADERS = {'Authorization': 'Bearer ' + TOKEN}


class ServiceTests(unittest.TestCase):
    def client(self, handler):
        return TestClient(create_app(TOKEN, httpx.AsyncClient(transport=httpx.MockTransport(handler))))

    def test_auth_origin_and_size_boundaries(self):
        with self.client(lambda r: httpx.Response(200,json={})) as app:
            self.assertEqual(app.get('/v1/health').status_code,401)
            self.assertEqual(app.get('/v1/health',headers={b'Authorization':b'Bearer '+bytes([255])}).status_code,401)
            self.assertEqual(app.get('/v1/health',headers={**HEADERS,'Origin':'http://evil.example'}).status_code,401)
            self.assertEqual(app.get('/v1/health',headers=HEADERS).json()['status'],'ready')
            self.assertEqual(app.post('/v1/turn',headers=HEADERS,content='x'*20_001).status_code,413)
            response = app.post('/v1/turn',headers=HEADERS,json={'text':'private prompt','shell':'whoami'})
            self.assertEqual(response.status_code,422)
            self.assertNotIn('private prompt',response.text)

    def test_local_conversation_and_structured_tool(self):
        calls=[]
        def provider(request):
            calls.append(request)
            body=json.loads(request.content)
            self.assertEqual(body['model'],'qwen2.5:3b')
            self.assertEqual(len(body['messages']),2)
            self.assertNotIn('Authorization',request.headers)
            return httpx.Response(200,json={'message':{'content':'','tool_calls':[{'function':{
                'name':'open_app','arguments':{'app':'calculator'}}}]}})
        with self.client(provider) as app:
            value=app.post('/v1/turn',headers=HEADERS,json={'text':'Open calculator','local_model':'qwen2.5:3b'}).json()
            self.assertEqual(value['tool'],{'name':'open_app','arguments':{'app':'calculator'}})
            self.assertEqual(value['provider'],'local')
            self.assertEqual(calls[0].url.host,'127.0.0.1')

    def test_cloud_requires_per_turn_consent_and_key(self):
        calls=[]
        def provider(request):
            calls.append(request)
            self.assertEqual(request.url.host,'api.openai.com')
            self.assertEqual(request.headers['Authorization'],'Bearer fixture-key')
            return httpx.Response(200,json={'choices':[{'message':{'content':'A concise answer.'}}]})
        with self.client(provider) as app:
            turn={'text':'Explain a motor','route':'cloud'}
            self.assertIn('consent',app.post('/v1/turn',headers=HEADERS,json=turn).json()['error'])
            self.assertEqual(calls,[])
            turn['cloud_consent']=True
            self.assertIn('API key',app.post('/v1/turn',headers=HEADERS,json=turn).json()['error'])
            self.assertEqual(calls,[])
            reply=app.post('/v1/turn',headers={**HEADERS,'X-Cloud-Key':'fixture-key'},json=turn).json()
            self.assertEqual(reply['text'],'A concise answer.')
            self.assertEqual(len(calls),1)

    def test_offline_never_falls_back_to_cloud(self):
        calls=[]
        def provider(request):
            calls.append(str(request.url))
            raise httpx.ConnectError('connection failed')
        with self.client(provider) as app:
            value=app.post('/v1/turn',headers=HEADERS,json={'text':'Hello AI','local_model':'missing'}).json()
            self.assertEqual(value['provider'],'offline')
            self.assertEqual(calls,['http://127.0.0.1:11434/api/chat'])
            self.assertIsNone(value['tool'])

    def test_invalid_or_hostile_actions_never_execute(self):
        for function in [{'name':'shell','arguments':{'command':'touch /tmp/forbidden'}},
                         {'name':'open_folder','arguments':{'folder':'/etc'}},
                         {'name':'system_info','arguments':{'unexpected':True}}]:
            with self.subTest(function=function), self.client(lambda r: httpx.Response(200,json={
                    'message':{'tool_calls':[{'function':function}]}})) as app:
                reply=app.post('/v1/turn',headers=HEADERS,json={'text':'test','local_model':'model'}).json()
                self.assertEqual(reply['provider'],'offline')
                self.assertIsNone(reply['tool'])

    def test_provider_errors_and_oversized_responses_are_redacted(self):
        for response in [httpx.Response(401,text='secret-provider-body'),httpx.Response(429),
                         httpx.Response(200,content=b'x'*128_001),httpx.Response(200,text='not-json')]:
            with self.client(lambda r: response) as app:
                value=app.post('/v1/turn',headers=HEADERS,json={'text':'test','local_model':'model'}).json()
                self.assertEqual(value['provider'],'offline')
                self.assertNotIn('secret-provider-body',json.dumps(value))

    def test_models_and_websocket_lifecycle(self):
        def provider(request):
            if request.url.path.endswith('/tags'):
                return httpx.Response(200,json={'models':[{'name':'test-model'}]})
            return httpx.Response(200,json={'message':{'content':'Local answer'}})
        with self.client(provider) as app:
            self.assertEqual(app.get('/v1/models',headers=HEADERS).json()['models'],['test-model'])
            with app.websocket_connect('/v1/events',headers=HEADERS) as ws:
                ws.send_json({'text':'Explain torque','local_model':'test-model'})
                self.assertEqual(ws.receive_json(),{'event':'thinking'})
                self.assertEqual(ws.receive_json()['data']['text'],'Local answer')

    def test_cancel_releases_the_provider_for_next_turn(self):
        started=asyncio.Event()
        async def provider(request):
            started.set()
            await asyncio.sleep(30)
            return httpx.Response(200,json={'message':{'content':'late'}})
        async def check():
            provider_client=httpx.AsyncClient(transport=httpx.MockTransport(provider))
            application=create_app(TOKEN,provider_client)
            async with application.router.lifespan_context(application):
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=application),base_url='http://test',headers=HEADERS) as app:
                    task=asyncio.create_task(app.post('/v1/turn',json={'text':'test','local_model':'model'}))
                    await asyncio.wait_for(started.wait(),2)
                    conflict=await app.post('/v1/turn',json={'text':'second','local_model':'model'})
                    self.assertEqual(conflict.status_code,409)
                    self.assertTrue((await app.post('/v1/cancel',json={})).json()['cancelled'])
                    reply=(await asyncio.wait_for(task,2)).json()
                    self.assertEqual(reply['error'],'AI request cancelled.')
                    following=await app.post('/v1/turn',json={'text':'third'})
                    self.assertNotEqual(following.status_code,409)
            await provider_client.aclose()
        asyncio.run(check())


if __name__ == '__main__':
    unittest.main()
