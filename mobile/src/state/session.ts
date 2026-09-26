// Short-lived hand-off between screens (not persisted): the result of the quest just judged.
import type { SystemEvent } from '../engine/player';
import type { Evaluation, Quest } from '../lib/system';

export interface LastResult {
  quest: Quest;
  score: number;
  passed: boolean;
  xp: number;
  evaluation: Evaluation | null; // null for choice quests graded on the phone
  picks: (number | null)[];
  events: SystemEvent[];
}

let last: LastResult | null = null;

export function setLastResult(r: LastResult) {
  last = r;
}

export function getLastResult(): LastResult | null {
  return last;
}
