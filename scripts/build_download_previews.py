"""Render actual first PDF pages and derive metadata. Does not edit PDFs."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
from urllib.request import urlopen

root = Path(__file__).resolve().parents[1]
dest = root / 'downloads' / 'previews'
dest.mkdir(exist_ok=True)
items = {}
for path in sorted((root / 'downloads').glob('*.pdf')):
    raw = path.read_bytes()
    url = 'https://cdn.jsdelivr.net/gh/gaughanadrienne-gif/bcl-site-assets@main/downloads/' + path.name
    with urlopen(url, timeout=30) as response:
        if response.read() != raw:
            raise RuntimeError('Public PDF differs: ' + path.name)
    info = subprocess.check_output(['pdfinfo', str(path)], text=True)
    pages = int(re.search(r'^Pages:\s+(\d+)', info, re.M).group(1))
    subprocess.run(['pdftoppm', '-f', '1', '-singlefile', '-scale-to', '500', '-png', str(path), str(dest / path.stem)], check=True)
    items[path.name] = {'pages': pages, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest(), 'preview': 'downloads/previews/' + path.stem + '.png'}
(dest / 'manifest.json').write_text(json.dumps(items, indent=2) + '\n', encoding='utf-8')
print(json.dumps(items, indent=2))
