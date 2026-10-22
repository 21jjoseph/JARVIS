import { _electron as electron, test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('AI: actual Python process, provider HTTP, chat, consent, approval and cancellation', async () => {
  test.setTimeout(70_000);
  const requests: string[] = [];
  const provider = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/tags') {
      res.end(JSON.stringify({ models: [{ name: 'fixture-model' }] }));
      return;
    }
    let body = '';
    for await (const chunk of req) body += String(chunk);
    const input = JSON.parse(body) as { messages: Array<{ content: string }> };
    const prompt = input.messages.at(-1)!.content;
    requests.push(prompt);
    if (prompt === 'Slow response') {
      setTimeout(() => res.end(JSON.stringify({ message: { content: 'Stale response' } })), 2500);
      return;
    }
    if (prompt === 'Unsafe action') {
      res.end(
        JSON.stringify({
          message: {
            tool_calls: [
              { function: { name: 'shell', arguments: { command: 'touch forbidden' } } },
            ],
          },
        }),
      );
      return;
    }
    res.end(JSON.stringify({ message: { content: 'Fixture answer about electric motors.' } }));
  });
  await new Promise<void>((done, reject) => {
    provider.once('error', reject);
    provider.listen(11434, '127.0.0.1', done);
  });
  const userData = await mkdtemp(resolve('.cache/ai-e2e-'));
  const app = await electron.launch({
    executablePath: process.env.JARVIS_TEST_EXECUTABLE,
    args: [
      ...(process.env.JARVIS_TEST_EXECUTABLE ? [] : ['.']),
      ...(process.env.JARVIS_TEST_NO_SANDBOX === '1' ? ['--no-sandbox'] : []),
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
    env: {
      ...process.env,
      JARVIS_USER_DATA_DIR: userData,
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
    await page.getByRole('button', { name: /AI conversation/ }).click();
    const panel = page.getByTestId('conversation-panel');
    await expect
      .poll(() => page.evaluate(async () => (await window.jarvis!.ai.status()).ready))
      .toBe(true);
    await expect(panel.getByLabel('Local Ollama model')).toHaveValue('fixture-model');
    await panel.getByLabel('Message Twenty One').fill('Explain an electric motor');
    await panel.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(panel).toContainText('Fixture answer about electric motors.');
    expect(requests).toEqual(['Explain an electric motor']);
    await page.evaluate(()=>window.jarvis!.updateSettings({cloudEnabled:true,aiMode:'cloud'}));
    await panel.getByLabel('Message destination').selectOption('cloud');
    await expect(panel.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await expect(
      page.evaluate(() =>
        window.jarvis!.ai.ask({ text: 'secret text', route: 'cloud', cloudConsent: false }),
      ),
    ).rejects.toThrow('Confirm cloud');
    expect(requests).toHaveLength(1);
    await panel.getByLabel('Message destination').selectOption('local');
    await panel.getByLabel('Message Twenty One').fill('Show system info');
    await panel.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(panel.getByRole('region', { name: 'Action approval' })).toBeVisible();
    await expect
      .poll(() => page.evaluate(async () => (await window.jarvis!.getSnapshot()).runtime.state))
      .toBe('WARNING');
    const pending = await page.evaluate(async () => (await window.jarvis!.ai.lastReply())!.tool!);
    await expect(
      overlay.evaluate((id) => window.jarvis!.ai.resolve(id, true), pending.id),
    ).rejects.toThrow('window');
    await panel.getByRole('button', { name: 'Deny', exact: true }).click();
    await expect(panel.getByTestId('tool-result')).toContainText('Nothing was executed');
    await panel.getByRole('button', { name: 'Send', exact: true }).click();
    const second = await page.evaluate(async () => (await window.jarvis!.ai.lastReply())!.tool!);
    await panel.getByRole('button', { name: 'Allow once', exact: true }).click();
    await expect(panel.getByTestId('tool-result')).toContainText('Electron 43');
    await expect
      .poll(() => page.evaluate(async () => (await window.jarvis!.getSnapshot()).runtime.state))
      .toBe('IDLE');
    await expect(
      page.evaluate((id) => window.jarvis!.ai.resolve(id, true), second.id),
    ).rejects.toThrow('window');
    const audit = await readFile(resolve(userData, 'tool-audit.jsonl'), 'utf8');
    expect(audit).toContain('denied');
    expect(audit).toContain('completed');
    expect(audit).not.toContain('Explain an electric motor');
    await panel.getByLabel('Message Twenty One').fill('Unsafe action');
    await panel.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(panel).toContainText('Unsupported tool');
    await expect(panel.getByRole('region', { name: 'Action approval' })).toHaveCount(0);
    await panel.getByLabel('Message Twenty One').fill('Slow response');
    await panel.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(() => requests.includes('Slow response')).toBe(true);
    await expect
      .poll(() => page.evaluate(async () => (await window.jarvis!.getSnapshot()).runtime.state))
      .toBe('THINKING');
    await panel.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(panel).toContainText('cancelled');
    await page.waitForTimeout(2800);
    await expect(panel).not.toContainText('Stale response');
    await panel.getByLabel('Message Twenty One').fill('What time is it?');
    await panel.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(panel).toContainText('The time is');
    await page.screenshot({ path: 'test-results/ai-panel.png', fullPage: true });
  } finally {
    await app.close();
    await new Promise<void>((done) => provider.close(() => done()));
  }
});
