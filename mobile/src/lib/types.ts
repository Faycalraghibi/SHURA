// Mirrors the backend API (backend/shura/api/app.py). The format itself is defined in
// backend/shura/format/models.py and exported as JSON Schema to packs/schema/.

export const TIERS = ['F', 'E', 'D', 'C', 'B', 'A', 'S'] as const;
export type Tier = (typeof TIERS)[number];

export type Verifiability = 'objective' | 'mixed' | 'rubric' | 'self_reported' | null;

export interface PackSummary {
  pack: string;
  name: string;
  scope: string;
  version: string;
  maturity: 'draft' | 'calibrated' | 'reviewed';
  verified_ceiling: Tier | null;
  ceiling_message: string;
  competency_count: number;
  top_tier: Tier;
}

export interface Competency {
  id: string;
  name: string;
  tier: Tier;
  prerequisites: string[];
  mastery_criteria: string;
  common_mistakes: string[];
  adapters: string[];
  verifiability: Verifiability;
  grounded_in: string[];
  core: boolean;
}

export interface Source {
  id: string;
  kind: string;
  title: string;
  url?: string | null;
}

export interface GoalTemplate {
  name: string;
  target_rank: Tier;
  emphasis: string[];
}

export interface Pack extends PackSummary {
  format_version: number;
  freshness: 'slow' | 'fast';
  sources: Source[];
  competencies: Competency[];
  goal_templates: GoalTemplate[];
}

export interface RankDefinition {
  rank: Tier;
  title: string;
  meaning: string;
  observable: string;
  evidence_focus: string[];
  trial: string;
}

export type SkillRequestResult =
  | { status: 'matched'; request_id: string; pack: string; goal_template: string | null; score: number; message: string }
  | { status: 'queued'; request_id: string; message: string };

export function tierIndex(t: Tier): number {
  return TIERS.indexOf(t);
}
