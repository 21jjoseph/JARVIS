"""Discover official releases and install only explicitly approved GGUF files."""
import asyncio
import hashlib
import json
from pathlib import Path
import re
import secrets
import shutil
import struct
from urllib.parse import quote,urlsplit
import httpx


def inspect_gguf(path: Path):
    with path.open('rb') as file:
        if file.read(4)!=b'GGUF': raise ValueError('Not a GGUF model')
        header=file.read(20)
        if len(header)!=20: raise ValueError('Truncated GGUF header')
        version,tensors,entries=struct.unpack('<IQQ',header)
        if version not in (2,3) or entries>100_000 or tensors==0: raise ValueError('Invalid GGUF metadata')
        def integer():
            data=file.read(8)
            if len(data)!=8: raise ValueError('Truncated GGUF metadata')
            return struct.unpack('<Q',data)[0]
        def kind_value():
            data=file.read(4)
            if len(data)!=4:raise ValueError('Truncated GGUF metadata type')
            return struct.unpack('<I',data)[0]
        def string():
            size=integer()
            if size>1_000_000: raise ValueError('GGUF string is too large')
            data=file.read(size)
            if len(data)!=size: raise ValueError('Truncated GGUF string')
            return data.decode('utf8',errors='strict')
        sizes={0:1,1:1,2:2,3:2,4:4,5:4,6:4,7:1,10:8,11:8,12:8}
        def skip(kind,depth=0):
            if depth>2: raise ValueError('Nested GGUF array exceeds limit')
            if kind==8: string()
            elif kind==9:
                data=file.read(4)
                if len(data)!=4: raise ValueError('Truncated GGUF array')
                sub=struct.unpack('<I',data)[0];count=integer()
                if count>1_000_000: raise ValueError('GGUF array exceeds limit')
                if sub in sizes: file.seek(sizes[sub]*count,1)
                else:
                    for _ in range(count): skip(sub,depth+1)
            elif kind in sizes: file.seek(sizes[kind],1)
            else: raise ValueError('Unknown GGUF metadata type')
        metadata={}
        for _ in range(entries):
            key=string();kind=kind_value()
            if key in ('general.architecture','general.name','general.basename','general.size_label') and kind==8:
                metadata[key]=string()
            elif key=='general.file_type' and kind==4:
                metadata[key]=kind_value()
            else: skip(kind)
            if file.tell()>32_000_000: break
        if metadata.get('general.architecture')!='gemma4':
            raise ValueError('This update requires a Gemma 4 GGUF; no substitute model was activated')
        return {'version':version,'tensors':tensors,**metadata}


def file_hash(path):
    digest=hashlib.sha256()
    with Path(path).open('rb') as file:
        for chunk in iter(lambda:file.read(1024*1024),b''): digest.update(chunk)
    return digest.hexdigest()


