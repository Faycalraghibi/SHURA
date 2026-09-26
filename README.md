# SHURA

A mobile app that turns any skill into an evidence-based path from F Rank to S Rank.

- `docs/IMPLEMENTATION_PLAN.md`: engineering plan (Android first) and P0 status
- `docs/FORGE_BENCHMARK.md`: the 25-skill Forge benchmark
- `packs/`: standard program format v1: rank definitions, JSON Schema, hand-written packs
- `backend/`: FastAPI backend: format, validator, ceiling rule, pack registry, Skill Forge prototype, LLM gateway
- `mobile/`: Expo (React Native) app, Android first

```bash
cd backend && pip install -e ".[dev]" && pytest
python scripts/validate_packs.py
uvicorn shura.api.app:app --host 0.0.0.0 --reload

cd mobile && npm install && npx expo start --android
```
