# SHURA

The System from Solo Leveling, for studying. Name any skill; the System reads your level, gives you
quests, judges what you submit, and you rank up from F to S only by proving you can do it.

- `docs/VISION.md`: the original idea (source of truth)
- `docs/IMPLEMENTATION_PLAN.md`: how it is built, Android first, and what is done
- `packs/`: skill tree format, rank definitions and hand-written skill trees
- `backend/`: FastAPI server: the System endpoints, skill tree builder (Forge), validator, NVIDIA gateway
- `mobile/`: the Expo (React Native) app; progress is saved on the phone

## Run it

```bash
# 1. backend (holds your free NVIDIA key from build.nvidia.com)
cd backend && pip install -e ".[dev]"
export NVIDIA_API_KEY=nvapi-...
uvicorn shura.api.app:app --host 0.0.0.0 --port 8000

# 2. app, on an Android phone with Expo Go, same Wi-Fi as the computer
cd mobile && npm install
EXPO_PUBLIC_API_URL=http://<your-computer-lan-ip>:8000 npx expo start
```

Optional: `SHURA_MODEL=<model id>` picks another NVIDIA model (default `meta/llama-3.3-70b-instruct`).

## Checks

```bash
cd backend && pytest -q && python scripts/validate_packs.py
cd mobile && npm run typecheck && npm test
```
