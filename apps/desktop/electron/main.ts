import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
  session,
  net,
} from 'electron';
import type { IpcMainInvokeEvent, IpcMainEvent, WebContents } from 'electron';
import { join } from 'node:path';
import { existsSync,statSync } from 'node:fs';
import {
  isState,
  validateDelta,
  validateSettingsPatch,
  type Capabilities,
  type Runtime,
  type Snapshot,
} from '../../../shared/contracts';
import { INITIAL_RUNTIME, transition } from '../../../shared/contracts/machine';
import { SettingsStore } from './settings';
import { clampPosition, safeDevUrl, trustedRendererUrl } from './policy';
import { VoiceController } from './voice/controller';
import { validatePcm, type VoicePhase } from '../../../shared/contracts/voice';
import { Backend } from './ai/backend';
import { AiController } from './ai/controller';
import { systemVoices } from './voice/system-speech';

const devUrl = safeDevUrl(process.env.JARVIS_DEV_URL);
const indexPath = join(__dirname, '../dist/index.html');
// Tests use an isolated user-data directory; normal runs use the OS application data path.
if (process.env.JARVIS_USER_DATA_DIR) app.setPath('userData', process.env.JARVIS_USER_DATA_DIR);
else {
  const roots=['jarvis-desktop','JARVIS','21'].map(name=>join(app.getPath('appData'),name));
  const existing=roots.filter(root=>existsSync(join(root,'settings.json'))).sort((a,b)=>statSync(join(b,'settings.json')).mtimeMs-statSync(join(a,'settings.json')).mtimeMs);
  app.setPath('userData',existing[0]||roots[0]!);
}
app.setName('21');
let overlay: BrowserWindow | null = null;
let dashboard: BrowserWindow | null = null;
let tray: Tray | null = null;
let store: SettingsStore;
let runtime: Runtime = { ...INITIAL_RUNTIME };
let audioOwner: number | null = null;
let moveTimer: ReturnType<typeof setTimeout> | undefined;
let quitting = false;
let finalQuit = false;
let lastAmplitudeAt = 0;
let voice: VoiceController | undefined;
let privacyUpdating=false;
let backend: Backend | undefined;
let ai: AiController | undefined;
const capabilities: Capabilities = {
  desktop: true,
  platform: process.platform,
  loginItem: process.platform === 'darwin' || process.platform === 'win32',
  clickThrough: process.platform === 'darwin' || process.platform === 'win32',
  shortcut: false,
};
const allWindows = () =>
  [overlay, dashboard].filter((w): w is BrowserWindow => !!w && !w.isDestroyed());
