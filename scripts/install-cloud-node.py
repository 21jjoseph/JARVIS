"""Install the pinned official Linux Node toolchain inside this checkout."""
from __future__ import annotations
import hashlib
from pathlib import Path
import platform
import shutil
import tarfile
import urllib.request

root = Path(__file__).resolve().parents[1]
version = (root / '.nvmrc').read_text().strip()
assert platform.system() == 'Linux', 'On macOS use nvm install && nvm use.'
arch = {'x86_64': 'x64', 'aarch64': 'arm64'}[platform.machine()]
name = f'node-v{version}-linux-{arch}.tar.xz'
directory = root / '.cache' / 'toolchains'
directory.mkdir(parents=True, exist_ok=True)
archive = directory / name
base = f'https://nodejs.org/dist/v{version}/'
with urllib.request.urlopen(base + 'SHASUMS256.txt', timeout=30) as response:
    manifest = response.read().decode()
expected = next(line.split()[0] for line in manifest.splitlines() if line.split()[-1] == name)
if not archive.exists():
    with urllib.request.urlopen(base + name, timeout=90) as response, archive.open('wb') as target:
        shutil.copyfileobj(response, target)
assert hashlib.sha256(archive.read_bytes()).hexdigest() == expected, 'Node archive SHA256 mismatch'
with tarfile.open(archive) as tar:
    tar.extractall(directory, filter='data')
print(f'Installed official Node {version} / {arch}, SHA256 verified.')
