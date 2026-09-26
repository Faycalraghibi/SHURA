import { Platform } from 'react-native';

import type { Tier } from './lib/types';

// The System's look: deep night background, translucent blue windows with a cyan glow.
export const colors = {
  bg: '#04060D',
  surface: 'rgba(12, 26, 52, 0.88)',
  surfaceHigh: 'rgba(22, 44, 86, 0.92)',
  border: '#2F8CFF',
  borderDim: 'rgba(47, 140, 255, 0.35)',
  glow: '#3AA8FF',
  text: '#E6F1FF',
  textDim: '#8FA8C8',
  accent: '#58C3FF',
  gold: '#FFD166',
  warn: '#F2B84B',
  danger: '#FF4D6D',
  success: '#4CE0A4',
  edge: 'rgba(88, 195, 255, 0.28)',
  edgeActive: '#58C3FF',
};

export const rankColors: Record<Tier, string> = {
  F: '#8A94A6',
  E: '#4CE0A4',
  D: '#3FB6E0',
  C: '#58C3FF',
  B: '#B084F5',
  A: '#FFD166',
  S: '#FF4D6D',
};

export const mono = Platform.select({ android: 'monospace', ios: 'Menlo', default: 'monospace' });

export const glow = (color: string = colors.glow, radius = 14) => ({
  boxShadow: `0 0 ${radius}px ${color}`,
});

export const space = (n: number) => n * 4;

// Minimum touch target on Android (Material): 48dp.
export const TOUCH = 48;
