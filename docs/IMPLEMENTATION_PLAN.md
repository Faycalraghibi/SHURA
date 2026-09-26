# SHURA: Implementation Plan v2 (the System)

Source of truth: `docs/VISION.md`. SHURA is **the System from Solo Leveling, for studying**: you
awaken, the System reads your level, hands you quests, judges what you submit, and you rank up only
by proving you can do it.

> You do not rank up because you studied something. You rank up because you demonstrated that you
> can do it. (VISION §1)

## What changed from v1

v1 built a skill catalog: browse packs, look at a rank map. That is the knowledge layer only. v2
puts the **player** at the centre: status window, quests, submissions, evaluation, XP, level ups and
rank ups. The v1 knowledge layer (pack format, validator, ceiling rule) stays underneath.

## Decisions

| Topic | Decision |
| --- | --- |
| Platform | Android first (Expo, React Native) |
| AI | Free NVIDIA API (build.nvidia.com, OpenAI-compatible) only, for now |
| API key | On the backend (`NVIDIA_API_KEY`), never in the app |
| Progress | On the phone (AsyncStorage). No account. Export/import later |
| Skills | Open: any skill the player types |

## The feel: Solo Leveling's System

- Blue translucent **System windows** with `[ SYSTEM ]` headers, glowing borders, monospaced stats.
- **Notifications** slide in: "You have acquired a new quest.", "Quest complete.", "LEVEL UP!",
  "Rank up: E → D", "Penalty quest issued."
- **Status window** (home): name, level, XP bar, title, hunter rank for the active skill, stats and
  competency bars (VISION §35).
- **Daily Quest: Preparation to become strong**: every day, 3 quests plus any due retests. Missing it
  issues a **Penalty Quest** (a retest set); nothing is ever taken away (VISION §24).
- **Level** comes from XP and is progression only. **Rank** comes from evidence only (VISION §26, §27).

### Stats (study version of STR, AGI, …)

Derived from evidence, never assigned by the AI (VISION §16):

| Stat | Meaning | Grows with |
| --- | --- | --- |
| INT | Understanding | recall and recognition successes |
| STR | Production | building from scratch |
| AGI | Debugging | finding and fixing errors |
| PER | Transfer | unfamiliar problems |
| SEN | Explanation | explaining why it works |
| VIT | Retention | passed retests |

## Architecture

```text
PHONE (Expo app)                                   BACKEND (FastAPI, holds NVIDIA key)
  Player state (AsyncStorage)                        /system/awaken    skill -> skill tree (pack)
  Deterministic engines (TypeScript, tested):        /system/assess    pack -> diagnostic questions
    learner model  (Elo ability + evidence mix)      /system/quest     competency + weakness -> quest
    planner        (weakest link, retests, step back)/system/evaluate  quest + submission -> verdict
    rank arbiter   (ranks from evidence only)        /system/hint      quest + level -> hint
    XP / level     (independence-weighted)           knowledge layer: packs, validator, ceiling rule
  System UI: status, quest, skill tree, notifications  LLM gateway -> NVIDIA (JSON validated by schema)
```

Rules carried from the vision:

- The AI generates skill trees, quests, hints and rubric verdicts. **It never sets a rank** (§27, §28).
- Skill trees are grounded and validated by code before use (§5, §29). Built trees are cached on the
  server so the same skill is built once.
- Generated quests are validated before the player sees them (§14): competency exists, choice
  answers in range and options distinct, required fields present.
- Objective checks are done by code whenever possible (§20): multiple-choice and exact answers are
  graded on the phone; only open answers (explanations, code, proofs) go to the AI evaluator.
- Hints escalate over 6 levels; each level lowers the evidence weight (§15, §21).
- Failure is diagnosed (§36): missing prerequisite → the planner steps back (§22).

## Learner model (on the phone)

- **Ability** per competency, Elo style: tier difficulty F=800 … S=2000 (+200 per tier).
  `p = 1 / (1 + 10^((difficulty - ability)/400))`, update `ability += K · w · (score - p)`.
- **Weight** `w` = evidence type weight (recognition 0.3 … transfer 1.2) × independence
  (no hint 1.0 … full solution 0).
- **Proven**: predicted success at its tier ≥ 0.8 and ≥ 2 independent successes of 2+ evidence types.
- **Mastered**: Proven + a passed retest at least 2 days after the first success (§17, §24).
- **Rank** for a skill: highest tier where every core competency at or below it is Mastered, capped
  by the verified ceiling. Proven-only tiers show as "rank-up pending retest".
- **Retests**: stability doubles on each pass (1, 2, 5, 12, 30 days rhythm), halves on failure.

## Build order (this branch)

| # | Work | Status |
| --- | --- | --- |
| 1 | Save the vision; this plan | done |
| 2 | Gateway: NVIDIA client (OpenAI-compatible), JSON extraction, schema validation, 1 repair retry, rate-limit backoff | |
| 3 | Forge on NVIDIA + server cache of built trees; `/system/awaken` | |
| 4 | `/system/assess`, `/system/quest`, `/system/evaluate`, `/system/hint` with validation | |
| 5 | App engines: learner model, planner, rank, XP/level, stats (unit tests) | |
| 6 | App state store on the phone | |
| 7 | System UI kit: window, notification, bars | |
| 8 | Screens: Awakening, Assessment, Status, Quest, Result, Skill tree | |
| 9 | Daily quest + penalty quest + retests | |
| 10 | CI green, then a run on a real phone with a real NVIDIA key | needs you |

## Later

Code execution with hidden tests (sandbox), GitHub project quests (§19), web search for real free
resources (§7; v2 links to YouTube and documentation *searches*, which cannot be hallucinated),
rank-up trials, export/import of progress, iOS.

## Running

```bash
cd backend && pip install -e ".[dev]"
export NVIDIA_API_KEY=nvapi-...           # free key from build.nvidia.com
uvicorn shura.api.app:app --host 0.0.0.0 --port 8000

cd mobile && npm install
EXPO_PUBLIC_API_URL=http://<your-computer-lan-ip>:8000 npx expo start   # open in Expo Go
```
