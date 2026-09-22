from pathlib import Path
import zipfile
root=Path(__file__).resolve().parents[1]
out=root.parent/(root.name+'.zip')
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
    for p in root.rglob('*'):
        if p.is_file() and 'target' not in p.parts:
            z.write(p, p.relative_to(root.parent))
print(out)
