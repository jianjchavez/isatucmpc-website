"""Builds the membership form PDF templates and their fill-in coordinates.

Run from the repo root (needs Google Chrome and uv):
    uv run --no-project --with pymupdf --with segno python -I scripts/forms/build.py

Outputs:
    public/forms/{Regular,Associate}_Application_Form.pdf  page 1, rebuilt from scripts/forms/originals/
    public/forms/Subscription_Agreement.pdf                 applicant's page 2
    public/forms/Office_Packet.pdf                          blank office pages (walk-ins, fallback)
    src/lib/subscription-fields.json                        where the browser draws the subscription values
    worker/src/membership/office-packet.pdf                 3 office pages, attached to the coop email
    worker/src/membership/office-fields.json                where the Worker draws the office values

Each fill-in blank in the HTML is `<span class="f" data-f="key" data-w="width-pt">`. The page is
rendered twice: once with a visible token in every blank (to read its position) and once without
(the template). Both renders share one layout, so the positions match the template exactly.
"""
import json
import re
import subprocess
import tempfile
from pathlib import Path

import pymupdf as fitz
import segno

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'scripts' / 'forms'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
FONTS = (ROOT / 'node_modules' / '@fontsource').as_uri()
TOKEN = 'ZQ'

BAR = ('<svg class="{cls}" viewBox="0 0 100 1" preserveAspectRatio="none"><defs><linearGradient id="g{cls}">'
       '<stop offset="0" stop-color="#010066"/><stop offset=".5" stop-color="#FE9900"/><stop offset="1" stop-color="#FFC001"/>'
       '</linearGradient></defs><rect width="100" height="1" fill="url(#g{cls})"/></svg>')

LETTERHEAD = (
    '<header class="lh">' + BAR.format(cls='lh-top') + '<div class="lh-body">'
    '<img class="lh-seal" src="seal.png" alt="ISATUCMPC seal"><div style="flex:1">'
    '<p class="lh-name">Iloilo Science and Technology University and<br>Community Multi-Purpose Cooperative (ISATUCMPC)</p>'
    '<div class="lh-meta"><div>Burgos St., La Paz, Iloilo City<br>Phone: 330-2586<br>Registered with CDA Iloilo Extension Office</div>'
    '<div>CDA Reg. No.: 9520-0600-8210 &middot; CIN: 106060939<br>TIN: 005-440-349<br>isatucmpc1964@gmail.com &middot; www.isatucmpc.coop</div></div>'
    '</div>SIDE</div>' + BAR.format(cls='lh-rule') + '</header>'
)


def qr_svg() -> str:
    m = segno.make('https://www.isatucmpc.coop', error='m').matrix
    d = ''.join(f'M{c} {r}h1v1h-1z' for r, row in enumerate(m) for c, v in enumerate(row) if v)
    n = len(m)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n} {n}" shape-rendering="crispEdges"><path fill="#010066" d="{d}"/></svg>'


def blank_keys(html: str) -> list:
    return re.findall(r'data-f="(\w+)"', html)


def expand(html: str, marker: bool) -> str:
    html = re.sub(r'<!--LH:(.*?)-->', lambda m: LETTERHEAD.replace('SIDE', m.group(1)), html, flags=re.S)
    html = html.replace('<!--LH-->', LETTERHEAD.replace('SIDE', ''))
    html = re.sub(
        r'<!--FOOT:(.*?)\|(qr)?-->',
        lambda m: f'<div class="foot"><span>www.isatucmpc.coop</span><span class="r"><span>{m.group(1)}</span>{qr_svg() if m.group(2) else ""}</span></div>',
        html,
    )
    keys = blank_keys(html)
    html = re.sub(
        r'<span class="f( bare)?" data-f="(\w+)" data-w="([\d.]+)"( data-s="[\d.]+")?></span>',
        lambda m: f'<span class="f{m.group(1) or ""}" style="width:{m.group(3)}pt"><span class="tok">{TOKEN}{keys.index(m.group(2))}</span></span>',
        html,
    )
    css = (SRC / 'style.css').read_text().replace('url(FONTS/', f'url({FONTS}/')
    html = html.replace('<link rel="stylesheet" href="style.css">', f'<style>{css}</style>')
    return html.replace('<body>', '<body class="marker">') if marker else html


