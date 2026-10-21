import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
export interface SystemVoice {
  name: string;
  language: string;
}
export async function systemVoices(): Promise<SystemVoice[]> {
  if (process.platform !== 'darwin') return [];
  const { stdout } = await promisify(execFile)('/usr/bin/say', ['-v', '?'], {
    timeout: 5000,
    maxBuffer: 256 * 1024,
  });
  return stdout.split('\n').flatMap((line) => {
    const match = /^(.+?)\s+([a-z]{2}_[A-Z]{2})\s+#/.exec(line);
    return match ? [{ name: match[1]!.trim(), language: match[2]!.slice(0, 2) }] : [];
  });
}
export function decodeWave(bytes: Buffer): { samples: Float32Array; sampleRate: number } {
  if (
    bytes.length < 44 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 12) !== 'WAVE'
  )
    throw new Error('Invalid speech WAV header.');
  let format = 0,
    channels = 0,
    sampleRate = 0,
    bits = 0;
  let data: Buffer | null = null;
  for (let at = 12; at + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(at + 4),
      start = at + 8;
    if (start + size > bytes.length) throw new Error('Truncated speech WAV.');
    const name = bytes.toString('ascii', at, at + 4);
    if (name === 'fmt ' && size >= 16) {
      format = bytes.readUInt16LE(start);
      channels = bytes.readUInt16LE(start + 2);
      sampleRate = bytes.readUInt32LE(start + 4);
      bits = bytes.readUInt16LE(start + 14);
    }
    if (name === 'data') data = bytes.subarray(start, start + size);
    at = start + size + (size % 2);
  }
  if (
    format !== 1 ||
    ![1, 2].includes(channels) ||
    bits !== 16 ||
    sampleRate < 8000 ||
    sampleRate > 48000 ||
    !data ||
    data.length % (channels * 2)
  )
    throw new Error('Unsupported speech WAV format. Select the Piper voice provider.');
  if (data.length / channels / 2 / sampleRate > 90) throw new Error('Speech output is too long.');
  const samples = new Float32Array(data.length / channels / 2);
  for (let i = 0; i < samples.length; i++) {
    let value = 0;
    for (let c = 0; c < channels; c++) value += data.readInt16LE((i * channels + c) * 2) / 32768;
    samples[i] = value / channels;
  }
  return { samples, sampleRate };
}
export async function synthesizeSystem(
  text: string,
  language: 'ro' | 'en',
  chosen: string,
  rate: number,
  root: string,
  signal: AbortSignal,
) {
  if (process.platform !== 'darwin')
    throw new Error('The system voice provider requires macOS. Choose Piper local.');
  const voices = await systemVoices();
  const voice = chosen
    ? voices.find((v) => v.name === chosen && v.language === language)
    : voices.find((v) => v.language === language);
  if (!voice)
    throw new Error(
      'No installed macOS voice matches this language. Add one in System Preferences or choose Piper local.',
    );
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(join(root, '.speech-'));
  try {
    const file = join(directory, 'speech.wav');
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        '/usr/bin/say',
        [
          '-v',
          voice.name,
          '-r',
          String(Math.round(175 * rate)),
          '--file-format=WAVE',
          '--data-format=LEI16@16000',
          '-o',
          file,
        ],
        { stdio: ['pipe', 'ignore', 'ignore'], signal },
      );
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('macOS speech synthesis timed out.'));
      }, 45_000);
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error('macOS speech synthesis stopped.'));
      });
      child.stdin.on('error', () => {});
      child.stdin.end(text.slice(0, 400));
    });
    return decodeWave(await readFile(file));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
