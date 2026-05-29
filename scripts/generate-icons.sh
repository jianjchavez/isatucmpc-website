#!/usr/bin/env bash
# Regenerate the favicon / app-icon set from public/logo.svg.
#
# Uses only macOS built-ins (qlmanage to rasterize the SVG, sips to resize) —
# no npm deps, no native builds. Run from the repo root:
#
#   bash scripts/generate-icons.sh
#
# Produces in public/: favicon.ico (16/32/48), favicon-16.png, favicon-32.png,
# apple-touch-icon.png (180), android-chrome-192.png, android-chrome-512.png.
set -euo pipefail

SRC="public/logo.svg"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 1. Rasterize the SVG once at high resolution.
qlmanage -t -s 1024 -o "$TMP" "$SRC" >/dev/null 2>&1
BASE="$TMP/$(basename "$SRC").png"
[ -f "$BASE" ] || { echo "ERROR: qlmanage failed to render $SRC" >&2; exit 1; }

# 2. Resize to each target size.
for s in 16 32 48 180 192 512; do
  sips -z "$s" "$s" "$BASE" --out "$TMP/icon_$s.png" >/dev/null 2>&1
done

cp "$TMP/icon_16.png"  public/favicon-16.png
cp "$TMP/icon_32.png"  public/favicon-32.png
cp "$TMP/icon_180.png" public/apple-touch-icon.png
cp "$TMP/icon_192.png" public/android-chrome-192.png
cp "$TMP/icon_512.png" public/android-chrome-512.png

# 3. Pack 16/32/48 PNGs into a valid (PNG-compressed) multi-size favicon.ico.
python3 - "$TMP" <<'PY'
import struct, sys
tmp = sys.argv[1]
sizes = [16, 32, 48]
pngs = [(s, open(f"{tmp}/icon_{s}.png", "rb").read()) for s in sizes]
n = len(pngs)
out = struct.pack("<HHH", 0, 1, n)          # ICONDIR
offset = 6 + 16 * n
entries = b""; data = b""
for s, png in pngs:
    entries += struct.pack("<BBBBHHII", s, s, 0, 0, 1, 32, len(png), offset)
    offset += len(png); data += png
open("public/favicon.ico", "wb").write(out + entries + data)
print(f"favicon.ico: {6 + 16*n + len(data)} bytes ({'/'.join(map(str, sizes))})")
PY

echo "Icon set regenerated in public/."
