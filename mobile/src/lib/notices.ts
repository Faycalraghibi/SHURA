import type { SystemNotice } from './noticeTypes';
import type { SystemEvent } from '../engine/player';
import type { Player } from '../engine/types';
import { t } from '../i18n/en';
import { tierIndex } from './types';

export function eventNotices(events: SystemEvent[]): SystemNotice[] {
  const out: SystemNotice[] = [];
  for (const e of events) {
    switch (e.kind) {
      case 'quest_complete':
        out.push({ title: t.cleared, body: `${e.title}  ${t.xpGained(e.xp)}`, tone: 'success' });
        break;
      case 'quest_failed':
        out.push({ title: t.failed, body: e.title, tone: 'danger' });
        break;
      case 'level_up':
        out.push({ title: t.nLevel(e.level), tone: 'gold' });
        break;
      case 'rank_up':
        out.push({ title: t.nRank(e.skill, `${e.from ?? '—'} → ${e.to}`), tone: 'gold' });
        break;
      case 'daily_complete':
        out.push({ title: t.nDaily, body: t.streak(e.streak), tone: 'success' });
        break;
      case 'penalty_issued':
        out.push({ title: t.nPenalty, tone: 'danger' });
        break;
      case 'penalty_cleared':
        out.push({ title: t.nPenaltyCleared, tone: 'success' });
        break;
    }
  }
  return out;
}

/** Titles are earned from evidence and habits, never granted by the AI. */
export function playerTitle(p: Player): string {
  const best = Object.values(p.skills)
    .map((s) => s.bestRank)
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => tierIndex(b) - tierIndex(a))[0];
  if (best === 'S') return t.titles.rankS;
  if (best && tierIndex(best) >= tierIndex('B')) return t.titles.rankB;
  if (best && tierIndex(best) >= tierIndex('D')) return t.titles.rankD;
  if (p.daily.streak >= 7) return t.titles.streak7;
  return t.titles.awakened;
}
