import bundle from '../data/bundle.json';
import { matchPack } from './match';
import type { Pack, PackSummary, RankDefinition, SkillRequestResult } from './types';

// Set EXPO_PUBLIC_API_URL (for example http://192.168.1.20:8000) to use a running backend.
// Without it, or when the backend is unreachable, the app uses the packs bundled at build time.
const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const TIMEOUT_MS = 6000;

const local = bundle as unknown as {
  ranks: { ranks: RankDefinition[] };
  summaries: PackSummary[];
  packs: Record<string, Pack>;
  aliases: Record<string, string[]>;
};

export type DataSource = 'server' | 'bundled';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) throw new Error('no API configured');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function withFallback<T>(remote: () => Promise<T>, fallback: () => T): Promise<{ data: T; source: DataSource }> {
  try {
    return { data: await remote(), source: 'server' };
  } catch {
    return { data: fallback(), source: 'bundled' };
  }
}

export function listPacks() {
  return withFallback(
    () => request<PackSummary[]>('/packs'),
    () => local.summaries,
  );
}

export async function getPack(id: string) {
  const result = await withFallback<Pack | null>(
    () => request<Pack>(`/packs/${encodeURIComponent(id)}`),
    () => local.packs[id] ?? null,
  );
  return result;
}

export function getRanks() {
  return withFallback(
    async () => (await request<{ ranks: RankDefinition[] }>('/ranks')).ranks,
    () => local.ranks.ranks,
  );
}

export function requestSkill(text: string) {
  return withFallback<SkillRequestResult>(
    () => request<SkillRequestResult>('/skill-requests', { method: 'POST', body: JSON.stringify({ text }) }),
    () => {
      const id = matchPack(text, local.aliases);
      return id
        ? { status: 'matched', request_id: 'local', pack: id, goal_template: null, score: 1, message: '' }
        : { status: 'queued', request_id: 'local', message: '' };
    },
  );
}
