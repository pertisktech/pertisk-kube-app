#!/usr/bin/env python3
"""
Generate all Tauri icon sizes from the favicon.svg.
"""
import os
import shutil
import subprocess
import sys
from pathlib import Path

import subprocess as _sp
from PIL import Image

ICONS_DIR = Path(__file__).parent / "frontend/src-tauri/icons"
SVG_SRC   = Path(__file__).parent / "frontend/public/favicon.svg"

SVG_DATA = SVG_SRC.read_text()

def render(size: int, out: Path):
    _sp.run(
        ["/opt/homebrew/bin/rsvg-convert", "--width", str(size), "--height", str(size),
         "--output", str(out), str(SVG_SRC)],
        check=True,
    )
    print(f"  {out.name}  ({size}x{size})")

def main():
    ICONS_DIR.mkdir(parents=True, exist_ok=True)

    # ── PNG sizes required by Tauri ──────────────────────────────────────
    sizes = {
        "32x32.png":        32,
        "64x64.png":        64,
        "128x128.png":      128,
        "128x128@2x.png":   256,
        "icon.png":         512,  # primary app icon
        # Windows Store logos
        "Square30x30Logo.png":   30,
        "Square44x44Logo.png":   44,
        "Square71x71Logo.png":   71,
        "Square89x89Logo.png":   89,
        "Square107x107Logo.png": 107,
        "Square142x142Logo.png": 142,
        "Square150x150Logo.png": 150,
        "Square284x284Logo.png": 284,
        "Square310x310Logo.png": 310,
        "StoreLogo.png":         50,
    }

    print("Rendering PNGs…")
    for name, size in sizes.items():
        render(size, ICONS_DIR / name)

    # ── .icns (macOS) via iconutil ───────────────────────────────────────
    print("\nBuilding icon.icns…")
    iconset = ICONS_DIR / "icon.iconset"
    iconset.mkdir(exist_ok=True)

    icns_sizes = [
        ("icon_16x16.png",       16),
        ("icon_16x16@2x.png",    32),
        ("icon_32x32.png",       32),
        ("icon_32x32@2x.png",    64),
        ("icon_64x64.png",       64),
        ("icon_64x64@2x.png",    128),
        ("icon_128x128.png",     128),
        ("icon_128x128@2x.png",  256),
        ("icon_256x256.png",     256),
        ("icon_256x256@2x.png",  512),
        ("icon_512x512.png",     512),
        ("icon_512x512@2x.png",  1024),
    ]
    for name, size in icns_sizes:
        render(size, iconset / name)

    result = subprocess.run(
        ["iconutil", "-c", "icns", str(iconset), "-o", str(ICONS_DIR / "icon.icns")],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print("iconutil error:", result.stderr)
        sys.exit(1)
    shutil.rmtree(iconset)
    print(f"  icon.icns")

    # ── .ico (Windows, multi-size) via Pillow ────────────────────────────
    print("\nBuilding icon.ico…")
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    images = []
    for s in ico_sizes:
        tmp = ICONS_DIR / f"_tmp_{s}.png"
        render(s, tmp)
        images.append(Image.open(tmp).convert("RGBA"))

    images[0].save(
        ICONS_DIR / "icon.ico",
        format="ICO",
        append_images=images[1:],
        sizes=[(s, s) for s in ico_sizes],
    )
    for s in ico_sizes:
        (ICONS_DIR / f"_tmp_{s}.png").unlink(missing_ok=True)
    print(f"  icon.ico")

    print("\nDone.")

if __name__ == "__main__":
    main()
