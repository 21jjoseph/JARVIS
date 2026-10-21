import { useEffect, useRef, useState } from 'react';
import { Ferrofluid } from '../avatar/Ferrofluid';
import { useJarvis } from '../hooks/useJarvis';
import { copy } from '../services/i18n';
import { Icon } from './Icon';

export function Overlay() {
  const { snapshot, audio, audioActive, run, error, bridge } = useJarvis();
  const drag = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const suppressClick = useRef(false);
  const [hover, setHover] = useState(false);
  useEffect(() => {
    const clearPendingClick = () => {
      if (document.hidden) clearTimeout(clickTimer.current);
    };
    document.addEventListener('visibilitychange', clearPendingClick);
    return () => {
      clearTimeout(clickTimer.current);
      document.removeEventListener('visibilitychange', clearPendingClick);
    };
  }, []);
  if (!snapshot)
    return (
      <div className="overlay-loading" role="status">
        {error || 'JARVIS…'}
      </div>
    );
  const t = copy[snapshot.settings.locale];
  return (
    <div className="overlay" style={{ '--accent': snapshot.settings.color } as React.CSSProperties}>
      <Ferrofluid runtime={snapshot.runtime} settings={snapshot.settings} />
      <div
        className="avatar-hit-area"
        role="button"
        tabIndex={0}
        aria-label={t.activate}
        onPointerEnter={() => {
          setHover(true);
          bridge.setInteractive(true);
        }}
        onPointerLeave={() => {
          if (!drag.current) {
            setHover(false);
            bridge.setInteractive(false);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void run(() => bridge.openDashboard());
          if (e.code === 'Space') {
            e.preventDefault();
            void run(() =>
              audioActive ? audio.stop() : audio.microphone(snapshot.settings.microphoneDeviceId),
            );
          }
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          drag.current = {
            x: e.screenX,
            y: e.screenY,
            startX: e.screenX,
            startY: e.screenY,
            moved: false,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          if (Math.hypot(e.screenX - d.startX, e.screenY - d.startY) > 5) d.moved = true;
          if (d.moved) {
            const dx = e.screenX - d.x,
              dy = e.screenY - d.y;
            d.x = e.screenX;
            d.y = e.screenY;
            if (dx || dy) void run(() => bridge.moveOverlay(dx, dy));
          }
        }}
        onPointerCancel={() => {
          drag.current = null;
          bridge.setInteractive(false);
        }}
        onPointerUp={(e) => {
          const moved = drag.current?.moved;
          drag.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
          if (moved) {
            clearTimeout(clickTimer.current);
            suppressClick.current = true;
          }
        }}
        onClick={(e) => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          clearTimeout(clickTimer.current);
          if (e.detail === 1)
            clickTimer.current = setTimeout(() => {
              void run(() =>
                audioActive ? audio.stop() : audio.microphone(snapshot.settings.microphoneDeviceId),
              );
            }, 500);
        }}
        onDoubleClick={() => {
          clearTimeout(clickTimer.current);
          void run(() => bridge.openDashboard());
        }}
      />
      <div
        className={`overlay-label ${hover || snapshot.runtime.source !== 'none' ? 'visible' : ''}`}
      >
        <span className="dot" />
        {t[snapshot.runtime.state]}
        <span className="overlay-mode">
          {snapshot.runtime.source === 'none' ? 'PREVIEW' : 'LIVE'}
        </span>
      </div>
      <button
        className="overlay-open"
        title={t.overview}
        aria-label={t.overview}
        onPointerEnter={() => bridge.setInteractive(true)}
        onClick={() => {
          void run(() => bridge.openDashboard());
        }}
      >
        <Icon name="grid" size={14} />
      </button>
      {error && (
        <div className="overlay-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
