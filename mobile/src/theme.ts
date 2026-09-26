import type { Tier } from './lib/types';

export const colors = {
  bg: '#0B0D12',
  surface: '#151924',
  surfaceHigh: '#1E2433',
  border: '#2A3244',
  text: '#EEF1F7',
  textDim: '#9AA4B8',
  accent: '#7C9CFF',
  warn: '#F2B84B',
  danger: '#FF6B6B',
  edge: '#3A4560',
  edgeActive: '#7C9CFF',
};

export const rankColors: Record<Tier, string> = {
  F: '#8A94A6',
  E: '#4FC38A',
  D: '#3FB6E0',
  C: '#7C9CFF',
  B: '#B084F5',
  A: '#F2B84B',
  S: '#FF6B6B',
};

export const space = (n: number) => n * 4;

// Minimum touch target on Android (Material): 48dp.
export const TOUCH = 48;
