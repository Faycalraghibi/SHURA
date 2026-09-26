"""Validate every pack in packs/ and print issues. Exit code 1 on any error."""

import sys

from shura.format.ceiling import verified_ceiling
from shura.registry import DEFAULT_PACKS_DIR, PackLoadError, PackRegistry
from shura.validate import Severity, validate_pack

try:
    registry = PackRegistry.from_dir(DEFAULT_PACKS_DIR)
except PackLoadError as e:
    print(e)
    sys.exit(1)
for pack in registry.all():
    ceiling = verified_ceiling(pack)
    issues = validate_pack(pack, registry.lookup_tier)
    print(f"{pack.pack} v{pack.version}: {len(pack.competencies)} competencies, ceiling {ceiling.value if ceiling else 'none'}")
    for i in issues:
        print(f"  {i}")
    if any(i.severity is Severity.error for i in issues):
        sys.exit(1)
