#!/usr/bin/env python3
"""Seeds the design canvas from artboards.txt (written by gen2.py) and checks it.

Usage: python3 seed.py <design-skill-base-dir>
"""
import os
import subprocess
import sys

here = os.path.dirname(os.path.abspath(__file__))
skill = sys.argv[1]
helper = os.path.join(skill, "seed-canvas.mjs")
template = os.path.join(skill, "payload.template.html")
out = "milmil-macos-client.html"

with open(os.path.join(here, "artboards.txt"), encoding="utf-8") as f:
    boards = [line.strip() for line in f if line.strip()]

cmd = ["node", helper, "--template", template, "--out", out, "--title", "milmil for macOS"]
for b in boards:
    cmd += ["--artboard", b]
cmd += ["--canvas", "canvas.json"]
subprocess.run(cmd, cwd=here, check=True)
subprocess.run(["node", helper, "--check", out], cwd=here, check=True)
