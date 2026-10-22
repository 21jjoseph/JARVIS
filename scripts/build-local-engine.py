"""Build the pinned CPU inference engine. Never downloads model weights."""
import hashlib
import argparse
import importlib.util
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
pin = json.loads((ROOT/'configs/local-engine.json').read_text())
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--cache',default=str(ROOT/'.cache/local-engine'))
args=parser.parse_args()
cache=Path(args.cache).expanduser().resolve()
cache.mkdir(parents=True,exist_ok=True)
archive = cache/'source.tar.gz'
if not archive.exists() or hashlib.sha256(archive.read_bytes()).hexdigest()!=pin['sha256']:
    with urllib.request.urlopen(pin['source_url'],timeout=120) as response, archive.open('wb') as out:
        shutil.copyfileobj(response,out)
assert hashlib.sha256(archive.read_bytes()).hexdigest()==pin['sha256'], 'llama.cpp source checksum failed'
source = cache/('llama.cpp-'+pin['revision'])
if not source.exists():
    with tarfile.open(archive) as compressed: compressed.extractall(cache,filter='data')
candidate = Path(sys.executable).parent/('cmake.exe' if sys.platform=='win32' else 'cmake')
if not candidate.is_file(): raise SystemExit('Pinned CMake 3.31.6 is needed. Run npm run engine:tools first.')
cmake=str(candidate)
if sys.platform=='darwin':
    if platform.machine()!='x86_64': raise SystemExit('This configuration targets Intel x86_64 Macs.')
    subprocess.run(['/usr/bin/xcode-select','-p'],check=True,stdout=subprocess.DEVNULL)
build = cache/'build'
flags=['-DCMAKE_BUILD_TYPE=Release','-DBUILD_SHARED_LIBS=OFF','-DGGML_NATIVE=ON',
       '-DLLAMA_BUILD_NUMBER=0','-DLLAMA_BUILD_COMMIT='+pin['revision'],
       '-DGGML_METAL=OFF','-DGGML_ACCELERATE=OFF','-DGGML_OPENMP=OFF',
       '-DLLAMA_OPENSSL=OFF','-DLLAMA_SUBPROCESS=OFF','-DLLAMA_BUILD_TESTS=OFF',
       '-DLLAMA_BUILD_EXAMPLES=OFF','-DLLAMA_BUILD_TOOLS=ON','-DLLAMA_BUILD_SERVER=ON',
       '-DLLAMA_BUILD_APP=OFF','-DLLAMA_BUILD_UI=OFF','-DLLAMA_USE_PREBUILT_UI=OFF',
       '-DGGML_CCACHE=OFF']
if sys.platform=='darwin':
    flags+=['-DCMAKE_OSX_DEPLOYMENT_TARGET=12.0','-DCMAKE_OSX_ARCHITECTURES=x86_64',
            '-DCMAKE_CXX_FLAGS=-Werror=unguarded-availability-new -Werror=unguarded-availability']
# TLS stays enabled in the Python downloader/provider. The loopback-only engine
# has no need for a native OpenSSL dependency or model-download endpoints.
subprocess.run([cmake,'-S',str(source),'-B',str(build),*flags],check=True)
subprocess.run([cmake,'--build',str(build),'--target','llama-server','--parallel','2'],check=True)
binary=build/'bin'/('llama-server.exe' if sys.platform=='win32' else 'llama-server')
subprocess.run([str(binary),'--version'],check=True)
if sys.platform=='darwin':
    spec=importlib.util.spec_from_file_location('audit',ROOT/'scripts/check-macos-artifacts.py')
    audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
    targets=audit.targets(binary.read_bytes())
    assert targets and max(targets)<=(12,0,0), f'Engine requires newer macOS: {targets}'
    print('Intel deployment target verified:',max(targets))
(cache/'installed.json').write_text(json.dumps({'revision':pin['revision'],'binary':str(binary),
  'sha256':hashlib.sha256(binary.read_bytes()).hexdigest(),'platform':sys.platform,
  'native_monterey_execution':False},indent=2)+'\n')
print('CPU-only engine built. No language model was downloaded:',binary)
