"""Verify pinned Darwin/x64 native dependencies against Monterey without executing them.

Standard library only. npm tarballs use lockfile SHA512 integrity; Node uses the
official HTTPS SHA256 manifest; Electron uses @electron/get's verified cache.
Run with --electron ZIP after downloading via scripts/download-macos-electron.mjs.
This is binary metadata validation, not a substitute for a native macOS test.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import struct
import tarfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache' / 'macos-audit'

def download(url: str, name: str) -> bytes:
    path = CACHE / name
    if not path.exists():
        with urllib.request.urlopen(url, timeout=90) as response:
            path.write_bytes(response.read())
    return path.read_bytes()

def targets(data: bytes) -> list[tuple[int, int, int]]:
    if data[:4] in (b'\xca\xfe\xba\xbe', b'\xca\xfe\xba\xbf'):
        wide = data[3] == 0xbf
        count = struct.unpack_from('>I', data, 4)[0]
        found = []
        for i in range(count):
            at = 8 + i * (32 if wide else 20)
            cpu = struct.unpack_from('>I', data, at)[0]
            offset, size = struct.unpack_from('>QQ' if wide else '>II', data, at + 8)
            if cpu == 0x01000007:
                found += targets(data[offset:offset + size])
        return found
    if data[:4] != b'\xcf\xfa\xed\xfe':
        return []
    cpu = struct.unpack_from('<I', data, 4)[0]
    if cpu != 0x01000007:
        return []
    count = struct.unpack_from('<I', data, 16)[0]
    offset = 32
    found = []
    for _ in range(count):
        cmd, size = struct.unpack_from('<II', data, offset)
        if cmd == 0x32:
            platform, version = struct.unpack_from('<II', data, offset + 8)
            if platform == 1:
                found.append((version >> 16, version >> 8 & 255, version & 255))
        if cmd == 0x24:
            version = struct.unpack_from('<I', data, offset + 8)[0]
            found.append((version >> 16, version >> 8 & 255, version & 255))
        if size < 8:
            raise ValueError('Invalid Mach-O load command')
        offset += size
    return found

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--electron', type=Path)
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    lock = json.loads((ROOT / 'package-lock.json').read_text())
    report: list[dict[str, str]] = []

    def check(label: str, data: bytes) -> None:
        versions = targets(data)
        assert versions, f'{label}: no Intel macOS deployment target found'
        version = max(versions)
        assert version <= (12, 0, 0), f'{label}: requires macOS {version}, newer than Monterey'
        print(f'{label}: min macOS {".".join(map(str, version))} / x86_64')
        report.append({'artifact': label, 'minimum_macos': '.'.join(map(str, version)), 'architecture': 'x86_64'})

    for name, package in lock['packages'].items():
        native_bundle = name in ('node_modules/@electron-internal/extract-zip', 'node_modules/app-builder-bin', 'node_modules/7zip-bin')
        if not native_bundle and ('darwin' not in package.get('os', []) or 'x64' not in package.get('cpu', ['x64'])):
            continue
        data = download(package['resolved'], name.replace('/', '_') + '.tgz')
        algorithm, expected = package['integrity'].split('-', 1)
        actual = base64.b64encode(hashlib.new(algorithm, data).digest()).decode()
        assert actual == expected, f'Integrity failure: {name}'
        found = False
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
            for entry in archive.getmembers():
                candidate = entry.name.endswith('.node') or entry.name.endswith('/esbuild') or ('/mac/' in entry.name and not entry.name.endswith('.md'))
                if entry.isfile() and candidate:
                    handle = archive.extractfile(entry)
                    assert handle is not None
                    binary = handle.read()
                    if targets(binary):
                        check(f'{name}@{package["version"]}/{entry.name}', binary)
                        found = True
        assert found, f'No native artifact found for {name}'

    node = (ROOT / '.nvmrc').read_text().strip()
    name = f'node-v{node}-darwin-x64.tar.gz'
    base = f'https://nodejs.org/dist/v{node}/'
    with urllib.request.urlopen(base + 'SHASUMS256.txt', timeout=30) as response:
        manifest = response.read().decode()
    expected = next(line.split()[0] for line in manifest.splitlines() if line.split()[-1] == name)
    data = download(base + name, name)
    assert hashlib.sha256(data).hexdigest() == expected, 'Node SHA256 mismatch'
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        handle = archive.extractfile(f'node-v{node}-darwin-x64/bin/node')
        assert handle is not None
        check(f'Node {node}', handle.read())

    if args.electron:
        with zipfile.ZipFile(args.electron) as archive:
            for entry in archive.infolist():
                if '/Contents/MacOS/' in entry.filename or entry.filename.endswith(('.dylib', '/Electron Framework')):
                    data = archive.read(entry)
                    if targets(data):
                        check('Electron 43: ' + entry.filename, data)
    else:
        print('Electron binary audit not run. Supply --electron ZIP for full validation.')
    (CACHE / 'report.json').write_text(json.dumps(report, indent=2) + '\n')

if __name__ == '__main__':
    main()
