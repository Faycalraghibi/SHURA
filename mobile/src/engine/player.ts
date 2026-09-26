// Player state transitions. Pure functions: (player, input) -> (new player, System events).

import { tierIndex, type Pack, type Tier } from '../lib/types';
import { applyEvidence, isMastered, newCompetencyState } from './mastery';
import { levelFromXp, questXp, rankInfo } from './progression';
import type { EvidenceType, FailureCause, LogEntry, Player, SkillState } from './types';

export const DAILY_TARGET = 3;

export type SystemEvent =
  | { kind: 'quest_complete'; title: string; xp: number }
  | { kind: 'quest_failed'; title: string }
  | { kind: 'level_up'; level: number }
  | { kind: 'rank_up'; skill: string; from: Tier | null; to: Tier }
  | { kind: 'daily_complete'; streak: number }
  | { kind: 'penalty_cleared' }
  | { kind: 'penalty_issued' };

export function localDate(ms: number): string {
  const d = new Date(ms);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function previousDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return localDate(new Date(y, m - 1, d - 1, 12).getTime());
}

export function createPlayer(name: string, now: number): Player {
  return {
    version: 1,
    name: name.trim() || 'Hunter',
    createdAt: now,
    xp: 0,
    activeSkill: null,
    skills: {},
    daily: { date: localDate(now), done: 0, target: DAILY_TARGET, streak: 0, lastCompleted: null, penaltyPending: false },
    log: [{ at: now, kind: 'system', text: 'You have acquired the qualifications to be a Player.' }],
  };
}

function withLog(player: Player, entries: LogEntry[]): Player {
  return { ...player, log: [...entries.reverse(), ...player.log].slice(0, 200) };
}

export function startSkill(player: Player, pack: Pack, now: number): Player {
  if (player.skills[pack.pack]) return { ...player, activeSkill: pack.pack };
  const skill: SkillState = { pack, startedAt: now, assessed: false, competencies: {}, bestRank: null };
  return withLog(
    { ...player, activeSkill: pack.pack, skills: { ...player.skills, [pack.pack]: skill } },
    [{ at: now, kind: 'system', text: `New skill registered: ${pack.name}.` }],
  );
}

/**
 * Placement (VISION §4): correct answers are recognition evidence; a correct answer also gives its
 * prerequisites inferred partial credit. Placement alone never proves or ranks anything.
 */
export function applyPlacement(
  player: Player,
  packId: string,
  answers: { competencyId: string; correct: boolean }[],
  now: number,
): Player {
  const skill = player.skills[packId];
  if (!skill) return player;
  const byId = new Map(skill.pack.competencies.map((c) => [c.id, c]));
  const comps = { ...skill.competencies };
  for (const a of answers) {
    const c = byId.get(a.competencyId);
    if (!c) continue;
    const s = comps[c.id] ?? newCompetencyState();
    comps[c.id] = applyEvidence(s, c.tier, {
      at: now,
      type: 'recognition',
      score: a.correct ? 1 : 0,
      passed: a.correct,
      hintLevel: 0,
      retest: false,
      xp: 0,
      cause: a.correct ? 'none' : 'misconception',
      questTitle: 'Assessment',
    });
    if (a.correct) {
      // Placement answers only show recognition, so they do not start the retest clock.
      comps[c.id] = { ...comps[c.id], firstSuccessAt: s.firstSuccessAt, nextReviewAt: s.nextReviewAt };
      for (const p of c.prerequisites) {
        if (!byId.has(p)) continue;
        const ps = comps[p] ?? newCompetencyState();
        comps[p] = { ...ps, ability: Math.max(ps.ability, -100) };
      }
    }
  }
  return withLog(
    { ...player, skills: { ...player.skills, [packId]: { ...skill, competencies: comps, assessed: true } } },
    [{ at: now, kind: 'system', text: `Assessment complete: ${answers.filter((a) => a.correct).length}/${answers.length} correct.` }],
  );
}

/** Start of a new day: a missed daily quest issues a penalty quest (a retest set). Nothing is taken away. */
export function rollDaily(player: Player, now: number): { player: Player; events: SystemEvent[] } {
  const today = localDate(now);
  const d = player.daily;
  if (d.date === today) return { player, events: [] };
  const hasHistory = Object.values(player.skills).some((s) => Object.values(s.competencies).some((c) => c.firstSuccessAt !== null));
  const missed = d.done < d.target && hasHistory;
  const daily = {
    ...d,
    date: today,
    done: 0,
    streak: d.lastCompleted === previousDate(today) || d.lastCompleted === today ? d.streak : 0,
    penaltyPending: d.penaltyPending || missed,
  };
  const events: SystemEvent[] = missed && !d.penaltyPending ? [{ kind: 'penalty_issued' }] : [];
  let next = { ...player, daily };
  if (events.length) next = withLog(next, [{ at: now, kind: 'penalty', text: 'Daily quest failed. Penalty quest issued.' }]);
  return { player: next, events };
}

