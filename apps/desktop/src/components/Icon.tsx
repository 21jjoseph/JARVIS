import type { CSSProperties } from 'react';
export type IconName =
  | 'orb'
  | 'grid'
  | 'sliders'
  | 'mic'
  | 'wave'
  | 'power'
  | 'arrow'
  | 'play'
  | 'stop'
  | 'shield'
  | 'cross'
  | 'chevron'
  | 'headphones';
const paths: Record<IconName, string[]> = {
  orb: [
    'M12 3 14 7 19 5 17 10 22 12 17 14 19 19 14 17 12 22 10 17 5 19 7 14 2 12 7 10 5 5 10 7Z',
    'M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0',
  ],
  grid: ['M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z'],
  sliders: ['M4 4v5m0 4v7M12 4v9m0 4v3M20 4v2m0 4v10', 'M1 9h6M9 17h6M17 6h6'],
  mic: ['M9 6a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0z', 'M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8'],
  wave: ['M3 10v4M7 6v12M12 3v18M17 6v12M21 10v4'],
  power: ['M12 2v10', 'M6.3 5.6a9 9 0 1 0 11.4 0'],
  arrow: ['M5 12h14M13 6l6 6-6 6'],
  play: ['M8 4 20 12 8 20Z'],
  stop: ['M6 6h12v12H6z'],
  shield: ['M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6Z', 'm8 12 3 3 5-6'],
  cross: ['m6 6 12 12M6 18 18 6'],
  chevron: ['m9 5 7 7-7 7'],
  headphones: ['M3 14v-2a9 9 0 0 1 18 0v2M3 13h4v8H3zM17 13h4v8h-4z'],
};
export function Icon({
  name,
  size = 18,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {paths[name].map((d, i) => (
        <path d={d} key={i} />
      ))}
    </svg>
  );
}
