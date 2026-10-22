import { useEffect, useRef, useState } from 'react';
import { AVATAR_STATES, type AvatarState } from '../../../../shared/contracts';
import { Ferrofluid } from '../avatar/Ferrofluid';
import { Icon, type IconName } from '../components/Icon';
import { useJarvis } from '../hooks/useJarvis';
import { copy } from '../services/i18n';
import { SettingsPanel } from './SettingsPanel';
import { ConversationPanel } from '../ai/ConversationPanel';
import { VoicePanel } from '../voice/VoicePanel';

type Tab = 'overview' | 'lab' | 'audio' | 'settings' | 'chat';
const NAV: { id: Tab; icon: IconName; number: string }[] = [
  { id: 'overview', icon: 'grid', number: '01' },
  { id: 'lab', icon: 'orb', number: '02' },
  { id: 'audio', icon: 'wave', number: '03' },
  { id: 'chat', icon: 'grid', number: '04' },
  { id: 'settings', icon: 'sliders', number: '04' },
];
export function Dashboard() {
  const { snapshot, error, audio, audioActive, run, bridge, voice, voiceStatus } = useJarvis();
  const [tab, setTab] = useState<Tab>('overview');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [pending, setPending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const source = snapshot?.runtime.source;
  useEffect(() => {
    const show = (reply: import('../../../../shared/contracts/ai').AiReply | null) => {
      if (reply?.tool) setTab('chat');
    };
    void bridge.ai
      .lastReply()
      .then(show)
      .catch(() => {});
    return bridge.ai.onReply(show);
  }, [bridge]);
  useEffect(() => {
    const update = () => {
      void navigator.mediaDevices
        ?.enumerateDevices()
        .then((values) => setDevices(values.filter((d) => d.kind === 'audioinput')))
        .catch(() => {});
    };
    update();
    navigator.mediaDevices?.addEventListener('devicechange', update);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', update);
  }, [source]);
  const action = (operation: () => Promise<unknown>) => {
    setPending(true);
    void run(operation).finally(() => setPending(false));
  };
  if (!snapshot)
    return (
      <div className="loading" role="status">
        {error || 'INITIALIZING 21…'}
      </div>
    );
  const { settings, runtime, capabilities } = snapshot;
  const t = copy[settings.locale];
  const activeElsewhere =
    runtime.source !== 'none' && runtime.source !== 'voice' && !audioActive && !pending;
  const stateIcon = (state: AvatarState): IconName =>
    state === 'LISTENING' ? 'mic' : state === 'SPEAKING' ? 'wave' : 'orb';
  const chooseState = (state: AvatarState) => action(() => bridge.selectState(state));
  const states = (
    <section className="panel state-panel">
      <div className="section-header">
        <div>
          <span className="eyebrow">AVATAR / STATE MACHINE</span>
          <h2>{t.states}</h2>
        </div>
        <span className="muted preview-hint">{t.stateHint}</span>
      </div>
      <div className="state-grid">
        {AVATAR_STATES.map((state, i) => (
          <button
            key={state}
            className={`state-button ${runtime.state === state ? 'selected' : ''} ${state.toLowerCase()}`}
            aria-pressed={runtime.state === state}
            disabled={runtime.source !== 'none' || pending}
            onClick={() => chooseState(state)}
            data-testid={`state-${state}`}
          >
            <span className="state-number">0{i + 1}</span>
            <Icon name={stateIcon(state)} />
            <span>{t[state]}</span>
            <span className="state-indicator" />
          </button>
        ))}
      </div>
    </section>
  );
  const audioPanel = (
    <section className="panel audio-panel">
      <div className="section-header">
        <span className="eyebrow">AUDIO / LOCAL INPUT</span>
        <Icon name="wave" />
      </div>
      <h2>{t.signal}</h2>
      <div className="signal-reading">
        <strong>
          {Math.round(runtime.amplitude * 100)}
          <small>%</small>
        </strong>
        <span className={`source-tag ${runtime.source !== 'none' ? 'active' : ''}`}>
          <i />
          {runtime.source === 'none' ? t.noAudio : runtime.source.toUpperCase()}
        </span>
      </div>
      <div
        className="audio-meter"
        role="meter"
        aria-label={t.signal}
        aria-valuenow={Math.round(runtime.amplitude * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {Array.from({ length: 30 }, (_, i) => (
          <span key={i} style={{ opacity: runtime.amplitude * 30 > i ? 1 : 0.12 }} />
        ))}
      </div>
      <div className="meter-labels">
        <span>0</span>
        <span>INPUT LEVEL</span>
        <span>100</span>
      </div>
      <button
        className={`primary-button ${audioActive ? 'recording' : ''}`}
        disabled={pending || activeElsewhere || runtime.source === 'voice'}
        onClick={() =>
          action(() => (audioActive ? audio.stop() : audio.microphone(settings.microphoneDeviceId)))
        }
      >
        <Icon name={audioActive ? 'stop' : 'mic'} />
        {pending ? '…' : audioActive ? t.stop : t.mic}
        <Icon name="arrow" size={16} />
      </button>
      <div className="privacy-note">
        <Icon name="shield" size={16} />
        <p>{t.privacy}</p>
      </div>
      {activeElsewhere && <p className="notice">{t.other}</p>}
      <div className="audio-tools">
        <button
          className="text-button"
          disabled={pending || runtime.source !== 'none'}
          onClick={() => action(() => audio.test())}
        >
          <Icon name="play" size={14} />
          {t.test}
        </button>
        <button
          className="text-button"
          disabled={pending || runtime.source !== 'none'}
          onClick={() => fileInput.current?.click()}
        >
          <Icon name="headphones" size={14} />
          {t.file}
        </button>
        <input
          className="sr-only"
          ref={fileInput}
          type="file"
          accept="audio/*"
          aria-label={t.file}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) action(() => audio.file(file));
            e.target.value = '';
          }}
        />
      </div>
      <label className="device-label" htmlFor="device">
        {t.input}
      </label>
      <select
        id="device"
        disabled={runtime.source !== 'none'}
        value={settings.microphoneDeviceId}
        onChange={(e) =>
          action(() => bridge.updateSettings({ microphoneDeviceId: e.target.value }))
        }
      >
        <option value="">{t.defaultDevice}</option>
        {devices
          .filter((d) => d.deviceId && d.deviceId !== 'default')
          .map((device, i) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `Microphone ${i + 1}`}
            </option>
          ))}
      </select>
    </section>
  );
  return (
    <div className="dashboard" style={{ '--accent': settings.color } as React.CSSProperties}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Icon name="orb" size={29} />
          </div>
          <div>
            <strong>
              21<span>®</span>
            </strong>
            <small>BY 21ROBOTICS</small>
          </div>
        </div>
        <div className="workspace-label">
          PERSONAL COMPANION <span>V.3</span>
        </div>
        <nav aria-label="Main navigation">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${tab === item.id ? 'active' : ''}`}
              aria-current={tab === item.id ? 'page' : undefined}
              onClick={() => setTab(item.id)}
            >
              <Icon name={item.icon} />
              <span>{t[item.id]}</span>
              <small>{item.number}</small>
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <div className="mini-orbit">
            <span />
          </div>
          <span>
            DESIGNED TO BE
            <br />
            <strong>A PRESENCE.</strong>
          </span>
        </div>
        <div className="sidebar-bottom">
          <div className="system-status">
            <i />
            <span>{t.ready}</span>
          </div>
          <div className="system-version">
            <span>21 CORE</span>
            <span>0.4.0</span>
          </div>
          <button
            className="quit-button"
            onClick={() => action(() => bridge.quit())}
            disabled={!capabilities.desktop}
          >
            <Icon name="power" size={15} />
            {t.quit}
          </button>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            WORKSPACE <span>/</span> <strong>{t[tab]}</strong>
          </div>
          <div className="topbar-right">
            <span className="local-badge">
              <Icon name="shield" size={12} />
              {t.local}
            </span>
            <span className="organization">
              21<span>R</span>
            </span>
          </div>
        </header>
        {!capabilities.desktop && <div className="browser-banner">{t.browser}</div>}
        <div className="page-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">{t.phase}</span>
              <h1>{tab === 'overview' ? t.overview : t[tab]}</h1>
            </div>
            <div className="heading-detail">
              <span className="dot" />
              {runtime.source === 'none' ? 'VISUAL PREVIEW' : 'AUDIO REACTIVE'}
              <span className="heading-id">SYS—001</span>
            </div>
          </div>
          {(error || runtime.notice) && (
            <div className="error-banner" role="alert">
              {error || runtime.notice}
            </div>
          )}
          {tab === 'settings' ? (
            <SettingsPanel
              snapshot={snapshot}
              t={t}
              update={(patch) => {
                void run(() => bridge.updateSettings(patch));
              }}
            />
          ) : tab === 'chat' ? (
            <ConversationPanel
              settings={settings}
              desktop={capabilities.desktop}
              update={(patch) => {
                void run(() => bridge.updateSettings(patch));
              }}
            />
          ) : (
            <>
              {tab === 'audio' && (
                <VoicePanel
                  settings={settings}
                  status={voiceStatus}
                  voice={voice}
                  desktop={capabilities.desktop}
                  platform={capabilities.platform}
                  run={run}
                />
              )}
              {tab === 'audio' && (
                <div className="audio-intro">
                  <h2>{t.audioTitle}</h2>
                  <p>{t.audioDesc}</p>
                </div>
              )}
              <div className={`hero-grid ${tab === 'lab' ? 'lab-grid' : ''}`}>
                <section className="avatar-stage panel">
                  <div className="stage-header">
                    <span className="eyebrow">
                      <span className="dot" />
                      FERROFLUID ENGINE
                    </span>
                    <span className="stage-code">FE / 01</span>
                  </div>
                  {tab === 'overview' && (
                    <div className="hero-copy">
                      <h2>
                        {t.title}
                        <br />
                        <em>{t.titleEm}</em>
                      </h2>
                      <p>{t.intro}</p>
                    </div>
                  )}
                  <div className={`orb-stage ${tab === 'overview' ? 'with-copy' : ''}`}>
                    <div className="orb-grid" />
                    <div className="orbit-ring ring-one" />
                    <div className="orbit-ring ring-two" />
                    <span className="axis axis-top">Y+</span>
                    <span className="axis axis-left">X−</span>
                    <span className="axis axis-right">X+</span>
                    <Ferrofluid runtime={runtime} settings={settings} large />
                    <div className="orb-shadow" />
                  </div>
                  <div className="stage-footer">
                    <div>
                      <span className={`status-light ${runtime.state.toLowerCase()}`} />
                      <strong>{t[runtime.state]}</strong>
                      <span className="mode-caption">
                        {runtime.source === 'none' ? 'PREVIEW' : 'LIVE SIGNAL'}
                      </span>
                    </div>
                    <button
                      className="icon-button"
                      onClick={() => action(() => bridge.hideOverlay())}
                      disabled={!capabilities.desktop}
                      title={t.hide}
                      aria-label={t.hide}
                    >
                      <Icon name="orb" size={16} />
                    </button>
                  </div>
                </section>
                {audioPanel}
              </div>
              {tab === 'overview' && (
                <VoicePanel
                  settings={settings}
                  status={voiceStatus}
                  voice={voice}
                  desktop={capabilities.desktop}
                  platform={capabilities.platform}
                  run={run}
                />
              )}
              {states}
              {tab === 'lab' && (
                <SettingsPanel
                  snapshot={snapshot}
                  t={t}
                  update={(patch) => {
                    void run(() => bridge.updateSettings(patch));
                  }}
                />
              )}
            </>
          )}
          {tab === 'overview' && (
            <div className="capability-strip">
              <div>
                <Icon name="orb" />
                <span>
                  {t.graphics}
                  <small>THREE.JS / GLSL</small>
                </span>
              </div>
              <div>
                <Icon name="wave" />
                <span>
                  {t.offline}
                  <small>LOCAL WEB AUDIO</small>
                </span>
              </div>
              <div>
                <Icon name="shield" />
                <span>
                  {t.private}
                  <small>LOCAL BY DEFAULT</small>
                </span>
              </div>
            </div>
          )}
          <footer className="page-footer">
            <span>
              21ROBOTICS <span className="footer-divider">/</span> 21 · PERSONAL AI
            </span>
            <span>{capabilities.platform.toUpperCase()} · UPDATE V3</span>
          </footer>
          {tab === 'settings' && (
            <p className="roadmap">
              <strong>{t.future}</strong> {t.futureDesc}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