export interface QuestResult {
  packId: string;
  competencyId: string;
  type: EvidenceType;
  score: number;
  passed: boolean;
  hintLevel: number;
  retest: boolean;
  cause: FailureCause;
  missingPrerequisite: string | null;
  questTitle: string;
  penalty?: boolean;
}

export function recordResult(player: Player, r: QuestResult, now: number): { player: Player; events: SystemEvent[]; xp: number } {
  const rolled = rollDaily(player, now);
  player = rolled.player;
  const events: SystemEvent[] = [...rolled.events];
  const skill = player.skills[r.packId];
  const c = skill?.pack.competencies.find((x) => x.id === r.competencyId);
  if (!skill || !c) return { player, events, xp: 0 };

  const before = skill.competencies[c.id] ?? newCompetencyState();
  const rankBefore = rankInfo(skill).rank;
  const levelBefore = levelFromXp(player.xp).level;
  const xp = questXp({
    tier: c.tier,
    type: r.type,
    score: r.score,
    passed: r.passed,
    hintLevel: r.hintLevel,
    retest: r.retest,
    alreadyMastered: isMastered(before, c.tier),
  });
  let after = applyEvidence(before, c.tier, {
    at: now,
    type: r.type,
    score: r.score,
    passed: r.passed,
    hintLevel: r.hintLevel,
    retest: r.retest,
    xp,
    cause: r.cause,
    questTitle: r.questTitle,
  });
  const localIds = new Set(skill.pack.competencies.map((x) => x.id));
  if (!r.passed && r.missingPrerequisite && localIds.has(r.missingPrerequisite)) {
    after = { ...after, missingPrerequisite: r.missingPrerequisite };
  }
  const newSkill: SkillState = { ...skill, competencies: { ...skill.competencies, [c.id]: after } };
  const info = rankInfo(newSkill);
  if (info.rank && (rankBefore === null || tierIndex(info.rank) > tierIndex(rankBefore))) {
    events.push({ kind: 'rank_up', skill: skill.pack.name, from: rankBefore, to: info.rank });
  }
  const best = [newSkill.bestRank, info.rank].filter(Boolean).sort((a, b) => tierIndex(b!) - tierIndex(a!))[0] ?? null;
  newSkill.bestRank = best;

  let daily = player.daily;
  const log: LogEntry[] = [];
  if (r.passed) {
    events.unshift({ kind: 'quest_complete', title: r.questTitle, xp });
    log.push({ at: now, kind: 'quest', text: `Quest complete: ${r.questTitle} (+${xp} XP)` });
    if (daily.penaltyPending && r.retest) {
      daily = { ...daily, penaltyPending: false };
      events.push({ kind: 'penalty_cleared' });
      log.push({ at: now, kind: 'penalty', text: 'Penalty quest cleared.' });
    }
    const done = daily.done + 1;
    if (done === daily.target) {
      const streak = daily.lastCompleted === previousDate(daily.date) ? daily.streak + 1 : 1;
      daily = { ...daily, done, streak, lastCompleted: daily.date };
      events.push({ kind: 'daily_complete', streak });
      log.push({ at: now, kind: 'system', text: `Daily quest complete. Streak: ${streak} day${streak === 1 ? '' : 's'}.` });
    } else {
      daily = { ...daily, done };
    }
  } else {
    events.unshift({ kind: 'quest_failed', title: r.questTitle });
    log.push({ at: now, kind: 'quest', text: `Quest failed: ${r.questTitle}` });
  }

  const totalXp = player.xp + xp;
  const levelAfter = levelFromXp(totalXp).level;
  if (levelAfter > levelBefore) {
    events.push({ kind: 'level_up', level: levelAfter });
    log.push({ at: now, kind: 'level', text: `Level up! Level ${levelAfter}.` });
  }
  if (events.some((e) => e.kind === 'rank_up')) {
    log.push({ at: now, kind: 'rank', text: `Rank up: ${skill.pack.name} ${rankBefore ?? '-'} → ${info.rank}` });
  }
  const next = withLog({ ...player, xp: totalXp, daily, skills: { ...player.skills, [r.packId]: newSkill } }, log);
  return { player: next, events, xp };
}
