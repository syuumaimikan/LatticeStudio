from pathlib import Path
import json, sys
ROOT=Path(__file__).resolve().parents[1]
required=[
 'Cargo.toml','README.md','schemas/project.schema.json','examples/sample_project.lattice.json',
 'sdk/include/lattice_plugin.h','preview/index.html','locales/ja-JP.json'
]
missing=[x for x in required if not (ROOT/x).exists()]
if missing:
    print('missing:', missing); sys.exit(1)
for p in ['schemas/project.schema.json','examples/sample_project.lattice.json','locales/ja-JP.json','plugins/sample-fade/manifest.json']:
    json.loads((ROOT/p).read_text(encoding='utf-8'))
print('release validation: OK')