function snapshot(): Snapshot {
  return { settings: store.value, runtime, capabilities };
}
function broadcast() {
  for (const win of allWindows()) win.webContents.send('jarvis:changed', snapshot());
}
function fail(message: string) {
  if (audioOwner !== null) releaseAudio();
  runtime = transition(runtime, { type: 'ERROR', message });
  broadcast();
}
function knownSender(sender: WebContents): boolean {
  return allWindows().some((win) => win.webContents.id === sender.id);
}
function trusted(sender: WebContents, frameUrl: string | undefined): boolean {
  return knownSender(sender) && !!frameUrl && trustedRendererUrl(frameUrl, indexPath, devUrl);
}
function guard(event: IpcMainInvokeEvent | IpcMainEvent) {
  if (
    !trusted(event.sender, event.senderFrame?.url) ||
    event.senderFrame !== event.sender.mainFrame
  )
    throw new Error('Untrusted IPC sender.');
}
function releaseAudio() {
  if (voice?.active) {
    voice.stop();
    return;
  }
  clearAudio();
}
function clearAudio() {
  const owner = allWindows().find((w) => w.webContents.id === audioOwner);
  owner?.webContents.send('jarvis:audio-stop');
  audioOwner = null;
  runtime = transition(runtime, { type: 'AUDIO_STOP' });
  broadcast();
}
function interactive(value: boolean) {
  overlay?.setIgnoreMouseEvents(capabilities.clickThrough && store.value.clickThrough && !value, {
    forward: true,
  });
}
function bounds() {
  return screen.getAllDisplays().map((display) => display.workArea);
}
function currentPosition() {
  if (!overlay || overlay.isDestroyed()) return null;
  const rect = overlay.getBounds();
  return { x: rect.x, y: rect.y };
}
async function savePosition() {
  const position = currentPosition();
  if (position) await store.update({ position });
}
function schedulePositionSave() {
  clearTimeout(moveTimer);
  moveTimer = setTimeout(() => {
    void savePosition().catch(() => fail('Window position could not be saved.'));
  }, 250);
}
function lockWindow(win: BrowserWindow) {
  const ownerId = win.webContents.id;
  win.on('closed', () => {
    ai?.forget(ownerId);
  });
  win.on('hide', () => {
    void ai?.cancel(win.webContents.id);
  });
  win.on('minimize', () => {
    void ai?.cancel(ownerId);
  });
  win.on('close', () => {
    void ai?.cancel(win.webContents.id);
  });
  win.on('page-title-updated', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, url) => {
    if (!trustedRendererUrl(url, indexPath, devUrl)) event.preventDefault();
  });
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());
  win.webContents.on('render-process-gone', () => {
    void ai?.cancel(ownerId);
    ai?.forget(ownerId);
    if (audioOwner === win.webContents.id) releaseAudio();
  });
}
function load(win: BrowserWindow, view: 'overlay' | 'dashboard') {
  lockWindow(win);
  const result = devUrl
    ? win.loadURL(`${devUrl}/#${view}`)
    : win.loadFile(indexPath, { hash: view });
  void result.catch(() => fail('The interface could not be loaded. Rebuild 21 and restart.'));
}
const webPreferences = () => ({
  preload: join(__dirname, 'preload.cjs'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
  webSecurity: true,
  backgroundThrottling: true,
});
function createOverlay() {
  const settings = store.value;
  const area = screen.getPrimaryDisplay().workArea;
  const position = clampPosition(
    settings.position ?? {
      x: area.x + area.width - settings.size - 36,
      y: area.y + area.height - settings.size - 44,
    },
    settings.size,
    bounds(),
  );
  overlay = new BrowserWindow({
    ...position,
    width: settings.size,
    height: settings.size,
    title: '21 · Avatar',
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    alwaysOnTop: settings.alwaysOnTop,
    show: false,
    skipTaskbar: true,
    maximizable: false,
    fullscreenable: false,
    webPreferences: webPreferences(),
  });
  overlay.once('ready-to-show', () => {
    overlay?.show();
    interactive(false);
  });
  overlay.on('move', schedulePositionSave);
  overlay.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      overlay?.hide();
    }
  });
  overlay.on('hide', () => {
    if (audioOwner === overlay?.webContents.id) releaseAudio();
  });
  overlay.on('minimize', () => {
    if (audioOwner === overlay?.webContents.id) releaseAudio();
  });
  load(overlay, 'overlay');
}
function openDashboard() {
  if (dashboard && !dashboard.isDestroyed()) {
    dashboard.show();
    dashboard.focus();
    return dashboard.webContents.id;
  }
  dashboard = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 880,
    minHeight: 660,
    title: '21 · Control room',
    backgroundColor: '#080d12',
    show: false,
    autoHideMenuBar: true,
    webPreferences: webPreferences(),
  });
  dashboard.once('ready-to-show', () => {
    dashboard?.show();
  });
  dashboard.on('close', () => {
    if (audioOwner === dashboard?.webContents.id) releaseAudio();
  });
  dashboard.on('hide', () => {
    if (audioOwner === dashboard?.webContents.id) releaseAudio();
  });
  dashboard.on('minimize', () => {
    if (audioOwner === dashboard?.webContents.id) releaseAudio();
  });
  dashboard.on('closed', () => {
    dashboard = null;
  });
  load(dashboard, 'dashboard');
  return dashboard.webContents.id;
}
function showOverlay() {
  overlay?.show();
  interactive(true);
}
function registerIpc() {
  const handle = (
    channel: string,
    callback: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
  ) => {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      guard(event);
      return callback(event, ...args);
    });
  };
  handle('jarvis:snapshot', () => snapshot());
  handle('jarvis:settings', async (_event, input) => {
    const patch = validateSettingsPatch(input);
    const revokes=patch.cloudEnabled===false||patch.aiMode==='local'||patch.cloudAudioConsent===false||patch.hybridCloudConsent===false||patch.voiceCloudTextConsent===false;
    if(revokes)voice?.stop();
    if (
      voice?.active &&
      [
        'wakeWord',
        'voiceLanguage',
        'speechRate',
        'microphoneDeviceId',
        'ttsProvider',
        'systemVoice','sttProvider','cloudAudioConsent','geminiVoice','geminiSttModel','geminiTtsModel','speechVolume',
      ].some((key) => key in patch)
    )
      throw new Error('Stop the voice session before changing voice settings.');
    if (patch.position !== undefined || patch.version !== undefined || patch.modelPath !== undefined || patch.modelDirectory !== undefined)
      throw new Error('Position, version and model paths are managed by the application.');

    if (patch.launchAtLogin !== undefined) {
      if (!capabilities.loginItem || !app.isPackaged)
        throw new Error('Launch at login requires a packaged macOS or Windows application.');
      app.setLoginItemSettings({ openAtLogin: patch.launchAtLogin });
      if (app.getLoginItemSettings().openAtLogin !== patch.launchAtLogin)
        throw new Error('The operating system did not accept the login item.');
    }
    if(revokes){privacyUpdating=true;voice?.stop();}
    try{await store.update(patch);if(revokes)await ai?.cancel();}finally{privacyUpdating=false;}
    if (patch.size !== undefined && overlay) {
      const position = clampPosition(currentPosition() ?? { x: 0, y: 0 }, patch.size, bounds());
      overlay.setBounds({ ...position, width: patch.size, height: patch.size });
    }
    overlay?.setAlwaysOnTop(store.value.alwaysOnTop);
    interactive(true);
    broadcast();
    return snapshot();
  });
  handle('jarvis:state', (_event, state) => {
    if (!isState(state)) throw new Error('Unknown avatar state.');
    if (ai?.active) throw new Error('Stop AI before previewing an avatar state.');
    runtime = transition(runtime, { type: 'SELECT', state });
    broadcast();
    return snapshot();
  });
  handle('jarvis:dashboard', () => {
    openDashboard();
  });
  handle('jarvis:hide', () => {
    overlay?.hide();
  });
  handle('jarvis:move', (event, dx, dy) => {
    if (event.sender.id !== overlay?.webContents.id)
      throw new Error('Only the overlay can move itself.');
    const delta = validateDelta(dx, dy);
    if (overlay) {
      const p = currentPosition()!;
      const next = clampPosition(
        { x: p.x + delta.dx, y: p.y + delta.dy },
        store.value.size,
        bounds(),
      );
      overlay.setPosition(next.x, next.y);
    }
  });
  handle('jarvis:audio-claim', (event, source) => {
    if (source !== 'microphone' && source !== 'playback' && source !== 'test')
      throw new Error('Invalid audio source.');
    if (audioOwner !== null || ai?.active) return false;
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner?.isVisible() || owner.isMinimized())
      throw new Error('Show the 21 window before activating audio.');
    runtime = transition(runtime, { type: 'AUDIO_START', source });
    audioOwner = event.sender.id;
    broadcast();
    return true;
  });
  handle('jarvis:audio-release', (event) => {
    if (audioOwner === event.sender.id) releaseAudio();
  });
  handle('ai:status', () => ai!.status());
  handle('ai:last', (event) => ai!.lastReply(event.sender.id));
  handle('ai:ask', (event, input) => {
    if(privacyUpdating)throw new Error('Privacy settings are being updated.');
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win?.isVisible() || win.isMinimized())
      throw new Error('Show the window before asking AI.');
    if (voice?.active) throw new Error('Stop voice before sending a text request.');
    return ai!.ask(event.sender.id, input);
  });
  handle('ai:cancel', (event) => ai!.cancel(event.sender.id));
  handle('ai:resolve', (event, id, approve,shareResult) => {
    if(privacyUpdating)throw new Error('Privacy settings are being updated.');
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win?.isVisible() || win.isMinimized())
      throw new Error('Show the window before approving an action.');
    return ai!.resolve(event.sender.id, id, approve,shareResult);
  });
  handle('ai:key', (_event, key,provider) => {if(key!=='')throw new Error('Use the native secure key dialog.');return ai!.setKey(key,provider);});
  handle('ai:configure-key',(_event,provider)=>ai!.configureKey(provider));
  handle('ai:connection',(_event,provider)=>ai!.connection(provider));
  handle('ai:local',(event,action,options)=>{
    if(action!=='status'&&action!=='discover'&&action!=='preview'){const win=BrowserWindow.fromWebContents(event.sender);if(!win?.isVisible()||win.isMinimized())throw new Error('Show the window before managing local models.');}
    if(action==='stop'&&voice?.active)voice.stop();
    return ai!.local(action,options);
  });
  handle('voice:status', () => voice!.snapshot);
  handle('voice:system-voices', () => systemVoices());
  handle('voice:install', () =>
    voice!.install(((input: string | URL | Request, init?: RequestInit) =>
      net.fetch(String(input), init)) as typeof fetch),
  );
  handle('voice:start', (event, mode) => {
    if(privacyUpdating)throw new Error('Privacy settings are being updated.');
    if (ai?.active) throw new Error('Stop the AI request before starting voice.');
    if (mode !== 'push' && mode !== 'wake' && mode!=='calibration' && mode!=='calibration-cloud') throw new Error('Invalid voice mode.');
    return voice!.start(event.sender.id, mode);
  });
  handle('voice:feed', (event, samples) => voice!.feed(event.sender.id, validatePcm(samples)));
  handle('voice:stop', () => {voice!.stop();runtime=transition(runtime,{type:'AI_PHASE',state:'MUTED'});broadcast();});
  handle('voice:played', (event, id) => {
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 0)
      throw new Error('Invalid playback identifier.');
    voice!.playbackEnded(event.sender.id, id);
  });
  handle('jarvis:quit', () => {
    app.quit();
  });
  ipcMain.on('jarvis:interactive', (event, value: unknown) => {
    try {
      guard(event);
      if (event.sender.id === overlay?.webContents.id && typeof value === 'boolean')
        interactive(value);
    } catch {
      /* reject without crashing the main process */
    }
  });
  ipcMain.on('jarvis:amplitude', (event, value: unknown) => {
    try {
      guard(event);
      if (
        audioOwner !== event.sender.id ||
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        Date.now() - lastAmplitudeAt < 28
      )
        return;
      lastAmplitudeAt = Date.now();
      runtime = transition(runtime, { type: 'AMPLITUDE', value });
      broadcast();
    } catch {
      /* untrusted fire-and-forget IPC is ignored */
    }
  });
}
function createTray() {
  const image = nativeImage.createFromPath(join(__dirname, 'tray.png'));
  image.setTemplateImage(true);
  tray = new Tray(image);
  tray.setToolTip('21 · 21Robotics');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open control room / Panou', click: openDashboard },
      { label: 'Show avatar / Arată avatarul', click: showOverlay },
      { label: 'Hide avatar / Ascunde avatarul', click: () => overlay?.hide() },
      { label: 'Stop audio / Oprește audio', click: releaseAudio },
      { type: 'separator' },
      { label: 'Quit 21 / Închide', click: () => app.quit() },
    ]),
  );
  tray.on('click', openDashboard);
}
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showOverlay();
    openDashboard();
  });
  void app
    .whenReady()
    .then(async () => {
      store = new SettingsStore(join(app.getPath('userData'), 'settings.json'));
      const warning = await store.load();
      if (warning) runtime = transition(runtime, { type: 'ERROR', message: warning });
      if (!app.isPackaged || !capabilities.loginItem) capabilities.loginItem = false;
      // No renderer gets camera, screen capture, filesystem or arbitrary permission access.
      session.defaultSession.setPermissionRequestHandler(
        (contents, permission, callback, details) => {
          const audioOnly =
            permission === 'media' &&
            'mediaTypes' in details &&
            details.mediaTypes?.length === 1 &&
            details.mediaTypes[0] === 'audio';
          callback(!!audioOnly && details.isMainFrame && trusted(contents, details.requestingUrl));
        },
      );
      session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => {
        return (
          !!contents &&
          permission === 'media' &&
          details.mediaType === 'audio' &&
          details.isMainFrame &&
          trusted(contents, details.requestingUrl)
        );
      });
      session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => callback({}));
      backend = new Backend(
        join(__dirname, '..'),
        app.isPackaged ? process.resourcesPath : undefined,
        app.getPath('userData'),
      );
      await backend.start();
      ai = new AiController({
        backend,
        data: app.getPath('userData'),
        settings: () => store.value,
        changed: (owner, reply) => {
          allWindows()
            .find((w) => w.webContents.id === owner)
            ?.webContents.send('ai:reply', reply);
        },
        dashboard: openDashboard,
        saveSettings:async(patch)=>{await store.update(patch);broadcast();},
        delta:(owner,event)=>{allWindows().find(w=>w.webContents.id===owner)?.webContents.send('ai:delta',event);},
        phase: (state) => {
          runtime = transition(runtime, {
            type: runtime.source === 'none' ? 'AI_PHASE' : 'VOICE_PHASE',
            state,
          });
          broadcast();
        },
      });
      registerIpc();
      voice = new VoiceController({
        root:
          process.env.JARVIS_VOICE_MODELS_DIR ||
          (app.isPackaged
            ? join(app.getPath('userData'), 'voice-models')
            : join(__dirname, '../.cache/voice-models')),
        workerPath: app.isPackaged
          ? join(process.resourcesPath, 'app.asar.unpacked/dist-electron/voice-worker.cjs')
          : join(__dirname, 'voice-worker.cjs'),
        settings: () => store.value,
        claim: (owner) => {
          const window = allWindows().find((win) => win.webContents.id === owner);
          if (audioOwner !== null) throw new Error('Stop the current audio session first.');
          if (!window?.isVisible() || window.isMinimized())
            throw new Error('Show the 21 window before starting voice.');
          audioOwner = owner;
          runtime = transition(runtime, { type: 'AUDIO_START', source: 'voice' });
          broadcast();
        },
        release: clearAudio,
        changed: (status) => {
          for (const win of allWindows()) win.webContents.send('voice:status', status);
        },
        phase: (phase: VoicePhase) => {
          if (phase === 'ERROR')
            runtime = transition(runtime, {
              type: 'ERROR',
              message: 'Voice processing failed. Open Audio & privacy for details.',
            });
          else
            runtime = transition(runtime, {
              type: 'VOICE_PHASE',
              state:
                phase === 'WAKE_DETECTED' ? 'WAKE_DETECTED' : phase === 'TRANSCRIBING' ? 'TRANSCRIBING' : phase === 'SPEAKING'
                  ? 'SPEAKING'
                  : phase === 'SYNTHESIZING' || phase === 'STARTING'
                    ? 'THINKING'
                    : phase === 'OFF'
                      ? 'IDLE'
                      : 'LISTENING',
            });
          broadcast();
        },
        audio: (owner, audio) => {
          allWindows()
            .find((win) => win.webContents.id === owner)
            ?.webContents.send('voice:audio', audio);
        },
        openDashboard,
        cloudCapture:(partial,signal)=>ai!.cloudCapture(partial,signal),
        cloudSpeech:(text,signal)=>ai!.cloudSpeech(text,signal),
        answer: async (owner, text, signal) => {
          const response = await ai!.ask(
            owner,
            { text, route:store.value.voiceCloudTextConsent?'auto':'local', cloudConsent:store.value.voiceCloudTextConsent },
            signal,
            true,
          );
          return (
            response.text ||
            (store.value.voiceLanguage === 'ro'
              ? 'AI local este indisponibil. Verifică panoul de conversație.'
              : 'Local AI is unavailable. Check the conversation panel.')
          );
        },
      });
      await voice.initialize();
      createOverlay();
      createTray();
      capabilities.shortcut = globalShortcut.register('CommandOrControl+Shift+J', () => {
        showOverlay();
        openDashboard();
      });
      screen.on('display-removed', () => {
        if (overlay) {
          const p = clampPosition(currentPosition()!, store.value.size, bounds());
          overlay.setPosition(p.x, p.y);
        }
      });
      app.on('activate', () => {
        showOverlay();
      });
    })
    .catch((error) => {
      console.error(
        '21 startup failed:',
        error instanceof Error ? error.message : 'Unknown error',
      );
      app.exit(1);
    });
}
app.on('window-all-closed', () => {
  /* tray keeps the companion alive */
});
app.on('before-quit', (event) => {
  if (finalQuit) return;
  event.preventDefault();
  if (quitting) return;
  quitting = true;
  clearTimeout(moveTimer);
  if (store) releaseAudio();
  void ai?.cancel();
  backend?.stop();
  void (async () => {
    try {
      if (store) {
        await savePosition();
        await store.flush();
      }
    } catch {
      console.error('21 could not persist the final window position.');
    }
    globalShortcut.unregisterAll();
    tray?.destroy();
    finalQuit = true;
    app.quit();
  })();
});
