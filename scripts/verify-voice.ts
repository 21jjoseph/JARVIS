import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { SpeechWorker } from '../apps/desktop/electron/voice/client';
import { modelsReady, verifyModels } from '../apps/desktop/electron/voice/models';

function resample(input: Float32Array, rate: number) {
  const result = new Float32Array(Math.floor((input.length * 16000) / rate));
  for (let i = 0; i < result.length; i++) {
    const at = (i * rate) / 16000,
      floor = Math.floor(at),
      fraction = at - floor;
    result[i] = (input[floor] ?? 0) * (1 - fraction) + (input[floor + 1] ?? 0) * fraction;
  }
  return result;
}
function wave(pcm: Float32Array) {
  const data = Buffer.alloc(44 + pcm.length * 2);
  data.write('RIFF');
  data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(16000, 24);
  data.writeUInt32LE(32000, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(pcm.length * 2, 40);
  for (let i = 0; i < pcm.length; i++)
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, pcm[i]!)) * 32767), 44 + i * 2);
  return data;
}
async function main() {
  const root = resolve('.cache/voice-models');
  assert(
    (await modelsReady(root)) && (await verifyModels(root)),
    'Run npm run voice:models first.',
  );
  const worker = new SpeechWorker(resolve('dist-electron/voice-worker.cjs'), root);
  try {
    await mkdir('.cache/voice-fixtures', { recursive: true });
    let passed = 0;
    for (const [language, text, expected, fixture] of [
      ['en', 'Jarvis. What time is it?', 'time', 'en'],
      ['ro', 'Cât este ceasul?', 'ceas', 'ro'],
      ['en', 'Explain an electric motor.', 'motor', 'ai'],
      ['en', 'Twenty One. What time is it?', 'time', 'twenty-one'],
      ['en', 'Yo Twenty One. What time is it?', 'time', 'yo-twenty-one'],
      ['en', 'Hey Twenty One. What time is it?', 'time', 'hey-twenty-one'],
    ] as const) {
      const audio = await worker.call<{ samples: Float32Array; sampleRate: number }>('synthesize', {
        language,
        text,
        rate: 1,
      });
      assert(
        audio.samples.length > 1000 && audio.samples.some((x) => Math.abs(x) > 0.02),
        `${language}: silent speech output`,
      );
      passed++;
      const samples = resample(audio.samples, audio.sampleRate);
      const transcript = await worker.call<string>('recognize', { samples, language });
      assert(
        transcript.toLowerCase().includes(expected),
        `${language}: unexpected transcription: ${transcript}`,
      );
      passed++;
      console.log(
        `${language}: actual local TTS → Whisper transcription: ${JSON.stringify(transcript)}`,
      );
      const padded = new Float32Array(samples.length + 16000 * 3);
      padded.set(samples);
      await writeFile(`.cache/voice-fixtures/${fixture}.wav`, wave(padded));
      if (fixture === 'en'||fixture.includes('twenty-one')) {
        await worker.call('wake', { word: fixture==='en'?'jarvis':'Twenty One' });
        let detected = false;
        for (let at = 0; at < padded.length; at += 2048)
          if (await worker.call<boolean>('keyword', { samples: padded.slice(at, at + 2048) }))
            detected = true;
        assert(detected, `The local wake-word detector did not trigger for ${text}`);
        passed++;
        console.log(`Actual local keyword detection: ${fixture} triggered.`);
      }
    }
    console.log(
      `Voice model checks: ${passed} passed. Generated audio fixtures only; no physical microphone tested.`,
    );
  } finally {
    await worker.stop();
  }
}
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Voice validation failed.');
  process.exitCode = 1;
});