def render(name: str, marker: bool, out: Path) -> Path:
    page = SRC / f'.render-{name}'  # beside seal.png so the relative image link resolves
    page.write_text(expand((SRC / name).read_text(), marker))
    try:
        subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
                        f'--print-to-pdf={out}', page.as_uri()], check=True, capture_output=True)
    finally:
        page.unlink()
    return out


def fields(name: str) -> dict:
    """Reads each blank's left edge, baseline and width from the marker render."""
    sizes = {m.group(1): float(m.group(3) or 9) for m in re.finditer(
        r'data-f="(\w+)" data-w="[\d.]+"( data-s="([\d.]+)")?', (SRC / name).read_text())}
    widths = {m.group(1): float(m.group(2)) for m in re.finditer(
        r'data-f="(\w+)" data-w="([\d.]+)"', (SRC / name).read_text())}
    keys = blank_keys((SRC / name).read_text())
    with tempfile.TemporaryDirectory() as tmp:
        doc = fitz.open(render(name, True, Path(tmp) / 'marker.pdf'))
        found = {}
        for pno, page in enumerate(doc):
            for block in page.get_text('dict')['blocks']:
                for line in block.get('lines', []):
                    for span in line['spans']:
                        for n in re.findall(rf'{TOKEN}(\d+)', span['text']):
                            key = keys[int(n)]
                            x, baseline = span['origin']
                            found[key] = {'page': pno, 'x': round(x, 1), 'top': round(baseline, 1),
                                          'maxWidth': widths[key], 'size': sizes[key]}
    missing = set(widths) - set(found)
    if missing:
        raise SystemExit(f'{name}: blanks not found in render: {sorted(missing)}')
    return found


def build_page_one(variant: str, header: Path, certify: Path) -> None:
    doc = fitz.open(SRC / 'originals' / f'{variant}_Application_Form.pdf')
    page = doc[0]
    # Old header (seal, name, contacts, QP document-control block) sits above y=100.
    page.add_redact_annot(fitz.Rect(0, 0, page.rect.width, 100), fill=(1, 1, 1))
    # Old certification line, by its text position.
    hit = page.search_for('I hereby certify')[0]
    page.add_redact_annot(fitz.Rect(30, hit.y0 - 1, 565, hit.y1 + 1), fill=(1, 1, 1))
    page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_REMOVE,
                          graphics=fitz.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED)
    page.show_pdf_page(fitz.Rect(34, 12, 34 + 527, 12 + 84), fitz.open(header), 0)
    page.show_pdf_page(fitz.Rect(34, hit.y0 - 2, 34 + 527, hit.y0 + 10), fitz.open(certify), 0)
    page.insert_text((470, page.rect.height - 18), "Applicant's copy · Page 1 of 2",
                     fontsize=7, fontname='helv', color=(0.42, 0.45, 0.5))
    doc.save(ROOT / 'public' / 'forms' / f'{variant}_Application_Form.pdf', garbage=4, deflate=True)


def main() -> None:
    worker_dir = ROOT / 'worker' / 'src' / 'membership'
    worker_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        header = render('header-strip.html', False, tmp / 'header.pdf')
        certify = render('certify-strip.html', False, tmp / 'certify.pdf')
        for variant in ('Regular', 'Associate'):
            build_page_one(variant, header, certify)
    render('subscription.html', False, ROOT / 'public' / 'forms' / 'Subscription_Agreement.pdf')
    render('office-packet.html', False, worker_dir / 'office-packet.pdf')
    # Blank copy for walk-in applicants and for when the Worker cannot fill one.
    (ROOT / 'public' / 'forms' / 'Office_Packet.pdf').write_bytes((worker_dir / 'office-packet.pdf').read_bytes())
    (ROOT / 'src' / 'lib' / 'subscription-fields.json').write_text(json.dumps(fields('subscription.html'), indent=2) + '\n')
    (worker_dir / 'office-fields.json').write_text(json.dumps(fields('office-packet.html'), indent=2) + '\n')
    print('built templates and field maps')


if __name__ == '__main__':
    main()
