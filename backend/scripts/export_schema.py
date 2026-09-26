"""Write the standard program format as JSON Schema to packs/schema/ (used by editors and the app)."""

import json
from pathlib import Path

from shura.format.models import RankDefinitions, SkillPack

out = Path(__file__).resolve().parents[2] / "packs" / "schema"
out.mkdir(parents=True, exist_ok=True)
for name, model in {"pack": SkillPack, "ranks": RankDefinitions}.items():
    (out / f"{name}.schema.json").write_text(json.dumps(model.model_json_schema(), indent=2) + "\n")
    print(f"wrote {out / f'{name}.schema.json'}")
