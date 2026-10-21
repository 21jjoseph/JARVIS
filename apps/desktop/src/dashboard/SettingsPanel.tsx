import type { Settings, Snapshot } from '../../../../shared/contracts';
import type { Copy } from '../services/i18n';
export function SettingsPanel({
  snapshot,
  t,
  update,
}: {
  snapshot: Snapshot;
  t: Copy;
  update: (patch: Partial<Settings>) => void;
}) {
  const { settings: s, capabilities: c } = snapshot;
  return (
    <div className="settings-grid">
      <section className="panel settings-panel">
        <div className="section-heading">
          <span className="eyebrow">01 / VISUAL</span>
          <h2>{t.appearance}</h2>
        </div>
        <div className="setting-row">
          <label htmlFor="accent">{t.color}</label>
          <div className="swatches">
            {['#62e5e5', '#9aa7ff', '#e9c285', '#e3a3cc'].map((color) => (
              <button
                key={color}
                aria-label={`Accent ${color}`}
                aria-pressed={s.color === color}
                className="swatch"
                style={{ background: color }}
                onClick={() => update({ color })}
              />
            ))}
            <input
              id="accent"
              aria-label={t.color}
              type="color"
              value={s.color}
              onChange={(e) => update({ color: e.target.value })}
            />
          </div>
        </div>
        <div className="setting-range">
          <label htmlFor="size">
            {t.size}
            <output>{s.size} px</output>
          </label>
          <input
            id="size"
            type="range"
            min="220"
            max="520"
            step="10"
            value={s.size}
            onChange={(e) => update({ size: Number(e.target.value) })}
          />
        </div>
        <div className="setting-range">
          <label htmlFor="intensity">
            {t.intensity}
            <output>{Math.round(s.intensity * 100)}%</output>
          </label>
          <input
            id="intensity"
            type="range"
            min="0"
            max="1.5"
            step="0.05"
            value={s.intensity}
            onChange={(e) => update({ intensity: Number(e.target.value) })}
          />
        </div>
        <div className="setting-row">
          <label htmlFor="quality">{t.quality}</label>
          <select
            id="quality"
            value={s.quality}
            onChange={(e) => update({ quality: e.target.value as Settings['quality'] })}
          >
            <option value="auto">Adaptive</option>
            <option value="low">Eco · 30 FPS</option>
            <option value="high">High · 60 FPS</option>
          </select>
        </div>
        <Toggle
          title={t.reduced}
          description={t.reducedDesc}
          checked={s.reducedMotion}
          onChange={(checked) => update({ reducedMotion: checked })}
        />
      </section>
      <section className="panel settings-panel">
        <div className="section-heading">
          <span className="eyebrow">02 / SYSTEM</span>
          <h2>{t.desktop}</h2>
        </div>
        <Toggle
          title={t.top}
          description={t.topDesc}
          checked={s.alwaysOnTop}
          disabled={!c.desktop}
          onChange={(checked) => update({ alwaysOnTop: checked })}
        />
        <Toggle
          title={t.through}
          description={
            c.clickThrough ? t.throughDesc : 'macOS / Windows · unavailable on this platform'
          }
          checked={s.clickThrough && c.clickThrough}
          disabled={!c.clickThrough}
          onChange={(checked) => update({ clickThrough: checked })}
        />
        <Toggle
          title={t.login}
          description={t.loginDesc}
          checked={s.launchAtLogin}
          disabled={!c.loginItem}
          onChange={(checked) => update({ launchAtLogin: checked })}
        />
        <div className="setting-row">
          <label htmlFor="language">{t.language}</label>
          <select
            id="language"
            value={s.locale}
            onChange={(e) => update({ locale: e.target.value as Settings['locale'] })}
          >
            <option value="ro">Română</option>
            <option value="en">English</option>
          </select>
        </div>
        <div className="shortcut-row">
          <span>{t.shortcut}</span>
          <kbd>{c.platform === 'darwin' ? '⌘' : 'Ctrl'} ⇧ J</kbd>
        </div>
        {!c.shortcut && c.desktop && (
          <p className="muted">Shortcut unavailable. Use the tray menu.</p>
        )}
      </section>
    </div>
  );
}
function Toggle({
  title,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`toggle-row ${disabled ? 'disabled' : ''}`}>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <button
        role="switch"
        aria-label={title}
        aria-checked={checked}
        disabled={disabled}
        className="toggle"
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}