class ModelSetup:
    def __init__(self,client:httpx.AsyncClient):
        self.client=client
        self.previews={}
        self.progress={'active':False,'bytes':0,'total':0,'message':'','path':'','error':None}
        self.task:asyncio.Task|None=None

    async def discover(self):
        # Resolve real repository IDs from the official organization; never guess one.
        response=await self.client.get('https://huggingface.co/api/models',params={
            'author':'google','search':'gemma-4','limit':100},timeout=20)
        response.raise_for_status()
        data=response.json()
        if not isinstance(data,list): raise ValueError('Invalid official model catalog')
        return [{'id':m['id'],'gated':m.get('gated',False)} for m in data if isinstance(m,dict)
            and re.fullmatch(r'google/[A-Za-z0-9._-]+',m.get('id',''))
            and 'gguf' in m['id'].lower() and any(v in m['id'].lower() for v in ('e2b','e4b'))]

    async def preview(self,repo:str):
        if not re.fullmatch(r'google/[A-Za-z0-9._-]+',repo): raise ValueError('Choose an official Google repository')
        response=await self.client.get('https://huggingface.co/api/models/'+repo,params={'blobs':'true'},timeout=20)
        response.raise_for_status();metadata=response.json()
        revision=metadata.get('sha','')
        if not re.fullmatch(r'[a-f0-9]{40}',revision): raise ValueError('No immutable model revision was provided')
        card=metadata.get('cardData') or {}
        files=[]
        for entry in metadata.get('siblings',[]):
            name=entry.get('rfilename','');lfs=entry.get('lfs') or {}
            checksum=lfs.get('sha256','');size=lfs.get('size')
            if not name.lower().endswith('.gguf') or 'mmproj' in name.lower(): continue
            if not re.fullmatch(r'[a-f0-9]{64}',checksum) or not isinstance(size,int) or size<=0: continue
            if any(p in ('..','') for p in name.split('/')) or name.startswith('/'): continue
            # Show actual quantizations. QAT must be stated by the official release.
            token=secrets.token_urlsafe(24)
            item={'id':token,'repository':repo,'revision':revision,'filename':name,'bytes':size,
                  'sha256':checksum,'license':card.get('license','Review the official model card'),
                  'model_card':'https://huggingface.co/'+repo,'gated':metadata.get('gated',False),
                  'preferred':('qat' in (repo+' '+name).lower() and 'q4_0' in name.lower())}
            self.previews[token]=item;files.append(item)
        self.previews=dict(list(self.previews.items())[-100:])
        return files

    async def import_file(self,path:str):
        file=Path(path).expanduser().resolve(strict=True)
        if not file.is_file() or file.suffix.lower()!='.gguf': raise ValueError('Choose a GGUF file')
        metadata=await asyncio.to_thread(inspect_gguf,file)
        digest=await asyncio.to_thread(file_hash,file)
        return {'path':str(file),'bytes':file.stat().st_size,'sha256':digest,'metadata':metadata,
                'source_verified':False,'message':'GGUF header/architecture checked and file hashed; source authenticity and inference are unverified.'}

    async def install(self,preview_id:str,directory:str,approved:bool,license_accepted:bool):
        if not approved or not license_accepted: raise ValueError('Explicit download approval and license acceptance are required')
        if self.task and not self.task.done(): raise ValueError('A model download is already running')
        item=self.previews.get(preview_id)
        if not item: raise ValueError('Model preview expired; refresh the official release metadata')
        root=Path(directory).expanduser().resolve();root.mkdir(parents=True,exist_ok=True)
        if shutil.disk_usage(root).free<item['bytes']+2*1024**3: raise ValueError('Keep at least 2 GiB free in addition to the model download size')
        target=root/Path(item['filename']).name
        if target.is_symlink(): raise ValueError('Model target cannot be a symbolic link')
        if target.exists():
            if target.stat().st_size==item['bytes'] and await asyncio.to_thread(file_hash,target)==item['sha256']:
                self.progress={'active':False,'bytes':item['bytes'],'total':item['bytes'],'message':'Verified existing model; download skipped','path':str(target),'error':None}
                return self.progress
            raise ValueError('A different file already uses this name; select another directory')
        self.progress={'active':True,'bytes':0,'total':item['bytes'],'message':'Downloading verified release','path':str(target),'error':None}
        self.task=asyncio.create_task(self._download(item,target))
        return self.progress

    async def _download(self,item,target):
        part=target.with_suffix(target.suffix+'.part.'+secrets.token_hex(8))
        digest=hashlib.sha256();received=0
        url=f"https://huggingface.co/{item['repository']}/resolve/{item['revision']}/{quote(item['filename'],safe='/')}"
        try:
            # Credentials must never be forwarded to a CDN or written to disk.
            for _ in range(6):
                response=await self.client.send(self.client.build_request('GET',url),stream=True)
                if response.is_redirect:
                    destination=response.headers.get('location','');await response.aclose()
                    host=urlsplit(destination).hostname or ''
                    if not destination.startswith('https://') or not (host=='huggingface.co' or host.endswith('.hf.co') or host.endswith('.huggingface.co')):
                        raise ValueError('The model host returned an unsupported download redirect')
                    url=destination;continue
                response.raise_for_status();break
            else: raise ValueError('Too many model download redirects')
            try:
                with part.open('xb') as file:
                    async for chunk in response.aiter_bytes(1024*1024):
                        received+=len(chunk)
                        if received>item['bytes']: raise ValueError('Model download exceeded the approved size')
                        digest.update(chunk);file.write(chunk);self.progress['bytes']=received
            finally: await response.aclose()
            if received!=item['bytes'] or digest.hexdigest()!=item['sha256']: raise ValueError('Model SHA256 or size verification failed')
            metadata=await asyncio.to_thread(inspect_gguf,part)
            if target.exists():raise ValueError('The model target appeared during download; no existing file was replaced')
            part.rename(target)
            target.with_suffix('.verified.json').write_text(json.dumps({**item,'metadata':metadata},indent=2)+'\n')
            self.progress.update(active=False,message='Gemma 4 model verified and installed',error=None)
        except asyncio.CancelledError:
            self.progress.update(active=False,message='Download cancelled');part.unlink(missing_ok=True)
        except (OSError,ValueError,httpx.HTTPError):
            self.progress.update(active=False,error='Model download or integrity verification failed. Review source access, license and available disk space.');part.unlink(missing_ok=True)

    async def cancel(self):
        if self.task and not self.task.done(): self.task.cancel();await self.task
