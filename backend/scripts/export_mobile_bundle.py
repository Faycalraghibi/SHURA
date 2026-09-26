"""Bundle the packs into the app, in exactly the shape the API returns.

The app uses this bundle when it cannot reach the backend (offline, or no EXPO_PUBLIC_API_URL).
Run after changing any pack: python scripts/export_mobile_bundle.py
"""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from shura.api.app import app

client = TestClient(app)
summaries = client.get("/packs").json()
bundle = {
    "ranks": client.get("/ranks").json(),
    "summaries": summaries,
    "packs": {s["pack"]: client.get(f"/packs/{s['pack']}").json() for s in summaries},
    "aliases": {},
}
from shura.api.app import get_registry  # noqa: E402

for p in get_registry().all():
    bundle["aliases"][p.pack] = [p.pack, p.name, *p.aliases]

out = Path(__file__).resolve().parents[2] / "mobile" / "src" / "data" / "bundle.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(bundle, indent=1) + "\n", encoding="utf-8")
print(f"wrote {out} ({len(summaries)} packs)")
