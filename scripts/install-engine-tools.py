"""Install hash-pinned build tools, checking Mac binaries before installation."""
import importlib.util
from pathlib import Path
import platform
import subprocess
import sys
import zipfile
ROOT=Path(__file__).resolve().parents[1]
cache=ROOT/'.cache/engine-tool-wheels';cache.mkdir(parents=True,exist_ok=True)
lock=ROOT/'configs/engine-tools.lock'
flags=['--disable-pip-version-check','--cache-dir',str(ROOT/'.cache/pip'),
       '--require-hashes','--only-binary=:all:','-r',str(lock)]
subprocess.run([sys.executable,'-m','pip','download',*flags,'--dest',str(cache)],check=True)
if sys.platform=='darwin':
    if platform.machine()!='x86_64':raise SystemExit('This build targets Intel x86_64.')
    spec=importlib.util.spec_from_file_location('audit',ROOT/'scripts/check-macos-artifacts.py')
    audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
    checked=0
    for wheel in cache.glob('*.whl'):
        with zipfile.ZipFile(wheel) as archive:
            for name in archive.namelist():
                if name.endswith('/'):continue
                data=archive.read(name)
                if data[:4] in (b'\xcf\xfa\xed\xfe',b'\xca\xfe\xba\xbe',b'\xca\xfe\xba\xbf'):
                    targets=audit.targets(data)
                    assert targets and max(targets)<=(12,0,0),f'{name} is not compatible with Intel Monterey: {targets}'
                    checked+=1
    assert checked,'No native build tool binaries were verified'
    print('Build-tool Mac native binaries verified:',checked)
subprocess.run([sys.executable,'-m','pip','install',*flags,'--no-index','--find-links',str(cache)],check=True)
