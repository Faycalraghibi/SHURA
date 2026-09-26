# SHURA: Implementation Plan (Android first)

This document turns the build plan (`docs/BUILD_PLAN.md`) into concrete engineering work.
For now the mobile work targets **Android only**. The app is React Native with Expo, so
iOS stays possible, but no iOS-specific work (TestFlight, Sign in with Apple, APNs,
App Store listing) happens until Android reaches closed beta.

## Why Android first changes a few things

| Topic | Android-first decision |
| --- | --- |
| Builds | EAS profiles `development` (dev client APK), `preview` (internal APK), `production` (AAB for Play) |
| Beta channel | Google Play internal testing instead of TestFlight |
| Sign-in (P3) | Google + email first; Sign in with Apple is added with the iOS build |
| Push (P5) | FCM only; APNs later |
| Billing (P6) | Google Play Billing through RevenueCat; App Store products later |
| UX | Hardware back button and predictive back handled by the router; edge-to-edge layout with safe-area insets; keyboard `resize` behaviour for the code editor; tested on a low-end device profile (for example 3 GB RAM, 720p) because many students in the first market use mid-range Android phones |
| Store rules | Play data safety form and in-app account deletion (P5) |

## Repository layout

```text
docs/             build plan and this implementation plan
packs/            standard program format: rank definitions + hand-written packs (YAML)
backend/          Python 3.11+, FastAPI
  shura/format    pydantic models of the standard program format
  shura/validate  deterministic pack checks (cycles, orphans, tier order, grounding, ceiling rule)
  shura/registry  pack registry and skill-request matching
  shura/forge     Skill Forge prototype (stages 2 to 4 + critic) behind the LLM gateway
  shura/gateway   the only path to a model: versioned prompts, schema-checked outputs, cost log
  shura/api       HTTP API used by the app
mobile/           Expo SDK 57 app, TypeScript, Expo Router
```

## P0 work breakdown (this branch)

Mapped to the "first two weeks" table of the build plan.

| # | Task | Build plan days | Status |
| --- | --- | --- | --- |
| 1 | Standard program format v1 as pydantic models + exported JSON Schema | 1 to 2 | this branch |
| 2 | Skill-independent rank definitions F to S in observable terms (`packs/ranks.yaml`) | 1 to 2 | this branch |
| 3 | Three hand-written packs: SQL basics, Python basics, Japanese kana (non-tech control) | 3 | this branch |
| 4 | Validator: schema, unique ids, prerequisite existence, no cycles, no orphans, tier order, grounding, adapters present | 8 to 9 | this branch |
| 5 | Adapter registry + trust levels + the ceiling rule, computed by code, never by a model | 10 | this branch |
| 6 | Pack registry with name/alias matching; SQLite by default, Postgres through `DATABASE_URL` | 13 to 14 | this branch (file-backed registry; DB tables in P1) |
| 7 | FastAPI: list packs, get pack, rank definitions, skill request (match or queue a forge build) | 13 to 14 | this branch |
| 8 | LLM gateway + Forge prototype stages 2 to 4 and critic, JSON-schema outputs, cost logging; runs offline against a fake model in tests | 5 to 9 | this branch (prototype) |
| 9 | Android app shell: skill search, pack list, pannable/zoomable rank map, competency detail, verified-ceiling banner | 11 to 12 | this branch |
| 10 | Benchmark list of 25 skills + 8 reference outlines | 4 | list in this branch; outlines gathered by hand |
| 11 | Phone code editor spike (CodeMirror 6 in a WebView, native symbol row) | week 3 | next |
| 12 | Forge run on the 8 reference skills with coverage scoring | 5 to 7 | next (needs an API key and the outlines) |

### Engineering rules carried from the build plan

- Anything that changes mastery or rank is plain code. The ceiling rule, validators and (later) the
  rank arbiter import nothing from `gateway`.
- Every model call goes through `shura.gateway`, returns schema-validated JSON and is costed.
- Untrusted text (web pages, job postings, submissions) is passed to models only inside marked data
  blocks.
- User-facing strings in the app live in `mobile/src/i18n/en.ts` from the first screen.

## Next phases, Android specifics only

- **P1 Forge v1:** durable workflow (Postgres-backed job table), intake and safety, pgvector matching.
  App: "forging" screen that polls build status and shows the rank map taking shape; FCM push when
  ready.
- **P2 demand test:** public preview (web) + waitlist; job mapper v1.
- **P3 core loop:** task smith, learner model, planner, evidence log, daily training on Android;
  Google sign-in; admin console v1.
- **P4 to P6:** as in the build plan, with Play internal testing for the beta and Play Billing for Pro.

## How to run

```bash
# backend
cd backend && pip install -e ".[dev]" && pytest && uvicorn shura.api.app:app --reload

# mobile (Android device or emulator on the same network)
cd mobile && npm install && npx expo start --android
# set EXPO_PUBLIC_API_URL=http://<your-lan-ip>:8000 so the phone reaches the backend;
# without it the app uses the packs bundled in the app.
```
