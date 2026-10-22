"""Stage checksum-pinned relocatable Python and hash-locked wheels for packaging.

Linux can stage Intel macOS without executing Darwin code. Native Mach-O targets
are audited before the bundle is accepted; this does not replace a Monterey run.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--mac', action='store_true')
parser.add_argument('--win', action='store_true')
args = parser.parse_args()
mac = args.mac or (sys.platform == 'darwin' and not args.win)
win = args.win or (sys.platform == 'win32' and not args.mac)
target = 'mac' if mac else 'win' if win else 'linux'
pin_file = 'configs/python-runtime.json' if mac else 'configs/python-runtime-windows.json' if win else 'configs/python-runtime-linux.json'
pin = json.loads((ROOT / pin_file).read_text())
base = ROOT / '.cache/backend-bundle' / target
archive = ROOT / '.cache/toolchains' / f'python-{target}-x64.tar.gz'
archive.parent.mkdir(parents=True,exist_ok=True)
if not archive.exists() or hashlib.sha256(archive.read_bytes()).hexdigest() != pin['sha256']:
    with urllib.request.urlopen(pin['url'],timeout=120) as response, archive.open('wb') as out:
        shutil.copyfileobj(response,out)
assert hashlib.sha256(archive.read_bytes()).hexdigest() == pin['sha256'], 'Python SHA256 mismatch'
fingerprint = hashlib.sha256((ROOT/'services/backend/requirements.lock').read_bytes()+pin['sha256'].encode()).hexdigest()
stamp = base/'.jarvis-bundle'
if not stamp.exists() or stamp.read_text() != fingerprint:
    if base.exists(): shutil.rmtree(base)
    base.mkdir(parents=True)
    with tarfile.open(archive) as compressed:
        compressed.extractall(base,filter='data')
    site = base/('python/Lib/site-packages' if win else 'python/lib/python3.12/site-packages')
    subprocess.run([sys.executable,'-m','pip','install','--disable-pip-version-check',
                    '--cache-dir',str(ROOT/'.cache/pip'),'--require-hashes','--only-binary=:all:',
                    '--platform','macosx_12_0_x86_64' if mac else 'win_amd64' if win else 'manylinux2014_x86_64',
                    '--python-version','312','--implementation','cp','--abi','cp312',
                    '--target',str(site),'--upgrade','--no-compile',
                    '-r',str(ROOT/'services/backend/requirements.lock')],check=True)
    stamp.write_text(fingerprint)
# Include only a native engine built and receipted for the packaging platform.
engine=ROOT/'.cache/local-engine/build/bin'/('llama-server.exe' if win else 'llama-server')
receipt=ROOT/'.cache/local-engine/installed.json'
engine_target=base/('python/llama-server.exe' if win else 'python/bin/llama-server')
if engine.is_file() and receipt.is_file() and ((mac and sys.platform=='darwin') or (win and sys.platform=='win32') or (not mac and not win and sys.platform=='linux')):
    record=json.loads(receipt.read_text())
    pin_engine=json.loads((ROOT/'configs/local-engine.json').read_text())
    assert record['revision']==pin_engine['revision'] and record['platform']==sys.platform
    assert hashlib.sha256(engine.read_bytes()).hexdigest()==record['sha256'],'Local engine receipt mismatch'
    shutil.copy2(engine,engine_target)
    print('Included the native CPU engine; no weights are bundled.')
if mac:
    spec = importlib.util.spec_from_file_location('audit',ROOT/'scripts/check-macos-artifacts.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    report=[]
    for file in sorted((base/'python').rglob('*')):
        if not file.is_file() or file.is_symlink(): continue
        with file.open('rb') as handle: header=handle.read(4)
        if header not in (b'\xcf\xfa\xed\xfe',b'\xca\xfe\xba\xbe',b'\xca\xfe\xba\xbf'): continue
        versions=module.targets(file.read_bytes())
        assert versions and max(versions)<=(12,0,0), f'{file}: incompatible Intel deployment target {versions}'
        report.append({'file':str(file.relative_to(base)),'minimum':list(max(versions))})
    assert report, 'No Python Mach-O binaries audited'
    (base/'audit.json').write_text(json.dumps(report,indent=2)+'\n')
    print(f'Intel macOS bundle: {len(report)} native binaries passed Monterey deployment-target checks.')
elif not win:
    subprocess.run([str(base/'python/bin/python3.12'),'-c',
                    'import fastapi,pydantic,httpx,uvicorn,wsproto,websockets; print("Relocatable Linux backend imports passed")'],check=True)
print(f'Backend bundle ready: {base}')
