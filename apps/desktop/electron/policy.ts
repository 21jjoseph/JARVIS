import { pathToFileURL } from 'node:url';
export function trustedRendererUrl(candidate: string, indexPath: string, devUrl?: string): boolean {
  try {
    const url = new URL(candidate);
    if (devUrl) return url.origin === new URL(devUrl).origin && url.pathname === '/';
    return (
      url.protocol === 'file:' &&
      url.host === '' &&
      url.pathname === new URL(pathToFileURL(indexPath).href).pathname &&
      url.search === ''
    );
  } catch {
    return false;
  }
}
export function safeDevUrl(input: string | undefined): string | undefined {
  if (!input) return undefined;
  if (input !== 'http://127.0.0.1:5173')
    throw new Error('Development URL must be the fixed local Vite origin.');
  return input;
}
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export function clampPosition(
  position: { x: number; y: number },
  size: number,
  workAreas: Bounds[],
): { x: number; y: number } {
  const area =
    workAreas.find(
      (a) =>
        position.x + size / 2 >= a.x &&
        position.x + size / 2 <= a.x + a.width &&
        position.y + size / 2 >= a.y &&
        position.y + size / 2 <= a.y + a.height,
    ) ?? workAreas[0];
  if (!area) return { x: 0, y: 0 };
  return {
    x: Math.round(Math.max(area.x, Math.min(position.x, area.x + area.width - size))),
    y: Math.round(Math.max(area.y, Math.min(position.y, area.y + area.height - size))),
  };
}
