import type { AvatarState } from '../../../../shared/contracts';
export interface Profile {
  speed: number;
  spikes: number;
  breath: number;
  glow: number;
  heat: number;
}
export const PROFILES: Record<AvatarState, Profile> = {
  WAKE_DETECTED:{speed:0.5,spikes:0.48,breath:0.045,glow:0.65,heat:0},
  TRANSCRIBING:{speed:0.7,spikes:0.5,breath:0.04,glow:0.5,heat:0},
  MUTED:{speed:0.1,spikes:0.18,breath:0.015,glow:0.14,heat:0},
  IDLE: { speed: 0.18, spikes: 0.24, breath: 0.025, glow: 0.26, heat: 0 },
  LISTENING: { speed: 0.38, spikes: 0.46, breath: 0.045, glow: 0.55, heat: 0 },
  THINKING: { speed: 0.85, spikes: 0.54, breath: 0.04, glow: 0.46, heat: 0 },
  SPEAKING: { speed: 0.45, spikes: 0.38, breath: 0.06, glow: 0.65, heat: 0 },
  EXECUTING: { speed: 0.62, spikes: 0.45, breath: 0.07, glow: 0.55, heat: 0 },
  WARNING: { speed: 0.28, spikes: 0.4, breath: 0.04, glow: 0.5, heat: 0.65 },
  ERROR: { speed: 0.18, spikes: 0.54, breath: 0.025, glow: 0.58, heat: 1 },
  OFFLINE: { speed: 0.07, spikes: 0.12, breath: 0.012, glow: 0.08, heat: 0 },
};
export function damp(from: number, to: number, dt: number, rate = 5): number {
  return from + (to - from) * (1 - Math.exp(-rate * Math.max(0, dt)));
}
