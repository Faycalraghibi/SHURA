import type { Pack, Tier } from '../lib/types';

export const EVIDENCE_TYPES = [
  'recognition',
  'recall',
  'explanation',
  'modification',
  'debugging',
  'production',
  'transfer',
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export type FailureCause =
  | 'none'
  | 'slip'
  | 'execution_error'
  | 'misconception'
  | 'missing_prerequisite'
  | 'forgotten'
  | 'transfer_gap'
  | 'off_topic';

/** One piece of evidence: a graded attempt on one competency. Never edited after it is recorded. */
export interface EvidenceRecord {
  at: number; // epoch ms
  type: EvidenceType;
  score: number; // 0..1
  passed: boolean;
  hintLevel: number; // 0 = no help, 6 = full solution seen
  retest: boolean;
  xp: number;
  cause: FailureCause;
  questTitle: string;
}

export interface CompetencyState {
  ability: number; // Elo-style
  evidence: EvidenceRecord[];
  firstSuccessAt: number | null;
  stabilityDays: number;
  nextReviewAt: number | null;
  missingPrerequisite: string | null;
}

export interface SkillState {
  pack: Pack;
  startedAt: number;
  assessed: boolean;
  competencies: Record<string, CompetencyState>;
  bestRank: Tier | null;
}

export interface DailyState {
  date: string; // YYYY-MM-DD (local)
  done: number;
  target: number;
  streak: number;
  lastCompleted: string | null;
  penaltyPending: boolean;
}

export interface LogEntry {
  at: number;
  kind: 'quest' | 'level' | 'rank' | 'penalty' | 'system';
  text: string;
}

export interface Player {
  version: 1;
  name: string;
  createdAt: number;
  xp: number;
  activeSkill: string | null;
  skills: Record<string, SkillState>;
  daily: DailyState;
  log: LogEntry[];
}

export type CompetencyStatus = 'locked' | 'available' | 'training' | 'proven' | 'mastered' | 'decaying';
