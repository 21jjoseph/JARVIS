import { _electron as electron, test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { access, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';

test('voice AI: capture → Whisper → actual Python/Ollama HTTP → Piper, approval and stop', async () => {
  test.setTimeout(120_000);
  const fixture = resolve('.cache/voice-fixtures/ai.wav');
  await access(fixture);
  let calls = 0;
  const prompts: string[] = [];
  const provider = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/tags') {
      res.end(JSON.stringify({ models: [{ name: 'fixture-model' }] }));
      return;
    }
    let body = '';
    for await (const chunk of req) body += String(chunk);
    const value = JSON.parse(body) as { messages: Array<{ content: string }> };
    prompts.push(value.messages.at(-1)!.content);
    if(value.messages.at(-1)?.content.includes('Electron 43')){res.end(JSON.stringify({message:{content:'Actual tool result received.'}}));return;}
    calls++;
    if (calls === 1)
      res.end(
        JSON.stringify({ message: { content: 'Electric motors turn electricity into motion.' } }),
      );
    else if (calls === 2)
      res.end(
        JSON.stringify({
          message: { tool_calls: [{ function: { name: 'system_info', arguments: {} } }] },
        }),
      );
    else
      setTimeout(
        () => res.end(JSON.stringify({ message: { content: 'This must never be spoken.' } })),
        2500,
      );
  });
  await new Promise<void>((done, reject) => {
    provider.once('error', reject);
    provider.listen(11434, '127.0.0.1', done);
  });
  const app = await electron.launch({
    executablePath: process.env.JARVIS_TEST_EXECUTABLE,
    args: [
      ...(process.env.JARVIS_TEST_EXECUTABLE ? [] : ['.']),
      ...(process.env.JARVIS_TEST_NO_SANDBOX === '1' ? ['--no-sandbox'] : []),
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${fixture}`,
    ],
    env: {
      ...process.env,
      JARVIS_USER_DATA_DIR: await mkdtemp(resolve('.cache/voice-ai-e2e-')),
      JARVIS_VOICE_MODELS_DIR: resolve('.cache/voice-models'),
    },
  });
  try {
    const overlay = await app.firstWindow();
    await overlay.evaluate(() => window.jarvis!.openDashboard());
    await expect.poll(() => app.windows().length).toBe(2);
    const page = app.windows().find((w) => w !== overlay)!;
    await page.evaluate(() =>
      window.jarvis!.updateSettings({
        locale: 'en',
        voiceLanguage: 'en',
        localModel: 'fixture-model',
        localBackend:'ollama',
        quality: 'low',
      }),
    );
    await page.getByRole('button', { name: 'Audio & privacy' }).click();
    await page.evaluate(() => {
      const data = window as unknown as { aiVoicePeak: number; aiVoiceAudio: number };
      data.aiVoicePeak = 0;
      data.aiVoiceAudio = 0;
      window.jarvis!.onSnapshot((s) => {
        if (s.runtime.state === 'SPEAKING')
          data.aiVoicePeak = Math.max(data.aiVoicePeak, s.runtime.amplitude);
      });
      window.jarvis!.voice.onAudio(() => {
        data.aiVoiceAudio++;
      });
    });
    await page.getByRole('button', { name: 'Press to talk', exact: true }).click();
    await expect
      .poll(() => page.evaluate(async () => (await window.jarvis!.voice.status()).reply), {
        timeout: 45_000,
      })
      .toContain('Electric motors');
    const recognized = await page.evaluate(async () => (await window.jarvis!.voice.status()).heard);
    expect(recognized).toMatch(/electric/i);
    expect(prompts[0]).toBe(recognized);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { aiVoicePeak: number }).aiVoicePeak), {
        timeout: 20_000,
      })
      .toBeGreaterThan(0.02);
    await expect
      .poll(() => page.evaluate(async () => (await window.jarvis!.voice.status()).phase), {
        timeout: 25_000,
      })
      .toBe('OFF');
    await page.getByRole('button', { name: 'Press to talk', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Action approval' })).toBeVisible({
      timeout: 45_000,
    });
    await expect(page.getByTestId('conversation-panel')).toBeVisible();
    await expect
      .poll(() => page.evaluate(async () => (await window.jarvis!.voice.status()).phase), {
        timeout: 30_000,
      })
      .toBe('OFF');
    await page.getByRole('button', { name: 'Allow once', exact: true }).click();
    await expect(page.getByTestId('tool-result')).toContainText('Electron 43');
    await page.getByRole('button', { name: 'Audio & privacy' }).click();
    await page.getByRole('button', { name: 'Press to talk', exact: true }).click();
    await expect.poll(() => calls, { timeout: 45_000 }).toBe(3);
    const audioCount = await page.evaluate(
      () => (window as unknown as { aiVoiceAudio: number }).aiVoiceAudio,
    );
    await page
      .getByTestId('voice-panel')
      .getByRole('button', { name: 'Stop / mute', exact: true })
      .click();
    await page.waitForTimeout(2800);
    expect(
      await page.evaluate(() => (window as unknown as { aiVoiceAudio: number }).aiVoiceAudio),
    ).toBe(audioCount);
    expect(await page.evaluate(async () => (await window.jarvis!.voice.status()).phase)).toBe(
      'OFF',
    );
    expect(
      await page.evaluate(async () => (await window.jarvis!.getSnapshot()).runtime.source),
    ).toBe('none');
  } finally {
    await app.close();
    await new Promise<void>((done) => provider.close(() => done()));
  }
});
