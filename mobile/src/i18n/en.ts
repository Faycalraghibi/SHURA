// Every user-facing string lives here from the first screen, so French and Arabic later are
// translation work, not a refactor.

export const en = {
  appName: 'SHURA',
  tagline: 'Name any skill. Prove it rank by rank.',
  searchPlaceholder: 'What do you want to learn?',
  searchButton: 'Build my path',
  searchA11y: 'Skill to learn',
  searching: 'Looking for your skill…',
  packsTitle: 'Ready now',
  competencies: (n: number) => `${n} competencies`,
  maturity: { draft: 'Draft', calibrated: 'Calibrated', reviewed: 'Expert reviewed' },
  queuedTitle: 'Not forged yet',
  queuedBody: (skill: string) =>
    `There is no path for “${skill}” yet. The Skill Forge will build one from real curricula. We will notify you when it is ready.`,
  offline: 'Offline: showing skills bundled with the app.',
  rankMapTitle: 'Rank map',
  ceilingNone: 'Not verifiable yet',
  ceilingLabel: (t: string) => `Verified up to ${t}`,
  zoomHint: 'Pinch to zoom, drag to move, tap a competency.',
  resetView: 'Fit',
  aboveCeiling: 'Above the verified ceiling: SHURA guides but cannot certify this.',
  rankLabel: (t: string) => `Rank ${t}`,
  prerequisites: 'Builds on',
  noPrerequisites: 'A starting point: no prerequisites.',
  unlocks: 'Unlocks',
  masteryCriteria: 'You have mastered it when',
  commonMistakes: 'Common mistakes',
  evidence: 'How SHURA checks it',
  sources: 'Grounded in',
  goals: 'Goals',
  goalTarget: (t: string) => `target Rank ${t}`,
  notFound: 'This skill pack could not be found.',
  retry: 'Try again',
  verifiability: {
    objective: 'Checked automatically',
    mixed: 'Tests plus review',
    rubric: 'Graded by rubric',
    self_reported: 'Self-reported only',
    none: 'No shipped check yet',
  },
  adapters: {
    choice: 'Multiple choice',
    exact_answer: 'Exact answer',
    code: 'Code with hidden tests',
    written: 'Written explanation',
    spoken: 'Spoken explanation',
    self_report: 'Practice log',
    project: 'GitHub project',
    image: 'Photo of your work',
    audio_analysis: 'Audio analysis',
  } as Record<string, string>,
};

export type Strings = typeof en;
export const t = en;
