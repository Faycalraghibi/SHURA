import { describe, expect, it } from 'vitest';

import bundle from '../../data/bundle.json';
import { matchPack } from '../match';

const aliases = (bundle as unknown as { aliases: Record<string, string[]> }).aliases;

describe('matchPack (offline fallback)', () => {
  it.each([
    ['Python', 'python'],
    ['python programming', 'python'],
    ['Python for data analysis', 'python'],
    ['I want to learn SQL', 'sql'],
    ['PostgreSQL', 'sql'],
    ['nihongo', 'japanese'],
  ])('%s -> %s', (text, pack) => {
    expect(matchPack(text, aliases)).toBe(pack);
  });

  it.each(['Rust', 'swimming', '', '   '])('no match for %j', (text) => {
    expect(matchPack(text, aliases)).toBeNull();
  });
});
