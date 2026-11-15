# Genera public/img/og.jpg (la imagen de la vista previa de WhatsApp).
# Uso: python3 scripts/og.py "Paula" "Carlos" "22 de mayo 2027 — 13:00h."   (necesita: pip install playwright && playwright install chromium)
import sys, pathlib, json
from playwright.sync_api import sync_playwright
a, b, f = (sys.argv[1:4] + ['Paula', 'Carlos', '22 de mayo 2027 — 13:00h.'][len(sys.argv)-1:])[:3]
here = pathlib.Path(__file__).resolve().parent
with sync_playwright() as p:
    br = p.chromium.launch(**({'executable_path': '/usr/bin/google-chrome'} if pathlib.Path('/usr/bin/google-chrome').exists() else {}))
    pg = br.new_page(viewport={'width': 1200, 'height': 630})
    pg.goto((here / 'og.html').as_uri())
    pg.evaluate(f"""() => {{ document.getElementById('n').innerHTML = '<span>' + {json.dumps(a)} + '</span><span>y</span><span>' + {json.dumps(b)} + '</span>';
                             document.getElementById('f').textContent = {json.dumps(f)}; }}""")
    pg.wait_for_timeout(300)
    pg.screenshot(path=str(here.parent / 'public/img/og.jpg'), type='jpeg', quality=82)
    br.close()
print('public/img/og.jpg')
