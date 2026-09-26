// Every user-facing string lives here, so French and Arabic later are translation work, not a refactor.

import type { EvidenceType, FailureCause } from '../engine/types';

export const en = {
  system: '[ SYSTEM ]',
  appName: 'SHURA',

  // Awakening
  awakenTitle: 'NOTIFICATION',
  awakenBody: 'You have acquired the qualifications to be a Player. Will you accept?',
  accept: 'ACCEPT',
  namePrompt: 'State your name, Player.',
  namePlaceholder: 'Name',
  skillPrompt: 'Choose the skill you will master.',
  skillPlaceholder: 'Any skill: Python, Calculus, Japanese…',
  goalPlaceholder: 'Your goal (optional): e.g. pass my exam in June',
  awakenButton: 'AWAKEN',
  analyzing: 'The System is analyzing the skill…',
  analyzingLong: 'Building a new skill tree from real curricula. This can take a minute or two.',
  treeBuilt: (name: string) => `Skill tree acquired: ${name}`,

  // Assessment
  assessTitle: 'ASSESSMENT',
  assessIntro: 'The System will measure what you can already do. Answer honestly; guessing only hurts your path.',
  assessStart: 'BEGIN ASSESSMENT',
  assessLoading: 'Preparing the assessment…',
  assessSkip: 'Skip: start from the beginning',
  questionOf: (i: number, n: number) => `QUESTION ${i} / ${n}`,
  next: 'NEXT',
  finish: 'FINISH',
  assessDone: (c: number, n: number) => `Assessment complete: ${c}/${n}`,

  // Status
  statusTitle: 'STATUS',
  level: 'LEVEL',
  name: 'NAME',
  titleLabel: 'TITLE',
  xp: 'XP',
  rank: 'RANK',
  unranked: 'UNRANKED',
  nextRank: (r: string, m: number, n: number) => `Rank ${r}: ${m}/${n} mastered`,
  rankCapped: (r: string) => `Rank ${r} is above what the System can verify for this skill.`,
  stats: 'STATS',
  skills: 'SKILLS',
  dailyTitle: 'DAILY QUEST',
  dailyName: 'Preparation to become strong',
  dailyProgress: (d: number, n: number) => `Complete quests  [${Math.min(d, n)}/${n}]`,
  dailyDone: 'Daily quest complete.',
  streak: (n: number) => `Streak: ${n} day${n === 1 ? '' : 's'}`,
  penaltyTitle: 'PENALTY QUEST',
  penaltyBody: 'You failed yesterday’s daily quest. Clear a retest to lift the penalty.',
  questTitle: 'QUEST',
  questReady: 'A new quest is available.',
  acceptQuest: 'ACCEPT QUEST',
  resumeQuest: 'RESUME QUEST',
  noQuest: 'Every open competency is proven. Return when retests are due.',
  retestTag: 'RETEST',
  stepBackTag: 'PREREQUISITE',
  skillTree: 'SKILL TREE',
  newSkill: '+ NEW SKILL',
  switchSkill: 'SWITCH',
  log: 'LOG',
  resetGame: 'Reset all progress',
  resetConfirm: 'Delete all progress on this phone? This cannot be undone.',

  // Quest
  objective: 'OBJECTIVE',
  instructions: 'INSTRUCTIONS',
  requirements: 'REQUIREMENTS',
  resources: 'FREE RESOURCES',
  yourAnswer: 'YOUR ANSWER',
  answerPlaceholder: 'Write your answer. Show your reasoning.',
  codePlaceholder: '# write your code here',
  hint: (n: number) => (n === 0 ? 'REQUEST HINT' : `NEXT HINT (${n}/6)`),
  hintWarning: 'Each hint lowers the evidence and XP this quest can give.',
  hintNames: ['', 'Nudge', 'Direction', 'Pattern', 'Explanation', 'Outline', 'Full solution'],
  submit: 'SUBMIT',
  judging: 'The System is judging your submission…',
  generating: 'The System is preparing your quest…',
  abandon: 'Abandon quest',

  // Result
  cleared: 'QUEST CLEAR',
  failed: 'QUEST FAILED',
  score: (s: number) => `Score ${Math.round(s * 100)}%`,
  xpGained: (n: number) => `+${n} XP`,
  feedback: 'FEEDBACK',
  criteria: 'CRITERIA',
  diagnosis: 'DIAGNOSIS',
  continue: 'CONTINUE',
  explanation: 'EXPLANATION',

  // Notifications
  nQuest: 'You have acquired a new quest.',
  nLevel: (l: number) => `LEVEL UP! You are now level ${l}.`,
  nRank: (skill: string, r: string) => `RANK UP: ${skill} ${r}`,
  nDaily: 'Daily quest complete.',
  nPenalty: 'Daily quest failed. Penalty quest issued.',
  nPenaltyCleared: 'Penalty quest cleared.',

  // Skill tree
  zoomHint: 'Pinch to zoom, drag to move, tap a competency.',
  resetView: 'FIT',
  rankLabel: (r: string) => `Rank ${r}`,
  aboveCeiling: 'Above the verified ceiling: the System guides but cannot certify this.',
  ceilingLabel: (r: string) => `Verifiable up to Rank ${r}`,
  ceilingNone: 'Not verifiable yet',
  maturity: { draft: 'Draft', calibrated: 'Calibrated', reviewed: 'Expert reviewed' } as Record<string, string>,
  masteryCriteria: 'MASTERED WHEN',
  commonMistakes: 'COMMON MISTAKES',
  prerequisites: 'BUILDS ON',
  noPrerequisites: 'A starting point.',
  close: 'CLOSE',

  retry: 'TRY AGAIN',
  back: 'BACK',

  evidence: {
    recognition: 'Recognition',
    recall: 'Recall',
    explanation: 'Explanation',
    modification: 'Modification',
    debugging: 'Debugging',
    production: 'Production',
    transfer: 'Transfer',
  } satisfies Record<EvidenceType, string>,

  cause: {
    none: 'No failure.',
    slip: 'A careless slip. The idea was right; check the details.',
    execution_error: 'Right idea, wrong execution. The next quest trains the step that broke.',
    misconception: 'An incorrect mental model. Study a resource, then try a smaller exercise.',
    missing_prerequisite: 'A prerequisite is missing. The System will step back to train it first.',
    forgotten: 'Forgotten. A quick refresh will be scheduled.',
    transfer_gap: 'You know it in familiar form but not in a new one. More transfer training ahead.',
    off_topic: 'The submission did not address the quest.',
  } satisfies Record<FailureCause, string>,

  status: {
    locked: 'Locked',
    available: 'Available',
    training: 'Training',
    proven: 'Proven: retest pending',
    mastered: 'Mastered',
    decaying: 'Retest due',
  },

  titles: {
    awakened: 'The One Who Awakened',
    streak7: 'Relentless',
    rankD: 'Hunter',
    rankB: 'Elite',
    rankS: 'Monarch',
  },
};

export const t = en;
