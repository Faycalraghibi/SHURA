// Client for the System endpoints (backend/shura/api/app.py). The NVIDIA key stays on the server.

import bundle from '../data/bundle.json';
import type { EvidenceType, FailureCause } from '../engine/types';
import { matchPack } from './match';
import type { Pack, Tier } from './types';

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

const local = bundle as unknown as { packs: Record<string, Pack>; aliases: Record<string, string[]> };

export interface ChoiceItem {
  competency_id: string;
  question: string;
  options: string[];
  answer_index: number;
  explanation: string;
}

export interface Resource {
  title: string;
  url: string;
  kind: 'video_search' | 'docs_search';
}

export interface Quest {
  id: string;
  pack_id: string;
  competency_id: string;
  competency_name: string;
  tier: Tier;
  evidence_type: EvidenceType;
  retest: boolean;
  title: string;
  flavor: string;
  objective: string;
  format: 'choice' | 'written' | 'code';
  instructions: string;
  requirements: string[];
  items: ChoiceItem[];
  rubric: string[];
  starter: string;
  resources: Resource[];
}

export interface Evaluation {
  score: number;
  passed: boolean;
  criteria: { criterion: string; met: boolean; comment: string }[];
  feedback: string;
  strengths: string[];
  weaknesses: string[];
  failure_cause: FailureCause;
  missing_prerequisite: string | null;
}

export class SystemUnavailable extends Error {}

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  if (!API_URL) throw new SystemUnavailable('No server configured. Set EXPO_PUBLIC_API_URL to your SHURA backend.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        if (typeof j.detail === 'string') detail = j.detail;
      } catch {
        // keep the status text
      }
      throw new Error(detail);
    }
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error('The System took too long to answer. Try again.');
    if (e instanceof TypeError) throw new SystemUnavailable('The System is unreachable. Is the backend running and on the same network?');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Build (or reuse) the skill tree. Skills bundled in the app work without the server. */
export async function awaken(skill: string, goal?: string): Promise<{ pack: Pack; newlyBuilt: boolean }> {
  try {
    const r = await post<{ pack: Pack; newly_built: boolean }>('/system/awaken', { skill, goal }, 300_000);
    return { pack: r.pack, newlyBuilt: r.newly_built };
  } catch (e) {
    const id = matchPack(skill, local.aliases);
    if (e instanceof SystemUnavailable && id) return { pack: local.packs[id], newlyBuilt: false };
    throw e;
  }
}

export function assess(packId: string, count = 8) {
  return post<{ items: ChoiceItem[] }>('/system/assess', { pack_id: packId, count }, 120_000).then((r) => r.items);
}

export function requestQuest(req: {
  pack_id: string;
  competency_id: string;
  evidence_type: EvidenceType;
  known: string[];
  weakness: string | null;
  retest: boolean;
}) {
  return post<Quest>('/system/quest', req, 120_000);
}

export function evaluate(quest: Quest, submission: string, hintsUsed: number) {
  return post<Evaluation>('/system/evaluate', { quest, submission, hints_used: hintsUsed }, 120_000);
}

export function requestHint(quest: Quest, attempt: string, level: number) {
  return post<{ level: number; hint: string }>('/system/hint', { quest, attempt, level }, 90_000).then((r) => r.hint);
}

/** Choice quests are graded on the phone: objective checks never go to the AI (VISION §20). */
export function gradeChoices(items: ChoiceItem[], picks: (number | null)[]): { score: number; passed: boolean } {
  if (!items.length) return { score: 0, passed: false };
  const correct = items.filter((it, i) => picks[i] === it.answer_index).length;
  const score = correct / items.length;
  return { score, passed: score >= 0.7 };
}
