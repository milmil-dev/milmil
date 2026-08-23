#!/usr/bin/env python3
"""Sync Milmil/Resources/Localizable.xcstrings with the string literals in the app.

Keys are the zh-Hant literals themselves (the catalog's source language).
`xcodebuild` does not run Xcode's string extraction, so this script does:

  * SwiftUI initializers that take a LocalizedStringKey (`Text("…")`,
    `Button("…")`, `.help("…")`, …) and every `String(localized: "…")` are
    extracted; interpolations become `%lld` (Int) or `%@` (String) the way
    SwiftUI / String.LocalizationValue build their keys.
  * New keys are added with no translations; existing translations are kept.
  * `--prune` drops keys that no longer appear in the sources.
  * Missing translations are listed per language; `--check` exits 1 if any.

Usage (from macos/):  python3 scripts/i18n_sync.py [--prune] [--check]
"""
import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
APP = ROOT / "Milmil"
CATALOG = APP / "Resources" / "Localizable.xcstrings"
LANGS = ["en", "ja", "ko", "zh-Hans", "zh-HK"]

LIT = re.compile(r'"(?:\\\((?:[^()"]|"[^"]*"|\([^()]*\))*\)|[^"\\]|\\.)*"')
CJK = re.compile(r"[　-鿿＀-￯]")
LOCALIZED_CALLS = re.compile(
    r"\b(Text|Button|Label|Toggle|Picker|Section|TextField|LabeledContent|Link|Tab|Menu|Stepper|ProgressView|SecureField|"
    r"navigationTitle|help|confirmationDialog|alert|badge|accessibilityLabel)\s*\(\s*$"
)
# Interpolated expressions that are Strings. Everything else is assumed Int.
# Keep this in sync when adding a localized literal that interpolates a String.
STRING_HINTS = re.compile(
    r"(\.label|\.title|\.name|\.displayName|\.display|\.number|\.query|\.lastPathComponent|\.localizedDescription|\.host\(\)"
    r"|Formatters\.|String\(|DeviceName|\berror\b|\bep\b|\bjst\b|\blocal\b|\bnumber\b|\bquery\b|\bsize\b|\btitle\b|\bversion\b"
    r"|\?\? \"\"|airDate|\bdate\b|duration)"
)


def interpolations(body):
    i = 0
    while i < len(body):
        if body.startswith("\\(", i):
            depth, j, in_str = 1, i + 2, False
            while j < len(body) and depth:
                c = body[j]
                if in_str:
                    if c == "\\":
                        j += 1
                    elif c == '"':
                        in_str = False
                elif c == '"':
                    in_str = True
                elif c == "(":
                    depth += 1
                elif c == ")":
                    depth -= 1
                j += 1
            yield i, j, body[i + 2 : j - 1]
            i = j
        else:
            i += 1


def to_key(lit):
    body = lit[1:-1]
    out, pos = "", 0
    for start, end, expr in interpolations(body):
        spec = "%@" if STRING_HINTS.search(expr) else "%lld"
        out += body[pos:start].replace("%", "%%") + spec
        pos = end
    out += body[pos:].replace("%", "%%")
    return out.replace('\\"', '"')


def extract():
    keys = {}
    for f in sorted(APP.rglob("*.swift")):
        if "Preview Content" in str(f):
            continue
        for line in f.read_text().split("\n"):
            s = line.strip()
            if s.startswith("//") or "#Preview" in line or not CJK.search(line):
                continue
            for m in LIT.finditer(line):
                lit = m.group(0)
                if not CJK.search(lit):
                    continue
                before = line[: m.start()].rstrip()
                if before.endswith("String(localized:") or LOCALIZED_CALLS.search(before):
                    keys.setdefault(to_key(lit), f.relative_to(APP).as_posix())
    return keys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prune", action="store_true", help="remove keys no longer in the sources")
    ap.add_argument("--check", action="store_true", help="exit 1 when translations are missing")
    args = ap.parse_args()

    catalog = json.loads(CATALOG.read_text()) if CATALOG.exists() else {"sourceLanguage": "zh-Hant", "strings": {}, "version": "1.0"}
    strings = catalog.setdefault("strings", {})
    keys = extract()

    added = [k for k in keys if k not in strings]
    for k in added:
        strings[k] = {}
    stale = [k for k in strings if k not in keys]
    if args.prune:
        for k in stale:
            del strings[k]
    catalog["strings"] = dict(sorted(strings.items()))
    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")

    missing = {lang: [k for k, v in catalog["strings"].items() if not v.get("localizations", {}).get(lang, {}).get("stringUnit", {}).get("value")]
               for lang in LANGS}
    print(f"{len(keys)} keys · {len(added)} added · {len(stale)} stale{' (pruned)' if args.prune else ''}")
    for lang, ks in missing.items():
        if ks:
            print(f"  {lang}: {len(ks)} untranslated" + (f" — e.g. {ks[0]!r}" if ks else ""))
    if args.check and any(missing.values()):
        sys.exit(1)


if __name__ == "__main__":
    main()
