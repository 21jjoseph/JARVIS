import { describe, expect, it } from 'vitest';
import { clampPosition, safeDevUrl, trustedRendererUrl } from '../../apps/desktop/electron/policy';
describe('renderer boundary', () => {
  const path = '/workspace/JARVIS/dist/index.html';
  it('trusts only the exact local page or fixed dev origin', () => {
    expect(trustedRendererUrl('file:///workspace/JARVIS/dist/index.html#overlay', path)).toBe(true);
    expect(
      trustedRendererUrl(
        'http://127.0.0.1:5173/#dashboard',
        path,
        safeDevUrl('http://127.0.0.1:5173'),
      ),
    ).toBe(true);
  });
  it.each([
    'https://example.com',
    'file:///etc/passwd',
    'file://evil/workspace/JARVIS/dist/index.html',
    'http://127.0.0.1:5173.evil.com/',
    'http://127.0.0.1:5173/evil',
    'not a url',
  ])('rejects untrusted URL %s', (url) => {
    expect(trustedRendererUrl(url, path)).toBe(false);
    expect(trustedRendererUrl(url, path, 'http://127.0.0.1:5173')).toBe(false);
  });
  it('rejects remote development URLs', () => {
    expect(() => safeDevUrl('https://evil.com')).toThrow();
  });
});
describe('persisted display position', () => {
  const areas = [
    { x: 0, y: 0, width: 1440, height: 900 },
    { x: -1440, y: 0, width: 1440, height: 900 },
  ];
  it('keeps the avatar visible after an external monitor is disconnected', () => {
    expect(clampPosition({ x: 4000, y: 3000 }, 320, areas)).toEqual({ x: 1120, y: 580 });
  });
  it('preserves valid negative positions on a second monitor', () => {
    expect(clampPosition({ x: -500, y: 200 }, 320, areas)).toEqual({ x: -500, y: 200 });
  });
});
