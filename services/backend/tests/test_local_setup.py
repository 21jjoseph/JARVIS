import asyncio
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import httpx
from jarvis_backend.local_engine import LocalEngine
from jarvis_backend.model_setup import ModelSetup
from test_intelligence import gguf

class LocalSetupTests(unittest.IsolatedAsyncioTestCase):
    async def test_release_preview_hash_install_and_duplicate_prevention(self):
        content=gguf();checksum=hashlib.sha256(content).hexdigest();downloads=[]
        def provider(request):
            if '/api/models/' in request.url.path:return httpx.Response(200,json={'sha':'a'*40,'cardData':{'license':'gemma'},'siblings':[{'rfilename':'fixture-QAT-Q4_0.gguf','lfs':{'size':len(content),'sha256':checksum}}]})
            downloads.append(str(request.url));return httpx.Response(200,content=content)
        async with httpx.AsyncClient(transport=httpx.MockTransport(provider)) as client:
            setup=ModelSetup(client)
            release=(await setup.preview('google/fixture-gemma-4-E2B-GGUF'))[0]
            self.assertEqual(release['revision'],'a'*40);self.assertTrue(release['preferred'])
            with tempfile.TemporaryDirectory() as root:
                await setup.install(release['id'],root,True,True);await setup.task
                self.assertIsNone(setup.progress['error']);self.assertTrue(Path(setup.progress['path']).exists())
                await setup.install(release['id'],root,True,True)
                self.assertEqual(len(downloads),1);self.assertIn('skipped',setup.progress['message'])
                self.assertIn('/'+'a'*40+'/',downloads[0])

    async def test_bad_model_hash_does_not_activate_or_delete_existing_partial_files(self):
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r:httpx.Response(200,content=gguf()))) as client:
            setup=ModelSetup(client);setup.previews['fixture']={'bytes':len(gguf()),'sha256':'0'*64,'filename':'model.gguf','repository':'google/fixture','revision':'a'*40}
            with tempfile.TemporaryDirectory() as root:
                other=Path(root)/'model.gguf.part';other.write_text('a previous user download')
                await setup.install('fixture',root,True,True);await setup.task
                self.assertIsNotNone(setup.progress['error']);self.assertFalse((Path(root)/'model.gguf').exists())
                self.assertEqual(other.read_text(),'a previous user download')
                self.assertEqual(list(Path(root).glob('*.part.*')),[])

    async def test_owned_process_has_one_load_and_no_cloud_keys_or_key_arguments(self):
        external=LocalEngine(external_key='fixture-local-key')
        self.assertEqual(external.headers('http://127.0.0.1:8080'),{'Authorization':'Bearer fixture-local-key'})
        self.assertEqual(external.headers('http://127.0.0.1:9999'),{})
        calls=[];probes=0
        class Process:
            returncode=None;pid=12345
            def terminate(self):self.returncode=0
            def kill(self):self.returncode=-9
            async def wait(self):return self.returncode
            async def communicate(self):return b'1234 2.0',b''
        process=Process()
        async def spawn(*args,**kwargs):
            if args[0]=='ps':return Process()
            calls.append((args,kwargs));return process
        class Client:
            def __init__(self,**_kwargs):pass
            async def __aenter__(self):return self
            async def __aexit__(self,*_args):pass
            async def get(self,*args,**kwargs):
                nonlocal probes
                probes+=1
                if probes==1:raise httpx.ConnectError('unused endpoint')
                return httpx.Response(200)
        with tempfile.TemporaryDirectory() as root:
            binary=Path(root)/'llama-server';binary.touch();model=Path(root)/'gemma.gguf';model.write_bytes(gguf())
            engine=LocalEngine(str(binary))
            with patch('jarvis_backend.local_engine.asyncio.create_subprocess_exec',spawn),patch('jarvis_backend.local_engine.httpx.AsyncClient',Client),patch.dict('os.environ',{'GEMINI_API_KEY':'never-in-child'}):
                self.assertTrue((await engine.start(str(model)))['running'])
                self.assertTrue((await engine.start(str(model)))['running']);self.assertEqual(len(calls),1)
                args,kwargs=calls[0]
                self.assertNotIn('GEMINI_API_KEY',kwargs['env']);self.assertNotIn(kwargs['env']['LLAMA_API_KEY'],args)
                self.assertEqual(args[args.index('--n-gpu-layers')+1],'0');self.assertEqual(args[args.index('--parallel')+1],'1')
                await engine.stop();self.assertFalse((await engine.status())['running']);self.assertEqual(engine.key,'')
