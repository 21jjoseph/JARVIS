import { _electron as electron, test, expect, type ElectronApplication } from '@playwright/test';
import { resolve } from 'node:path';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import type { AvatarState } from '../../shared/contracts';

test('production desktop: rendered avatar, IPC boundaries, audio, dashboard and persistence', async () => {
  const userData = await mkdtemp(resolve('.cache/e2e-user-'));
  const microphoneFile = resolve(userData, 'microphone.wav');
  // Feed a known prerecorded signal through Chromium's capture stack.
  const samples = 48000 * 2;
  const wav = Buffer.alloc(44 + samples * 2);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + samples * 2, 4);
  wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(48000, 24);
  wav.writeUInt32LE(96000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    wav.writeInt16LE(Math.round(Math.sin((i * 2 * Math.PI * 440) / 48000) * 12000), 44 + i * 2);
  await writeFile(microphoneFile, wav);
  let app: ElectronApplication | undefined;
  const launch = () =>
    electron.launch({
      executablePath:process.env.JARVIS_TEST_EXECUTABLE,
      args: [
        ...(process.env.JARVIS_TEST_EXECUTABLE?[]:['.']),
        ...(process.env.JARVIS_TEST_NO_SANDBOX === '1' ? ['--no-sandbox'] : []),
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-audio-capture=${microphoneFile}`,
      ],
      env: { ...process.env, JARVIS_USER_DATA_DIR: userData },
    });
  try {
    app = await launch();
    const overlay = await app.firstWindow();
    const errors: string[] = [];
    overlay.on('pageerror', (error) => errors.push(error.message));
    await expect(overlay.getByTestId('ferrofluid')).toHaveAttribute('data-rendered', 'true');
    expect(
      await overlay.evaluate(() => typeof (window as unknown as Record<string, unknown>).require),
    ).toBe('undefined');
    expect(
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0]!;
        const prefs = (
          win.webContents as unknown as {
            getLastWebPreferences(): {
              sandbox: boolean;
              contextIsolation: boolean;
              nodeIntegration: boolean;
            };
          }
        ).getLastWebPreferences();
        return {
          sandbox: prefs.sandbox,
          isolation: prefs.contextIsolation,
          node: prefs.nodeIntegration,
        };
      }),
    ).toEqual({ sandbox: true, isolation: true, node: false });
    expect(
      await overlay.evaluate(() =>
        [document.documentElement, document.body].map((el) => getComputedStyle(el).backgroundColor),
      ),
    ).toEqual(['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']);
    await expect(
      overlay.evaluate(() => window.jarvis!.updateSettings({ size: 5000 })),
    ).rejects.toThrow('Invalid setting');
    await expect(
      overlay.evaluate(() => window.jarvis!.selectState('BOGUS' as AvatarState)),
    ).rejects.toThrow('Unknown avatar state');
    await expect(
      overlay.evaluate(() => window.jarvis!.updateSettings({ position: { x: 0, y: 0 } })),
    ).rejects.toThrow('managed');
    await overlay.evaluate(() => window.jarvis!.openDashboard());
    await expect.poll(() => app!.windows().length).toBe(2);
    const dashboard = app.windows().find((win) => win !== overlay)!;
    dashboard.on('pageerror', (error) => errors.push(error.message));
    await expect(
      dashboard.getByRole('heading', { name: 'Control room', exact: true }),
    ).toBeVisible();
    await expect(dashboard.getByTestId('ferrofluid')).toHaveAttribute('data-rendered', 'true');
    for (const state of [
      'LISTENING',
      'THINKING',
      'SPEAKING',
      'EXECUTING',
      'WARNING',
      'ERROR',
      'OFFLINE',
      'IDLE',
    ] as const) {
      await dashboard.getByTestId(`state-${state}`).click();
      await expect
        .poll(() =>
          overlay.evaluate(async () => (await window.jarvis!.getSnapshot()).runtime.state),
        )
        .toBe(state);
    }
    // Synthesized audio is a real Web Audio signal; it must produce measured amplitude.
    await dashboard.getByRole('button', { name: 'Test audio · 8 secunde' }).click();
    await expect
      .poll(() =>
        overlay.evaluate(async () => (await window.jarvis!.getSnapshot()).runtime.amplitude),
      )
      .toBeGreaterThan(0.05);
    expect(
      await overlay.evaluate(async () => (await window.jarvis!.getSnapshot()).runtime.source),
    ).toBe('test');
    expect(await overlay.evaluate(() => window.jarvis!.claimAudio('microphone'))).toBe(false);
    await dashboard.getByRole('button', { name: 'Oprește audio', exact: true }).click();
    await expect
      .poll(() => overlay.evaluate(async () => (await window.jarvis!.getSnapshot()).runtime.source))
      .toBe('none');
    // Chromium supplies a synthetic microphone; this does not test real hardware or macOS TCC.
    await dashboard.getByRole('button', { name: 'Activează microfonul', exact: true }).click();
    await expect
      .poll(() =>
        overlay.evaluate(async () => (await window.jarvis!.getSnapshot()).runtime.amplitude),
      )
      .toBeGreaterThan(0);
    expect(
      await dashboard.evaluate(async () => (await window.jarvis!.getSnapshot()).runtime.source),
    ).toBe('microphone');
    await dashboard.getByRole('button', { name: 'Oprește audio', exact: true }).click();
    const camera = await dashboard.evaluate(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach((t) => t.stop());
        return 'allowed';
      } catch {
        return 'denied';
      }
    });
    expect(camera).toBe('denied');
    const initial = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.getTitle().includes('Avatar'))!
        .getBounds(),
    );
    await overlay.bringToFront();
    await overlay.mouse.move(160, 160);
    await overlay.mouse.down();
    await overlay.mouse.move(130, 140);
    await expect
      .poll(() =>
        app!.evaluate(
          ({ BrowserWindow }) =>
            BrowserWindow.getAllWindows()
              .find((w) => w.getTitle().includes('Avatar'))!
              .getBounds().x,
        ),
      )
      .toBe(initial.x - 30);
    await overlay.mouse.up();
    await overlay.getByRole('button', { name: /Click: microfon/ }).dblclick();
    await overlay.waitForTimeout(600); // a double-click must cancel the delayed microphone activation
    expect(
      await overlay.evaluate(async () => (await window.jarvis!.getSnapshot()).runtime.source),
    ).toBe('none');
    await overlay.evaluate(() => window.jarvis!.moveOverlay(-120, -80));
    const moved = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.getTitle().includes('Avatar'))!
        .getBounds(),
    );
    expect(moved.x).toBe(initial.x - 150);
    expect(moved.y).toBe(initial.y - 100);
    await dashboard.evaluate(() =>
      window.jarvis!.updateSettings({
        size: 350,
        reducedMotion: true,
        color: '#9aa7ff',
        locale: 'en',
      }),
    );
    await expect(dashboard.getByRole('button', { name: 'Preferences' })).toBeVisible();
    await dashboard.evaluate(() => window.scrollTo(0, 0));
    await dashboard.screenshot({ path: 'test-results/dashboard.png' });
    expect(errors).toEqual([]);
    await app.close();
    app = undefined;
    const stored = JSON.parse(await readFile(resolve(userData, 'settings.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(stored.size).toBe(350);
    expect(stored.position).toEqual({ x: moved.x, y: moved.y });
    app = await launch();
    const restored = await app.firstWindow();
    await expect(restored.getByTestId('ferrofluid')).toHaveAttribute('data-rendered', 'true');
    expect(
      await restored.evaluate(async () => (await window.jarvis!.getSnapshot()).settings),
    ).toMatchObject({
      size: 350,
      reducedMotion: true,
      color: '#9aa7ff',
      position: stored.position,
    });
    await app.close();
    app = undefined;
  } finally {
    await app?.close();
  }
});
