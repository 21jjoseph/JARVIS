import { _electron as electron, test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { access, mkdtemp } from 'node:fs/promises';

test('local voice: real capture, Whisper, Piper playback, wake word and cancellation', async () => {
  test.setTimeout(100_000);
  const fixture = resolve('.cache/voice-fixtures/en.wav');
  try {
    await access(fixture);
  } catch {
    throw new Error(
      'Run npm run voice:models && npm run voice:check before the voice desktop test.',
    );
  }
  const userData = await mkdtemp(resolve('.cache/voice-e2e-'));
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
      JARVIS_USER_DATA_DIR: userData,
      JARVIS_VOICE_MODELS_DIR: resolve('.cache/voice-models'),
    },
  });
  try {
    const overlay = await app.firstWindow();
    await expect(overlay.getByTestId('ferrofluid')).toHaveAttribute('data-rendered', 'true');
    await overlay.evaluate(() => window.jarvis!.openDashboard());
    await expect.poll(() => app.windows().length).toBe(2);
    const page = app.windows().find((window) => window !== overlay)!;
    await page.evaluate(() =>
      window.jarvis!.updateSettings({ locale: 'en', voiceLanguage: 'en', quality: 'low' }),
    );
    await page.getByRole('button', { name: 'Audio & privacy' }).click();
    const voice = page.getByTestId('voice-panel');
    await expect(voice.getByRole('button', { name: 'Press to talk', exact: true })).toBeEnabled();
    expect(await page.evaluate(async () => (await window.jarvis!.voice.status()).phase)).toBe(
      'OFF',
    );
    await expect(
      page.evaluate(() => window.jarvis!.voice.feed(new Float32Array([NaN]))),
    ).rejects.toThrow('Invalid audio');
    await page.evaluate(() => {
      const values = window as unknown as { voicePeak: number };
      values.voicePeak = 0;
      window.jarvis!.onSnapshot((s) => {
        if (s.runtime.source === 'voice' && s.runtime.state === 'SPEAKING')
          values.voicePeak = Math.max(values.voicePeak, s.runtime.amplitude);
      });
    });
    await voice.getByRole('button', { name: 'Press to talk', exact: true }).click();
    await expect
      .poll(() => page.evaluate(async () => (await window.jarvis!.voice.status()).heard), {
        timeout: 35_000,
      })
      .toMatch(/time/i);
    await expect
      .poll(() => page.evaluate(async () => (await window.jarvis!.voice.status()).reply), {
        timeout: 15_000,
      })
      .toMatch(/The time is/);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { voicePeak: number }).voicePeak), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0.03);
    await expect
      .poll(() => page.evaluate(async () => (await window.jarvis!.voice.status()).phase), {
        timeout: 15_000,
      })
      .toBe('OFF');
    expect(
      await overlay.evaluate(async () => (await window.jarvis!.getSnapshot()).runtime.source),
    ).toBe('none');
    await page.screenshot({ path: 'test-results/voice-panel.png' });

    await voice.getByRole('button', { name: 'Enable “Jarvis”', exact: true }).click();
    await expect
      .poll(() => page.evaluate(async () => (await window.jarvis!.voice.status()).reply), {
        timeout: 25_000,
      })
      .toContain('Yes, I am listening');
    await voice.getByRole('button', { name: 'Stop / mute', exact: true }).click();
    await expect
      .poll(() => overlay.evaluate(async () => (await window.jarvis!.getSnapshot()).runtime.source))
      .toBe('none');

    // Stop during actual inference: a stale worker result must never restart audio.
    await voice.getByRole('button', { name: 'Press to talk', exact: true }).click();
    await expect
      .poll(() => page.evaluate(async () => (await window.jarvis!.voice.status()).phase), {
        timeout: 25_000,
        intervals: [50],
      })
      .toBe('TRANSCRIBING');
    await voice.getByRole('button', { name: 'Stop / mute', exact: true }).click();
    await expect
      .poll(() => page.evaluate(async () => (await window.jarvis!.voice.status()).phase))
      .toBe('OFF');
    await page.waitForTimeout(1000); // verifies cancellation after the previous inference would complete
    expect(
      await page.evaluate(async () => (await window.jarvis!.getSnapshot()).runtime.source),
    ).toBe('none');
    expect(await page.evaluate(async () => (await window.jarvis!.voice.status()).phase)).toBe(
      'OFF',
    );
  } finally {
    await app.close();
  }
});
