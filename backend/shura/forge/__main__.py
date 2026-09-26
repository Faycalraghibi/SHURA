"""Run the Forge prototype on one skill.

    python -m shura.forge "SQL" --reference outlines/sql.txt --budget 2.00

Needs NVIDIA_API_KEY (free at build.nvidia.com). Output lands in forge_runs/<skill>/ (resumable).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from ..gateway import Gateway
from .pipeline import coverage, forge_skeleton, slugify, write_report


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m shura.forge")
    ap.add_argument("skill")
    ap.add_argument("--reference", type=Path, help="reference outline, one topic per line")
    ap.add_argument("--out", type=Path, default=Path("forge_runs"))
    ap.add_argument("--budget", type=float, default=2.0, help="hard USD cap for this build")
    args = ap.parse_args(argv)

    from ..gateway.nvidia_client import NvidiaClient

    run_dir = args.out / slugify(args.skill)
    reference = args.reference.read_text(encoding="utf-8") if args.reference else ""
    gateway = Gateway(NvidiaClient(), log_path=run_dir / "calls.jsonl", budget_usd=args.budget)
    result = forge_skeleton(args.skill, gateway, run_dir, reference)
    write_report(result, run_dir / "report.json")

    print(f"{result.pack.name}: {len(result.pack.competencies)} competencies, ceiling {result.ceiling.value if result.ceiling else 'none'}")
    print(f"critic: {result.critique.verdict}, revisions: {result.revisions}, cost: ${result.cost_usd:.4f}")
    for issue in result.issues:
        print(f"  {issue}")
    if reference:
        score, missing = coverage(result.pack, [line for line in reference.splitlines() if line.strip()])
        print(f"lexical coverage of reference: {score:.0%}")
        for m in missing:
            print(f"  missing: {m}")
    return 0 if result.ok else 1


if __name__ == "__main__":
    sys.exit(main())
