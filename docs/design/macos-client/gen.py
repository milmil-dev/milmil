#!/usr/bin/env python3
"""Generates the milmil for macOS design-canvas artboards (*.dc.html + canvas.json).

Run:  python3 gen.py   (writes into this directory)
Every artboard shares the same window chrome, sidebar, cards and icons so the
set stays consistent. Values are lifted from web/src/styles/theme.css and the
React components (AppSidebar, HeroBanner, AnimeCard, ContinueWatchingCard…).
"""
from __future__ import annotations

import json
import os
import textwrap

OUT = os.path.dirname(os.path.abspath(__file__))

# ---------------------------------------------------------------- tokens
BG = "#070707"
SURFACE = "#0c0c0c"
ACCENT = "#a78bfa"
T1 = "rgba(255,255,255,0.93)"
T2 = "rgba(255,255,255,0.6)"
T3 = "rgba(255,255,255,0.4)"
T4 = "rgba(255,255,255,0.2)"
BORDER = "rgba(255,255,255,0.10)"
BORDER_SUB = "rgba(255,255,255,0.05)"
FONT = "'Figtree', 'Noto Sans TC', 'PingFang TC', 'Hiragino Sans', system-ui, sans-serif"
GFONTS = ("https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700;800"
          "&family=Noto+Sans+TC:wght@400;500;600;700&display=swap")


def djb2(name: str) -> int:
    h = 5381
    for ch in name:
        h = ((h << 5) + h) ^ ord(ch)
        h &= 0xFFFFFFFF
    return h


def anime_gradient(name: str) -> str:
    h = djb2(name)
    h1 = h % 360
    h2 = (h1 + 55 + ((h >> 8) % 50)) % 360
    h3 = (h2 + 45 + ((h >> 16) % 40)) % 360
    return (f"linear-gradient(150deg, oklch(40% 0.22 {h1}) 0%, "
            f"oklch(28% 0.26 {h2}) 55%, oklch(18% 0.16 {h3}) 100%)")


def hue(name: str) -> int:
    return djb2(name) % 360


# ---------------------------------------------------------------- icons (stroke, 24 grid)
def ic(name: str, size: int = 16, sw: float = 1.5, color: str = "currentColor") -> str:
    paths = {
        "home": '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
        "calendar": '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
        "fire": '<path d="M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-1 .5-2 1-3 .5 2 1.5 2.5 2 2.5 0-2-1-4 1-7.5z"/><path d="M6 14a6 6 0 0 0 12 0"/>',
        "search": '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.3-4.3"/>',
        "bookmark": '<path d="M6 4h12v17l-6-4-6 4z"/>',
        "clock": '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
        "folder": '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
        "download": '<path d="M12 4v11M7 10l5 5 5-5M4 19h16"/>',
        "bell": '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
        "gear": '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.5a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.2l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5A7 7 0 0 0 19 12z"/>',
        "play": '<path d="M7 5v14l12-7z" fill="currentColor" stroke="none"/>',
        "pause": '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
        "next": '<path d="M6 5v14l10-7z" fill="currentColor" stroke="none"/><rect x="17" y="5" width="2.5" height="14" rx="1" fill="currentColor" stroke="none"/>',
        "prev": '<path d="M18 5v14L8 12z" fill="currentColor" stroke="none"/><rect x="4.5" y="5" width="2.5" height="14" rx="1" fill="currentColor" stroke="none"/>',
        "back10": '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/><text x="8.5" y="15.5" font-size="7" font-weight="700" fill="currentColor" stroke="none" font-family="Figtree,sans-serif">10</text>',
        "fwd10": '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4h-4"/><text x="8.5" y="15.5" font-size="7" font-weight="700" fill="currentColor" stroke="none" font-family="Figtree,sans-serif">10</text>',
        "volume": '<path d="M4 10v4h3l4 4V6L7 10z"/><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a8 8 0 0 1 0 11"/>',
        "cc": '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M10 11a2 2 0 1 0 0 2M16 11a2 2 0 1 0 0 2"/>',
        "audio": '<path d="M4 9v6h3l4 4V5L7 9z"/><path d="M14 10v4M17 8v8M20 11v2"/>',
        "sidebar": '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M15 5v14"/>',
        "mini": '<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="6" rx="1" fill="currentColor" stroke="none"/>',
        "fullscreen": '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
        "chevl": '<path d="M15 6l-6 6 6 6"/>',
        "chevr": '<path d="M9 6l6 6-6 6"/>',
        "chevd": '<path d="M6 9l6 6 6-6"/>',
        "plus": '<path d="M12 5v14M5 12h14"/>',
        "check": '<path d="M5 12l5 5 9-10"/>',
        "more": '<circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
        "heart": '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" fill="currentColor" stroke="none"/>',
        "star": '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" fill="currentColor" stroke="none"/>',
        "x": '<path d="M6 6l12 12M18 6L6 18"/>',
        "server": '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><circle cx="7" cy="7.5" r="1" fill="currentColor" stroke="none"/><circle cx="7" cy="16.5" r="1" fill="currentColor" stroke="none"/>',
        "filter": '<path d="M4 6h16M7 12h10M10 18h4"/>',
        "danmaku": '<rect x="3" y="5" width="11" height="2.2" rx="1.1" fill="currentColor" stroke="none"/><rect x="8" y="11" width="13" height="2.2" rx="1.1" fill="currentColor" stroke="none"/><rect x="4" y="17" width="9" height="2.2" rx="1.1" fill="currentColor" stroke="none"/>',
        "skip": '<path d="M5 5l9 7-9 7z" fill="currentColor" stroke="none"/><path d="M19 5v14"/>',
        "refresh": '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
        "trash": '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
        "link": '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7L11.5 7"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7L12.5 17"/>',
        "rss": '<circle cx="6" cy="18" r="1.5" fill="currentColor" stroke="none"/><path d="M5 11a8 8 0 0 1 8 8M5 5a14 14 0 0 1 14 14"/>',
        "keyboard": '<rect x="3" y="7" width="18" height="11" rx="2"/><path d="M7 11h1M11 11h1M15 11h1M8 15h8"/>',
        "magnet": '<path d="M6 4v7a6 6 0 0 0 12 0V4"/><path d="M6 4h4v7H6M14 4h4v7h-4"/>',
        "info": '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8v.5"/>',
        "film": '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 10h4M3 14h4M17 10h4M17 14h4"/>',
        "sparkle": '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor" stroke="none"/>',
        "grid": '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
        "list": '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none"/>',
        "camera": '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3"/>',
        "wifi": '<path d="M3 9a14 14 0 0 1 18 0M6.5 12.5a9 9 0 0 1 11 0M10 16a4 4 0 0 1 4 0"/><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none"/>',
        "dot": '<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
    }
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" '
            f'stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round" '
            f'style="flex-shrink:0;display:block">{paths[name]}</svg>')


# ---------------------------------------------------------------- sample data
SHOWS = [
    "尖帽子的魔法工房", "黄泉使者", "Re：从零开始的异世界生活", "异兽魔都", "左撇子艾伦",
    "和班上第二可爱的女孩成为朋友", "当前、正被打扰中！", "百鬼夜行抄", "葬送的芙莉莲",
    "药屋少女的呢喃", "我独自升级", "想要成为影之实力者", "迷宫饭", "夏日重现",
]
SCORES = [7.1, 6.9, 7.4, 8.3, 6.2, 5.8, 5.4, 4.1, 9.1, 8.4, 7.8, 7.2, 8.0, 7.9]


# ---------------------------------------------------------------- primitives
def base_css() -> str:
    return f"""
    @import url('{GFONTS}');
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; background: #1d1d1f; font-family: {FONT}; color: {T1};
           -webkit-font-smoothing: antialiased; font-feature-settings: 'kern'; }}
    a {{ color: {ACCENT}; text-decoration: none; }} a:hover {{ color: #c4b5fd; }}
    .win {{ position: relative; overflow: hidden; background: {BG}; border-radius: 10px;
            box-shadow: 0 0 0 1px rgba(255,255,255,0.12), 0 24px 60px rgba(0,0,0,0.6);
            background-image:
              radial-gradient(ellipse 600px 500px at 5% 0%, rgba(167,139,250,0.12), transparent),
              radial-gradient(ellipse 500px 400px at 85% 2%, oklch(0.45 0.12 300 / 0.08), transparent),
              radial-gradient(ellipse 800px 600px at 40% 30%, rgba(167,139,250,0.04), transparent),
              radial-gradient(circle 0.5px at center, rgba(255,255,255,0.025) 0.5px, transparent 0.5px);
            background-size: 100% 100%, 100% 100%, 100% 100%, 24px 24px; }}
    .lights {{ display: flex; gap: 8px; align-items: center; }}
    .lights span {{ width: 12px; height: 12px; border-radius: 50%; display: block; }}
    .side-item {{ display: flex; align-items: center; gap: 10px; height: 30px; padding: 0 10px;
                  border-radius: 6px; font-size: 13px; font-weight: 500; color: {T2}; }}
    .side-item.on {{ background: rgba(255,255,255,0.08); color: #fff; }}
    .side-sec {{ font-size: 11px; font-weight: 600; color: {T3}; letter-spacing: .02em; padding: 14px 10px 4px; }}
    .chip {{ display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 999px;
             background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); font-size: 12px; font-weight: 500; line-height: 1.2; }}
    .chip.on {{ background: rgba(167,139,250,0.15); color: {ACCENT}; }}
    .btn {{ display: inline-flex; align-items: center; gap: 6px; padding: 8px 20px; border-radius: 6px;
            font-size: 13px; font-weight: 600; line-height: 1.2; }}
    .btn.pri {{ background: #fff; color: #000; }}
    .btn.sec {{ background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.8); font-weight: 500; padding: 8px 16px; }}
    .btn.acc {{ background: {ACCENT}; color: #14082e; }}
    .h2 {{ font-size: 20px; font-weight: 700; letter-spacing: -0.01em; color: #fff; margin: 0; }}
    .more {{ font-size: 12px; font-weight: 500; color: {T3}; display: inline-flex; align-items: center; gap: 2px; }}
    .poster {{ position: relative; border-radius: 6px; overflow: hidden; flex-shrink: 0; }}
    .poster .shade {{ position: absolute; left: 0; right: 0; bottom: 0; height: 50%;
                      background: linear-gradient(to top, #0c0c0c, transparent); opacity: .9; }}
    .poster .score {{ position: absolute; top: 6px; right: 6px; display: inline-flex; align-items: center; gap: 2px;
                      font-size: 10px; font-weight: 700; color: #fff; background: rgba(0,0,0,0.6); border-radius: 4px;
                      padding: 3px 6px; line-height: 1; backdrop-filter: blur(4px); font-variant-numeric: tabular-nums; }}
    .poster .ep {{ position: absolute; top: 6px; left: 6px; font-size: 10px; font-weight: 700; color: #fff;
                   background: rgba(167,139,250,0.85); border-radius: 4px; padding: 3px 6px; line-height: 1; }}
    .poster .cnt {{ position: absolute; bottom: 6px; right: 6px; font-size: 10px; font-weight: 600; color: rgba(255,255,255,.85);
                    background: rgba(0,0,0,0.55); border-radius: 4px; padding: 3px 6px; line-height: 1; }}
    .poster .ttl {{ position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 12px;
                    text-align: center; font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.55); line-height: 1.4; }}
    .cap {{ font-size: 12px; font-weight: 600; color: #fff; margin-top: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
    .sub {{ font-size: 11px; color: {T3}; margin-top: 2px; }}
    .still {{ position: relative; border-radius: 8px; overflow: hidden; flex-shrink: 0; }}
    .still .bar {{ position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255,255,255,0.1); }}
    .still .bar i {{ display: block; height: 100%; background: {ACCENT}; border-radius: 0 999px 999px 0; }}
    .still .fade {{ position: absolute; inset: 0; background: linear-gradient(to top, rgba(7,7,7,0.8), transparent 50%); }}
    .still .playbtn {{ position: absolute; left: 50%; top: 50%; width: 40px; height: 40px; margin: -20px 0 0 -20px; border-radius: 50%;
                       background: rgba(255,255,255,0.9); display: flex; align-items: center; justify-content: center;
                       box-shadow: 0 8px 20px rgba(0,0,0,.4); color: #000; }}
    .still .menu {{ position: absolute; top: 8px; right: 8px; width: 26px; height: 26px; border-radius: 50%;
                    background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; color: #fff; }}
    .tb-btn {{ width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: {T3}; }}
    .field {{ display: flex; align-items: center; gap: 8px; height: 28px; padding: 0 10px; border-radius: 7px;
              background: rgba(255,255,255,0.06); color: {T3}; font-size: 12px; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06); }}
    .kbd {{ font-size: 10px; font-weight: 600; color: {T3}; background: rgba(255,255,255,0.06); border-radius: 4px; padding: 2px 5px;
            box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08); font-family: {FONT}; }}
    .seg {{ display: inline-flex; background: rgba(255,255,255,0.06); border-radius: 7px; padding: 2px; gap: 2px; }}
    .seg span {{ padding: 4px 12px; border-radius: 5px; font-size: 12px; font-weight: 500; color: {T2}; white-space: nowrap; display: inline-flex; align-items: center; }}
    .seg span.on {{ background: rgba(255,255,255,0.12); color: #fff; }}
    .card {{ border-radius: 12px; background: rgba(255,255,255,0.03); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06); }}
    .row {{ display: flex; align-items: center; }}
    .tabs {{ display: flex; gap: 22px; border-bottom: 1px solid rgba(255,255,255,0.06); }}
    .tabs span {{ padding: 8px 2px 10px; font-size: 13px; font-weight: 500; color: {T3}; position: relative; }}
    .tabs span.on {{ color: #fff; }}
    .tabs span.on::after {{ content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: {ACCENT}; border-radius: 2px; }}
    .toggle {{ width: 34px; height: 20px; border-radius: 999px; background: rgba(255,255,255,0.14); position: relative; flex-shrink: 0; }}
    .toggle i {{ position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; display: block; }}
    .toggle.on {{ background: {ACCENT}; }} .toggle.on i {{ left: 16px; }}
    .slider {{ position: relative; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.12); flex: 1; }}
    .slider i {{ position: absolute; left: 0; top: 0; height: 100%; background: {ACCENT}; border-radius: 2px; display: block; }}
    .slider b {{ position: absolute; top: -6px; width: 16px; height: 16px; border-radius: 50%; background: #fff; margin-left: -8px;
                 box-shadow: 0 1px 4px rgba(0,0,0,.5); display: block; }}
    .dm {{ position: absolute; font-weight: 700; font-size: 22px; white-space: nowrap; line-height: 1;
           text-shadow: 0 0 1px #000, 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }}
    .glass {{ background: rgba(18,18,20,0.72); backdrop-filter: blur(24px) saturate(160%);
              box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 1px 0 rgba(255,255,255,0.06), 0 20px 50px rgba(0,0,0,0.5); }}
    """


def doc(body: str, extra_css: str = "", script: str | None = None) -> str:
    head = f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>{base_css()}{extra_css}</style>
</helmet>
{body}
</x-dc>
"""
    tail = (script or "") + "\n</body>\n</html>\n"
    return head + tail


def lights() -> str:
    return ('<div class="lights"><span style="background:#ff5f57"></span>'
            '<span style="background:#febc2e"></span><span style="background:#28c840"></span></div>')


NAV = [
    ("首頁", [("home", "首頁"), ("calendar", "時刻表"), ("fire", "探索"), ("search", "搜尋")]),
    ("我的", [("bookmark", "收藏"), ("clock", "歷史")]),
    ("管理", [("folder", "媒體庫"), ("download", "下載"), ("bell", "通知")]),
]


def sidebar(active: str, rail: bool = False, height: int = 900) -> str:
    """Labeled (Apple TV-style) sidebar, or the web's 80px icon rail."""
    if rail:
        items = ""
        for _, group in NAV:
            for icon, label in group:
                on = label == active
                items += (f'<div title="{label}" style="width:40px;height:40px;border-radius:6px;display:flex;align-items:center;'
                          f'justify-content:center;color:{"#fff" if on else T3};'
                          f'background:{"rgba(255,255,255,0.08)" if on else "transparent"}">'
                          f'{ic(icon, 20, 2 if on else 1.5)}</div>')
            items += '<div style="width:24px;height:1px;background:rgba(255,255,255,0.06);margin:10px 0"></div>'
        items += (f'<div style="width:40px;height:40px;border-radius:6px;display:flex;align-items:center;justify-content:center;'
                  f'color:{"#fff" if active == "設定" else T3}">{ic("gear", 20)}</div>')
        return f"""
        <div style="position:absolute;left:0;top:0;bottom:0;width:80px;display:flex;flex-direction:column;align-items:center;padding-top:52px">
          <div style="width:36px;height:36px;border-radius:50%;background:radial-gradient(circle at 35% 35%, #c4b5fd, #6d28d9 70%);display:flex;align-items:center;justify-content:center;margin-bottom:14px">{ic("play", 14, 0, "#fff")}</div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px">{items}</div>
          <div style="margin-top:auto;margin-bottom:20px;display:flex;flex-direction:column;align-items:center;gap:12px">
            <div style="position:relative;color:{T3}">{ic("bell", 20)}<span style="position:absolute;top:-6px;right:-10px;background:#ef4444;color:#fff;font-size:9px;font-weight:700;border-radius:999px;padding:2px 5px;line-height:1">99+</span></div>
            <div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:{T2}">A</div>
          </div>
        </div>"""

    groups = ""
    for sec, group in NAV:
        groups += f'<div class="side-sec">{sec}</div>'
        for icon, label in group:
            on = label == active
            badge = ('<span style="margin-left:auto;background:#ef4444;color:#fff;font-size:10px;font-weight:700;'
                     'border-radius:999px;padding:2px 6px;line-height:1">12</span>') if label == "通知" else ""
            groups += f'<div class="side-item{" on" if on else ""}">{ic(icon, 16, 1.7)}<span>{label}</span>{badge}</div>'
    return f"""
    <div style="position:absolute;left:0;top:0;bottom:0;width:220px;display:flex;flex-direction:column;padding:52px 10px 14px;
                background:rgba(255,255,255,0.025);border-right:1px solid rgba(255,255,255,0.06);backdrop-filter:blur(30px)">
      <div style="display:flex;align-items:center;gap:10px;padding:0 10px 6px">
        <div style="width:28px;height:28px;border-radius:50%;background:radial-gradient(circle at 35% 35%, #c4b5fd, #6d28d9 70%);display:flex;align-items:center;justify-content:center">{ic("play", 12, 0, "#fff")}</div>
        <div style="font-size:15px;font-weight:700;color:#fff;letter-spacing:-0.01em">milmil</div>
      </div>
      {groups}
      <div style="margin-top:auto">
        <div class="side-item{" on" if active == "設定" else ""}">{ic("gear", 16, 1.7)}<span>設定</span><span class="kbd" style="margin-left:auto">⌘,</span></div>
        <div style="display:flex;align-items:center;gap:10px;padding:12px 10px 0;margin-top:8px;border-top:1px solid rgba(255,255,255,0.06)">
          <div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:{T2}">A</div>
          <div style="min-width:0"><div style="font-size:12px;font-weight:600;color:#fff">admin</div><div style="font-size:10px;color:{T3};display:flex;align-items:center;gap:4px"><span style="width:6px;height:6px;border-radius:50%;background:#22c55e;display:inline-block"></span>home-nas · v0.1.17</div></div>
        </div>
      </div>
    </div>"""


def toolbar(title: str, left: int = 220, search: str = "搜尋作品、集數…", extra: str = "") -> str:
    return f"""
    <div style="position:absolute;left:{left}px;right:0;top:0;height:52px;display:flex;align-items:center;gap:8px;padding:0 16px 0 14px;z-index:5">
      <div class="tb-btn">{ic("chevl", 16, 2)}</div><div class="tb-btn" style="color:{T4}">{ic("chevr", 16, 2)}</div>
      <div style="font-size:13px;font-weight:600;color:{T1};margin-left:4px">{title}</div>
      <div style="flex:1"></div>
      {extra}
      <div class="field" style="width:240px">{ic("search", 14, 1.8)}<span style="flex:1">{search}</span><span class="kbd">⌘K</span></div>
      <div class="tb-btn" style="position:relative">{ic("bell", 18)}<span style="position:absolute;top:2px;right:2px;width:7px;height:7px;border-radius:50%;background:#ef4444"></span></div>
    </div>"""


def window_top(title_center: str = "") -> str:
    return f"""
    <div style="position:absolute;left:0;top:0;right:0;height:52px;display:flex;align-items:center;padding:0 20px;z-index:6;pointer-events:none">
      {lights()}
      <div style="flex:1;text-align:center;font-size:13px;font-weight:600;color:{T2}">{title_center}</div>
    </div>"""


def poster(title: str, w: int, h: int, score: float | None = None, ep: str | None = None,
           cnt: str | None = None, caption: bool = True, sub: str | None = None, status: str | None = None,
           lift: bool = False) -> str:
    badges = ""
    if score:
        badges += f'<span class="score">{ic("star", 10, 0, "#fbbf24")}{score:.1f}</span>'
    if ep:
        badges += f'<span class="ep">{ep}</span>'
    if cnt:
        badges += f'<span class="cnt">{cnt}</span>'
    if status:
        col = {"在看": "rgba(59,130,246,.8)", "想看": "rgba(245,158,11,.8)", "看過": "rgba(34,197,94,.8)",
               "擱置": "rgba(113,113,122,.8)", "抛棄": "rgba(239,68,68,.8)"}[status]
        badges += (f'<span style="position:absolute;top:6px;left:6px;font-size:9px;font-weight:700;color:#fff;'
                   f'background:{col};border-radius:4px;padding:3px 6px;line-height:1;backdrop-filter:blur(6px)">{status}</span>')
    lift_css = ("transform:translateY(-6px) scale(1.04);box-shadow:0 18px 40px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.12);"
                if lift else "")
    hover = ""
    if lift:
        hover = (f'<div style="position:absolute;left:0;right:0;bottom:0;padding:10px;display:flex;gap:6px;align-items:center">'
                 f'<span style="width:32px;height:32px;border-radius:50%;background:#fff;color:#000;display:flex;align-items:center;justify-content:center">{ic("play", 14)}</span>'
                 f'<span style="width:32px;height:32px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 1px rgba(255,255,255,.15)">{ic("plus", 14, 2)}</span>'
                 f'<span style="width:32px;height:32px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 1px rgba(255,255,255,.15)">{ic("info", 14)}</span></div>')
    cap = f'<div class="cap">{title}</div>' if caption else ""
    if sub:
        cap += f'<div class="sub">{sub}</div>'
    return (f'<div style="width:{w}px;flex-shrink:0">'
            f'<div class="poster" style="width:{w}px;height:{h}px;background:{anime_gradient(title)};{lift_css}">'
            f'<div class="ttl">{title}</div><div class="shade"></div>{badges}{hover}</div>{cap}</div>')


def still(title: str, w: int, h: int, progress: float, label: str, hover: bool = False) -> str:
    hov = ""
    if hover:
        hov = (f'<div class="playbtn">{ic("play", 16)}</div><div class="menu">{ic("more", 14)}</div>')
    return (f'<div style="width:{w}px;flex-shrink:0">'
            f'<div class="still" style="width:{w}px;height:{h}px;background:{anime_gradient(title)};'
            f'{"box-shadow:0 0 0 1px rgba(255,255,255,.08);" if hover else ""}">'
            f'<div class="fade"></div>{hov}<div class="bar"><i style="width:{int(progress * 100)}%"></i></div></div>'
            f'<div class="cap" style="padding:0 2px">{title}</div><div class="sub" style="padding:0 2px">{label}</div></div>')


def section(title: str, more: str = "睇晒", count: str = "") -> str:
    c = f'<span style="font-size:13px;color:{T3};font-weight:500;margin-left:8px">{count}</span>' if count else ""
    return (f'<div class="row" style="justify-content:space-between;margin-bottom:14px">'
            f'<div class="row"><h2 class="h2">{title}</h2>{c}</div>'
            f'<span class="more">{more} {ic("chevr", 12, 2)}</span></div>')


def backdrop(name: str, top: int = 0, height: int = 640, left: int = 220, alpha: float = 1.0) -> str:
    h1 = hue(name)
    return (f'<div style="position:absolute;left:{left}px;right:0;top:{top}px;height:{height}px;pointer-events:none;opacity:{alpha};'
            f'background:'
            f'linear-gradient(to bottom, rgba(7,7,7,0) 0%, rgba(7,7,7,0) 40%, {BG} 100%),'
            f'linear-gradient(to right, {BG} 0%, rgba(7,7,7,0.6) 30%, rgba(7,7,7,0) 60%),'
            f'radial-gradient(ellipse 60% 80% at 75% 30%, oklch(45% 0.18 {h1}) 0%, transparent 70%),'
            f'radial-gradient(ellipse 40% 60% at 95% 70%, oklch(35% 0.2 {(h1 + 60) % 360}) 0%, transparent 70%),'
            f'{anime_gradient(name)}"></div>')


# ---------------------------------------------------------------- artboards
W, H = 1440, 900


def wrap(inner: str, w: int = W, h: int = H, bg: str = BG) -> str:
    return f'<div class="win" style="width:{w}px;height:{h}px;background-color:{bg}">{inner}</div>'


def ab_home(rail: bool = False) -> str:
    left = 80 if rail else 220
    feat = "黄泉使者"
    hero = f"""
    {backdrop(feat, 0, 560, left)}
    <div style="position:absolute;left:{left + 40}px;top:120px;display:flex;align-items:center;gap:32px;z-index:2">
      {poster(feat, 220, 320, caption=False)}
      <div style="max-width:640px;display:flex;flex-direction:column;gap:14px">
        <div style="font-size:40px;font-weight:800;letter-spacing:-0.02em;line-height:1.1;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.5)">{feat}</div>
        <div class="row" style="gap:10px"><span style="color:{ACCENT};font-weight:700;font-size:15px;display:inline-flex;align-items:center;gap:4px">{ic("heart", 14)}6.9</span>
          <span style="width:1px;height:14px;background:rgba(255,255,255,.15)"></span>
          <span class="chip">動作</span><span class="chip">冒險</span><span class="chip">喜劇</span><span class="chip">奇幻</span>
          <span class="chip" style="background:rgba(255,255,255,.05);color:{T3}">2026年4月 · TV · 24 集</span></div>
        <div style="font-size:14px;font-weight:600;color:rgba(255,255,255,.65);line-height:1.65;max-width:560px;text-shadow:0 1px 6px rgba(0,0,0,.5)">尤尔是一名住在山中小村庄的猎人少年，靠着狩猎野鸟维生，与双胞胎妹妹阿萨及村民们过着朴实的生活。然而，这样平稳的日常却被空中响起的"龙的叫声"给撕裂了——</div>
        <div class="row" style="gap:10px;padding-top:4px">
          <span class="btn pri">{ic("play", 14)}播放 EP1</span>
          <span class="btn sec">詳情</span>
          <span class="btn sec" style="padding:8px 10px">{ic("plus", 14, 2)}</span>
          <span style="margin-left:12px;font-size:12px;color:{T3}">指標停留 1 秒自動播放預告</span>
        </div>
      </div>
    </div>
    <div style="position:absolute;left:{left + 40}px;top:470px;display:flex;gap:8px;align-items:center;z-index:2">
      <span style="width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.5)"></span><span style="width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.5)"></span>
      <span style="width:22px;height:6px;border-radius:999px;background:#fff"></span>
      <span style="width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.5)"></span><span style="width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.5)"></span><span style="width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.5)"></span>
    </div>
    <div style="position:absolute;right:32px;top:500px;display:flex;gap:6px;z-index:2">
      <span class="tb-btn" style="background:rgba(255,255,255,.06)">{ic("chevl", 16, 2)}</span><span class="tb-btn" style="background:rgba(255,255,255,.06)">{ic("chevr", 16, 2)}</span>
    </div>"""

    cw = still("尖帽子的魔法工房", 280, 158, 0.71, "EP 1 · 剩 7 分鐘", hover=True)
    cw += still("葬送的芙莉莲", 280, 158, 0.35, "EP 12 · 剩 15 分鐘")
    cw += still("药屋少女的呢喃", 280, 158, 0.12, "EP 4 · 剛開始")
    cw += still("迷宫饭", 280, 158, 0.9, "EP 9 · 剩 2 分鐘")

    today = ""
    for name, t, epn in [("左撇子艾伦", "00:00", "EP 4"), ("和班上第二可爱的女孩成为朋友", "01:29", "EP 4"),
                         ("百鬼夜行抄", "21:55", "EP 4"), ("当前、正被打扰中！", "22:00", "EP 3"), ("夏日重现", "23:30", "EP 6")]:
        today += poster(name, 150, 225, ep=epn, sub=f"{t} JST · 本地 23:00", caption=True)

    trend = "".join(poster(n, 150, 225, score=s, cnt=f"{12 + i} 集") for i, (n, s) in enumerate(zip(SHOWS[:7], SCORES[:7])))

    content = f"""
    <div style="position:absolute;left:{left + 40}px;right:32px;top:540px;display:flex;flex-direction:column;gap:32px;z-index:2">
      <div>{section("繼續睇")}<div style="display:flex;gap:14px">{cw}</div></div>
      <div>{section("今日時刻表", "時刻表")}<div style="display:flex;gap:14px">{today}</div></div>
      <div>{section("現在熱門", "探索")}<div style="display:flex;gap:14px">{trend}</div></div>
    </div>"""

    return wrap(sidebar("首頁", rail) + toolbar("首頁", left) + window_top() + hero + content)


def ab_home_main() -> str:
    """Home with a tweak switching the sidebar between labeled (Apple TV) and icon rail (web parity)."""
    body = f"""
    <sc-if value="{{{{labeled}}}}" hint-placeholder-val="{{{{true}}}}">{ab_home(False)}</sc-if>
    <sc-if value="{{{{rail}}}}" hint-placeholder-val="{{{{false}}}}">{ab_home(True)}</sc-if>"""
    script = """<script data-dc-script data-props='{"sidebar":{"editor":"enum","options":["labeled","rail"],"default":"labeled","section":"Shell"},"$preview":{"width":1440,"height":900}}'>
class Component extends DCLogic {
  renderVals() {
    const s = this.props.sidebar ?? 'labeled';
    return { labeled: s === 'labeled', rail: s === 'rail' };
  }
}
</script>"""
    return doc(body, script=script)


def ab_login() -> str:
    wall = ""
    for i, n in enumerate((SHOWS * 4)[:60]):
        wall += f'<div style="aspect-ratio:2/3;border-radius:3px;background:{anime_gradient(n + str(i))}"></div>'
    inner = f"""
    <div style="position:absolute;inset:0;overflow:hidden">
      <div style="position:absolute;left:-30%;right:-30%;top:-20%;bottom:-20%;transform:rotate(-12deg);display:grid;grid-template-columns:repeat(12, minmax(0, 1fr));gap:10px 5px;opacity:.9">{wall}</div>
      <div style="position:absolute;inset:0;background:rgba(0,0,0,.55)"></div>
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom, rgba(7,7,7,.4), rgba(7,7,7,.95))"></div>
      <div style="position:absolute;left:50%;top:50%;width:600px;height:600px;margin:-300px 0 0 -300px;border-radius:50%;background:rgba(167,139,250,.05);filter:blur(120px)"></div>
    </div>
    {window_top()}
    <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:400px;display:flex;flex-direction:column;align-items:center">
      <div style="width:52px;height:52px;border-radius:14px;background:rgba(167,139,250,.1);box-shadow:inset 0 0 0 1px rgba(167,139,250,.2);display:flex;align-items:center;justify-content:center;margin-bottom:14px">
        <div style="width:30px;height:30px;border-radius:50%;background:radial-gradient(circle at 35% 35%, #c4b5fd, #6d28d9 70%);display:flex;align-items:center;justify-content:center">{ic("play", 12, 0, "#fff")}</div></div>
      <div style="font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.01em">milmil</div>
      <div style="font-size:13px;font-weight:500;color:{T2};margin-top:4px;margin-bottom:28px">登入你的 milmil 伺服器</div>
      <div style="width:100%;border-radius:14px;padding:28px;background:rgba(7,7,7,.7);backdrop-filter:blur(24px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06), 0 30px 60px rgba(0,0,0,.5);display:flex;flex-direction:column;gap:16px">
        <div>
          <div style="font-size:12px;font-weight:600;color:{T2};margin-bottom:6px">伺服器</div>
          <div class="field" style="height:36px;font-size:13px;color:{T1};justify-content:space-between">
            <span class="row" style="gap:8px">{ic("server", 14)}home-nas <span style="color:{T3};font-weight:400">· https://milmil.home.arpa</span></span>
            <span class="row" style="gap:6px;color:#22c55e;font-size:11px;font-weight:600"><span style="width:6px;height:6px;border-radius:50%;background:#22c55e"></span>v0.1.17</span>
          </div>
          <div style="font-size:11px;color:{T3};margin-top:6px">切換伺服器 · 新增伺服器…</div>
        </div>
        <div><div style="font-size:12px;font-weight:600;color:{T2};margin-bottom:6px">使用者名稱</div><div class="field" style="height:36px;font-size:13px;color:{T1}">admin</div></div>
        <div><div style="font-size:12px;font-weight:600;color:{T2};margin-bottom:6px">密碼</div><div class="field" style="height:36px;font-size:13px;color:{T1};letter-spacing:.2em">••••••••••</div></div>
        <div class="btn acc" style="justify-content:center;height:38px;font-size:13px">登入</div>
        <div style="font-size:11px;color:{T3};text-align:center;line-height:1.5">此裝置會以「milmil for macOS — Pie」登記為一組 API token，<br>可在設定 › 帳號 隨時撤銷。</div>
      </div>
      <div style="font-size:11px;color:rgba(255,255,255,.15);margin-top:24px">伺服器尚未初始化？在瀏覽器完成首次設定 →</div>
    </div>"""
    return doc(wrap(inner))


def ab_schedule() -> str:
    days = [("全部", ""), ("週一 (月)", "4月20日"), ("週二 (火)", "4月21日"), ("週三 (水)", "4月22日"), ("週四 (木)", "4月23日"),
            ("週五 (金)", "4月24日"), ("週六 (土)", "4月25日"), ("週日 (日)", "4月26日")]
    tabs = ""
    for i, (d, dt) in enumerate(days):
        on = i == 2
        tabs += (f'<span class="{"on" if on else ""}" style="display:inline-flex;gap:6px;align-items:baseline">{d}'
                 f'<span style="font-size:10px;color:{ACCENT if on else T4}">{dt}</span></span>')

    def group(t: str, names: list[tuple[str, str, float]]) -> str:
        ps = "".join(poster(n, 168, 252, score=s, ep=e) for n, e, s in names)
        return f"""<div style="display:flex;flex-direction:column;gap:14px">
          <div class="row" style="gap:10px"><span style="width:10px;height:10px;border-radius:50%;background:rgba(167,139,250,.5);box-shadow:0 0 0 3px rgba(167,139,250,.15)"></span>
            <span class="chip" style="background:rgba(255,255,255,.06);font-variant-numeric:tabular-nums;font-weight:600">{t}</span>
            <span style="font-size:11px;color:{T3}">本地 {t}</span><span style="flex:1;height:1px;background:rgba(255,255,255,.06)"></span></div>
          <div style="display:flex;gap:14px">{ps}</div></div>"""

    inner = f"""
    {sidebar("時刻表")}{toolbar("時刻表", extra='<span class="seg"><span>' + ic("grid", 14) + '</span><span class="on">' + ic("list", 14) + '</span></span>')}{window_top()}
    <div style="position:absolute;left:260px;right:32px;top:72px;display:flex;flex-direction:column;gap:20px">
      <div class="row" style="gap:18px">
        <span class="row" style="gap:10px"><span class="tb-btn">{ic("chevl", 14, 2)}</span><span style="font-size:24px;font-weight:700;letter-spacing:-0.01em">2026</span><span class="tb-btn">{ic("chevr", 14, 2)}</span></span>
        <span style="width:1px;height:20px;background:rgba(255,255,255,.1)"></span>
        <span class="seg"><span>冬季</span><span class="on">春季</span><span>夏季</span><span>秋季</span></span>
        <span style="flex:1"></span>
        <span style="font-size:12px;color:{T3}">時區：顯示本地時間（JST 換算）</span>
        <span class="seg"><span>S</span><span class="on">M</span><span>L</span></span>
      </div>
      <div class="tabs">{tabs}</div>
      <div class="row" style="gap:10px"><span style="font-size:18px;font-weight:700">火曜日</span><span style="font-size:12px;color:{T3}">9 部本週節目</span><span class="row" style="gap:4px;font-size:11px;color:{ACCENT};font-weight:600"><span style="width:6px;height:6px;border-radius:50%;background:{ACCENT}"></span>今天</span></div>
      <div style="display:flex;flex-direction:column;gap:28px">
        {group("00:00", [("左撇子艾伦", "EP 4", 6.2), ("和班上第二可爱的女孩成为朋友", "EP 4", 5.8)])}
        {group("21:55", [("百鬼夜行抄", "EP 4", 4.1), ("女神异世界转生想成为什么", "EP 4", 6.9), ("当前、正被打扰中！", "EP 4", 5.4)])}
      </div>
    </div>"""
    return doc(wrap(inner))


def ab_discover() -> str:
    feat = "Re：从零开始的异世界生活"
    genres = ["動作", "冒險", "喜劇", "劇情", "奇幻", "懸疑", "心理", "戀愛", "科幻", "日常", "超自然", "驚悚", "恐怖", "運動", "音樂"]
    tags = ["漫畫改編", "輕小說改編", "原創", "遊戲改編", "續篇", "異世界", "校園", "戰鬥", "後宮", "百合", "機戰", "偶像", "治癒", "搞笑"]
    gch = "".join(f'<span class="chip{" on" if g == "奇幻" else ""}">{g}</span>' for g in genres)
    tch = "".join(f'<span class="chip" style="background:rgba(255,255,255,.04);color:{T3}">{t}</span>' for t in tags)
    hero = f"""
    {backdrop(feat, 0, 420)}
    <div style="position:absolute;left:260px;top:96px;display:flex;align-items:center;gap:28px;z-index:2">
      {poster(feat, 170, 250, caption=False)}
      <div style="max-width:620px;display:flex;flex-direction:column;gap:12px">
        <div style="font-size:34px;font-weight:800;letter-spacing:-0.02em;line-height:1.1;color:#fff">{feat}</div>
        <div class="row" style="gap:10px"><span style="color:{ACCENT};font-weight:700;font-size:15px;display:inline-flex;align-items:center;gap:4px">{ic("heart", 14)}7.4</span><span style="width:1px;height:14px;background:rgba(255,255,255,.15)"></span><span class="chip">動作</span><span class="chip">冒險</span><span class="chip">劇情</span><span class="chip">奇幻</span></div>
        <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,.6);line-height:1.65">从便利店回来的路上突然被召唤到异世界的少年，菜月昴。在无可依赖的异世界，无力的少年所唯一拥有的力量……那就是死后便会使时间倒转的"死亡回归"的力量。</div>
        <div class="row" style="gap:10px"><span class="btn pri">詳情</span><span class="btn sec">預覽</span></div>
      </div>
    </div>"""
    rows = ""
    for title, names in [("現在熱門", SHOWS[:7]), ("本季最佳", SHOWS[7:14])]:
        ps = "".join(poster(n, 150, 225, score=SCORES[SHOWS.index(n)], cnt="13 集") for n in names)
        rows += f'<div>{section(title, "睇晒", "20")}<div style="display:flex;gap:14px">{ps}</div></div>'
    inner = f"""{sidebar("探索")}{toolbar("探索")}{window_top()}{hero}
    <div style="position:absolute;left:260px;right:32px;top:400px;display:flex;flex-direction:column;gap:26px;z-index:2">
      <div style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;gap:8px;flex-wrap:wrap">{gch}</div><div style="display:flex;gap:8px;flex-wrap:wrap">{tch}</div></div>
      {rows}
    </div>"""
    return doc(wrap(inner))


def ab_search() -> str:
    filters = [("排序", "人氣"), ("年份", "2026"), ("季節", "全部"), ("最低分", "6.0"), ("狀態", "放送中"), ("類型", "奇幻 +1")]
    fch = "".join(f'<span class="field" style="height:30px;gap:6px;color:{T1}"><span style="color:{T3}">{k}</span>{v}{ic("chevd", 12, 2)}</span>' for k, v in filters)
    grid = "".join(poster(n, 150, 225, score=s, cnt="13 集") for n, s in zip(SHOWS, SCORES)) + poster("魔法使的新娘", 150, 225, score=7.6, cnt="24 集")
    inner = f"""{sidebar("搜尋")}{toolbar("搜尋", search="魔法")}{window_top()}
    <div style="position:absolute;left:260px;right:32px;top:72px;display:flex;flex-direction:column;gap:18px">
      <div class="row" style="gap:12px"><span style="font-size:26px;font-weight:700;letter-spacing:-0.01em">「魔法」</span><span style="font-size:13px;color:{T3}">15 個結果 · 本地媒體庫 2 個</span></div>
      <div class="row" style="gap:8px">{ic("filter", 14)}{fch}<span style="flex:1"></span><span class="seg"><span class="on">{ic("grid", 14)}</span><span>{ic("list", 14)}</span></span></div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <div class="row" style="gap:8px;font-size:12px;font-weight:600;color:{T2}">{ic("folder", 14)}在你的媒體庫</div>
        <div style="display:flex;gap:14px">{poster("尖帽子的魔法工房", 150, 225, score=7.1, cnt="13 集", status="在看")}{poster("魔法使的新娘", 150, 225, score=7.6, cnt="24 集", status="看過")}</div>
        <div class="row" style="gap:8px;font-size:12px;font-weight:600;color:{T2};margin-top:8px">{ic("fire", 14)}Bangumi / AniList</div>
        <div style="display:grid;grid-template-columns:repeat(7, minmax(0, 1fr));gap:14px">{grid}</div>
      </div>
    </div>"""
    return doc(wrap(inner))


def ab_palette() -> str:
    def item(n: str, meta: str, on: bool = False, local: bool = False) -> str:
        tag = (f'<span class="chip" style="font-size:10px;padding:2px 7px;background:rgba(34,197,94,.15);color:#4ade80">媒體庫</span>'
               if local else "")
        return (f'<div class="row" style="gap:12px;padding:8px 12px;border-radius:8px;background:{"rgba(255,255,255,.08)" if on else "transparent"}">'
                f'<div style="width:34px;height:48px;border-radius:4px;background:{anime_gradient(n)};flex-shrink:0"></div>'
                f'<div style="min-width:0;flex:1"><div style="font-size:13px;font-weight:600;color:#fff">{n}</div><div style="font-size:11px;color:{T3}">{meta}</div></div>{tag}'
                f'<span class="kbd" style="opacity:{1 if on else 0}">↩</span></div>')
    inner = f"""
    <div class="glass" style="position:absolute;left:40px;top:40px;width:640px;border-radius:14px;overflow:hidden">
      <div class="row" style="gap:10px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.06)">{ic("search", 18, 1.8)}<span style="font-size:17px;color:#fff;flex:1">魔法<span style="display:inline-block;width:1px;height:18px;background:{ACCENT};margin-left:1px;vertical-align:-3px"></span></span><span class="kbd">esc</span></div>
      <div style="padding:8px;display:flex;flex-direction:column;gap:2px">
        <div style="font-size:11px;font-weight:600;color:{T3};padding:6px 12px 4px">作品</div>
        {item("尖帽子的魔法工房", "2026 · 13 集 · 在看 EP 1", on=True, local=True)}
        {item("魔法使的新娘", "2017 · 24 集", local=True)}
        {item("魔法少女小圆", "2011 · 12 集")}
        {item("魔法科高中的劣等生", "2014 · 26 集")}
        <div style="font-size:11px;font-weight:600;color:{T3};padding:10px 12px 4px">動作</div>
        <div class="row" style="gap:12px;padding:8px 12px"><span class="tb-btn" style="background:rgba(255,255,255,.06);color:{T2}">{ic("play", 14)}</span><span style="font-size:13px;color:{T1};flex:1">繼續播放 尖帽子的魔法工房 EP 1</span><span class="kbd">⌘ ↩</span></div>
        <div class="row" style="gap:12px;padding:8px 12px"><span class="tb-btn" style="background:rgba(255,255,255,.06);color:{T2}">{ic("download", 14)}</span><span style="font-size:13px;color:{T1};flex:1">搜尋「魔法」的種子資源</span></div>
      </div>
      <div class="row" style="gap:14px;padding:10px 16px;border-top:1px solid rgba(255,255,255,.06);font-size:11px;color:{T3}"><span><span class="kbd">↑↓</span> 移動</span><span><span class="kbd">↩</span> 開啟</span><span><span class="kbd">⌘↩</span> 播放</span><span style="flex:1"></span><span>本地 + Bangumi 即時搜尋</span></div>
    </div>"""
    return doc(f'<div style="width:720px;height:560px;background:{BG};position:relative;border-radius:10px;background-image:{anime_gradient("palette")};"><div style="position:absolute;inset:0;background:rgba(7,7,7,.7)"></div>{inner}</div>')


def ab_detail() -> str:
    feat = "黄泉使者"
    meta = (f'<div class="row" style="gap:10px"><span style="color:{ACCENT};font-weight:700;font-size:15px;display:inline-flex;align-items:center;gap:4px">{ic("heart", 14)}6.9</span>'
            f'<span class="chip" style="padding:2px 6px;border-radius:4px;font-size:11px">TV</span><span style="font-size:12px;font-weight:500;color:rgba(255,255,255,.55)">24 集</span>'
            f'<span style="font-size:12px;font-weight:500;color:rgba(255,255,255,.55)">2026-04</span><span style="font-size:11px;color:rgba(255,255,255,.35)">760 評分</span>'
            f'<span class="chip" style="padding:2px 7px;border-radius:999px;font-size:10px;background:rgba(245,158,11,.2);color:#fcd34d;font-weight:600"><span style="width:6px;height:6px;border-radius:50%;background:#fbbf24"></span>放送中</span></div>')
    chips = "".join(f'<span class="chip" style="border-radius:4px;font-size:11px;font-weight:600;padding:3px 8px">{c}</span>' for c in ["2026年4月", "漫画改", "BONES", "TV", "战斗", "奇幻"])
    caps = "".join(f'<span class="chip" style="border-radius:4px;font-size:10px;font-weight:700;padding:3px 7px;background:rgba(255,255,255,.06);color:{T2};letter-spacing:.02em">{c}</span>' for c in ["1080p", "HEVC 10-bit", "2 音軌", "3 字幕", "本機直開"])

    def ep(n: int, title: str, desc: str, prog: float | None, missing: bool = False, date: str = "", cur: bool = False) -> str:
        thumb = (f'<div style="width:176px;height:99px;border-radius:6px;background:{anime_gradient(feat + str(n))};position:relative;flex-shrink:0;'
                 f'{"opacity:.35" if missing else ""}">'
                 + (f'<div class="bar" style="position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.15)"><i style="display:block;height:100%;width:{int(prog * 100)}%;background:{ACCENT}"></i></div>' if prog is not None else "")
                 + (f'<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><span style="width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.92);display:flex;align-items:center;justify-content:center;color:#000">{ic("play", 14)}</span></div>' if cur else "")
                 + '</div>')
        tag = (f'<span class="chip" style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(255,255,255,.05);color:{T3}">無檔案 · {date}</span>' if missing
               else (f'<span class="chip" style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(34,197,94,.12);color:#4ade80">已看完</span>' if prog and prog >= 0.97
                     else (f'<span class="chip" style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(167,139,250,.15);color:{ACCENT}">剩 12 分鐘</span>' if prog else "")))
        return (f'<div class="row" style="gap:14px;align-items:flex-start;padding:8px;border-radius:10px;{"background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)" if cur else ""}">{thumb}'
                f'<div style="min-width:0;flex:1;padding-top:2px"><div class="row" style="gap:8px"><span style="font-size:12px;font-weight:700;color:{T3}">第 {n} 集</span>{tag}</div>'
                f'<div style="font-size:14px;font-weight:600;color:{"#fff" if not missing else T3};margin-top:4px">{title}</div>'
                f'<div style="font-size:12px;color:{T3};line-height:1.5;margin-top:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">{desc}</div></div>'
                f'{"" if missing else f"<span class=tb-btn>{ic('more', 16)}</span>"}</div>')

    eps = "".join([
        ep(1, "阿萨与尤尔", "In a world where certain humans are born with the power to…", 1.0),
        ep(2, "右与左", "Guided by Dera, Yuru flees from his village and…", 1.0),
        ep(3, "戴拉与花", "唯一の家族と信じていた双子の妹・アサは…", 0.62, cur=True),
        ep(4, "仁与尤尔", "密かに「アサを捜し出して、両親のもとへ…", None),
        ep(5, "Episode 5", "", None, missing=True, date="2026-05-02"),
        ep(6, "Episode 6", "", None, missing=True, date="2026-05-09"),
    ])
    rel = "".join(f'<div class="row" style="gap:10px;padding:8px;border-radius:8px;background:rgba(255,255,255,.03)"><div style="width:40px;height:56px;border-radius:4px;background:{anime_gradient(n)}"></div><div><div style="font-size:12px;font-weight:600;color:#fff">{n}</div><div style="font-size:11px;color:{T3}">{k}</div></div></div>'
                  for n, k in [("黄泉使者 第二季", "續篇 · 2027"), ("黄泉のツガイ (漫画)", "原作")])
    chars = "".join(f'<div class="row" style="gap:8px"><div style="width:36px;height:36px;border-radius:50%;background:{anime_gradient(c)}"></div><div><div style="font-size:12px;font-weight:600;color:#fff">{c}</div><div style="font-size:10px;color:{T3}">CV {v}</div></div></div>'
                    for c, v in [("尤尔", "小林千晃"), ("阿萨", "石川由依"), ("戴拉", "诹访部顺一")])

    inner = f"""{sidebar("首頁")}{toolbar("黄泉使者")}{window_top()}{backdrop(feat, 0, 520)}
    <div style="position:absolute;left:260px;right:32px;top:96px;display:flex;gap:28px;z-index:2">
      {poster(feat, 200, 290, caption=False)}
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:10px;max-width:700px;padding-top:6px">
        <div><div style="font-size:32px;font-weight:800;letter-spacing:-0.02em;line-height:1.1;color:#fff">黄泉使者</div><div style="font-size:13px;font-weight:500;color:{T2};margin-top:4px">黄泉のツガイ</div></div>
        {meta}
        <div class="row" style="gap:6px;flex-wrap:wrap">{chips}</div>
        <div class="row" style="gap:6px">{caps}</div>
        <div class="row" style="gap:8px;padding-top:4px">
          <span class="btn pri">{ic("play", 14)}繼續 EP3 · 剩 12 分鐘</span>
          <span class="btn sec">{ic("bookmark", 14)}在看 {ic("chevd", 12, 2)}</span>
          <span class="btn sec">{ic("star", 14, 0, "#fbbf24")}8</span>
          <span class="btn sec">{ic("search", 14)}搵資源</span>
          <span class="btn sec" style="padding:8px 10px">{ic("more", 14)}</span>
        </div>
        <div style="font-size:13px;font-weight:500;color:rgba(255,255,255,.7);line-height:1.7;margin-top:4px">尤尔是一名住在山中小村庄的猎人少年，靠着狩猎野鸟维生，与双胞胎妹妹阿萨及村民们过着朴实的生活。然而，这样平稳的日常却被空中响起的"龙的叫声"给撕裂了—— 安逸的村庄里潜藏着传承与谜团，这个村里究竟藏着什么秘密呢？</div>
      </div>
      <div style="width:300px;flex-shrink:0;display:flex;flex-direction:column;gap:10px;padding-top:6px">
        <div style="font-size:13px;font-weight:700;color:#fff">預告片</div>
        <div style="height:168px;border-radius:10px;background:{anime_gradient(feat + 'pv')};position:relative;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)"><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><span style="width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,.92);display:flex;align-items:center;justify-content:center;color:#000">{ic("play", 18)}</span></div><div style="position:absolute;left:10px;bottom:8px;font-size:11px;color:{T2}">【メインPV】TVアニメ「黄泉のツガイ」</div></div>
        <div style="font-size:13px;font-weight:700;color:#fff;margin-top:8px">關聯作品</div>{rel}
      </div>
    </div>
    <div style="position:absolute;left:260px;right:32px;top:520px;display:flex;gap:28px;z-index:2">
      <div style="flex:1;min-width:0"><div class="row" style="justify-content:space-between;margin-bottom:10px"><div class="row"><h2 class="h2">集數</h2><span style="font-size:13px;color:{T3};margin-left:8px">24 集 · 4 有檔案</span></div><span class="seg"><span class="on">全部</span><span>未看</span><span>有檔案</span></span></div>
        <div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:4px 20px">{eps}</div></div>
      <div style="width:300px;flex-shrink:0"><div style="font-size:13px;font-weight:700;color:#fff;margin-bottom:10px">角色 / 聲優</div><div style="display:flex;flex-direction:column;gap:10px">{chars}</div></div>
    </div>"""
    return doc(wrap(inner))


# ---- player -------------------------------------------------------------------------------------
DANMAKU = [  # (x, y, text, color)
    (520, 110, "哇好靚啊！", "#fff"), (330, 160, "Qifrey 老師真係靚仔", "#fde68a"), (230, 215, "呢段作畫勁！", "#67e8f9"),
    (760, 250, "可可加油！！", "#f0abfc"), (300, 320, "魔法陣好複雜", "#fff"), (470, 380, "第一集已經跪低", "#86efac"),
    (120, 430, "BGM 好有氣氛", "#fde68a"), (640, 460, "前排", "#fff"), (900, 150, "這作畫是劇場版規格", "#fff"),
]


def video_area(w: int, h: int, title_overlay: bool = True, danmaku: bool = True, subtitle: bool = True,
               scale: float = 1.0, osd: str | None = None) -> str:
    dms = ""
    if danmaku:
        for x, y, t, c in DANMAKU:
            if x * scale < w - 40 and y * scale < h * 0.85:
                dms += f'<span class="dm" style="left:{int(x * scale)}px;top:{int(y * scale)}px;color:{c};font-size:{int(22 * scale)}px">{t}</span>'
    sub = (f'<div style="position:absolute;left:50%;bottom:{int(150 * scale)}px;transform:translateX(-50%);font-size:{int(24 * scale)}px;font-weight:600;color:#fff;'
           f'text-shadow:0 0 2px #000, 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000;white-space:nowrap">请问我做完后能去看飞天马车吗？</div>') if subtitle else ""
    scene = (f'<div style="position:absolute;inset:0;background:'
             f'radial-gradient(ellipse 50% 60% at 30% 60%, oklch(55% 0.12 70 / .9), transparent 70%),'
             f'radial-gradient(ellipse 40% 50% at 75% 35%, oklch(50% 0.1 330 / .8), transparent 70%),'
             f'linear-gradient(180deg, oklch(30% 0.06 60), oklch(20% 0.05 40))"></div>'
             f'<div style="position:absolute;left:8%;right:8%;top:18%;bottom:30%;border-radius:4px;background:repeating-linear-gradient(90deg, rgba(0,0,0,.08) 0 6px, transparent 6px 18px);opacity:.5"></div>')
    tov = (f'<div style="position:absolute;left:0;right:0;top:0;height:{int(120 * scale)}px;background:linear-gradient(to bottom, rgba(0,0,0,.6), transparent);pointer-events:none"></div>'
           f'<div style="position:absolute;left:{max(int(96 * scale), 86)}px;top:{int(18 * scale)}px;display:flex;flex-direction:column;gap:2px">'
           f'<div style="font-size:{int(16 * scale)}px;font-weight:700;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.6)">尖帽子的魔法工房</div>'
           f'<div style="font-size:{int(12 * scale)}px;font-weight:500;color:rgba(255,255,255,.7);text-shadow:0 1px 6px rgba(0,0,0,.6)">EP 1 · 魔法的開端 · 2026 · 13 集</div></div>') if title_overlay else ""
    osdp = (f'<div class="glass" style="position:absolute;left:50%;top:{int(70 * scale)}px;transform:translateX(-50%);border-radius:999px;padding:8px 14px;display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#fff">{osd}</div>') if osd else ""
    return f'<div style="position:absolute;inset:0;overflow:hidden;background:#000">{scene}{dms}{sub}{tov}{osdp}</div>'


def osc(w: int, left: int, bottom: int, compact: bool = False, danmaku_on: bool = True, peek: bool = True) -> str:
    peek_html = ""
    if peek:
        peek_html = (f'<div style="position:absolute;left:38%;bottom:calc(100% + 14px);transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px">'
                     f'<div style="width:176px;height:99px;border-radius:8px;background:{anime_gradient("peek")};box-shadow:0 0 0 1px rgba(255,255,255,.15), 0 12px 30px rgba(0,0,0,.6)"></div>'
                     f'<span style="font-size:11px;font-weight:700;color:#fff;background:rgba(0,0,0,.7);padding:3px 8px;border-radius:4px;font-variant-numeric:tabular-nums">09:02</span></div>')
    seek = f"""
    <div style="position:relative;height:4px;border-radius:2px;background:rgba(255,255,255,0.16);margin:0 4px">
      <div style="position:absolute;left:0;top:0;height:100%;width:62%;background:rgba(255,255,255,.35);border-radius:2px"></div>
      <div style="position:absolute;left:0;top:0;height:100%;width:38%;background:{ACCENT};border-radius:2px"></div>
      <div style="position:absolute;left:4%;top:-1px;height:6px;width:6.5%;background:rgba(255,255,255,.45);border-radius:2px" title="OP"></div>
      <div style="position:absolute;left:89%;top:-1px;height:6px;width:6.5%;background:rgba(255,255,255,.45);border-radius:2px" title="ED"></div>
      <div style="position:absolute;left:38%;top:-5px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>
      {peek_html}
    </div>"""
    dm_btn = (f'<span class="row" style="gap:6px;padding:5px 10px 5px 8px;border-radius:999px;background:{"rgba(255,255,255,.12)" if danmaku_on else "rgba(255,255,255,.04)"};color:{"#fff" if danmaku_on else "rgba(255,255,255,.25)"};font-size:11px;font-weight:600">{ic("danmaku", 16)}{"開" if danmaku_on else "關"}</span>')
    b = lambda n, s=20, c="#fff": f'<span style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;color:{c}">{ic(n, s)}</span>'
    controls = f"""
    <div class="row" style="gap:4px;margin-top:10px">
      {b("prev", 18, "rgba(255,255,255,.7)")}{b("back10", 22)}
      <span style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;color:#fff">{ic("pause", 26)}</span>
      {b("fwd10", 22)}{b("next", 18, "rgba(255,255,255,.7)")}
      <span style="font-size:12px;font-weight:600;color:rgba(255,255,255,.85);font-variant-numeric:tabular-nums;margin:0 8px;white-space:nowrap">09:02 <span style="color:rgba(255,255,255,.4)">/ 23:41</span></span>
      {b("volume", 18, "rgba(255,255,255,.85)")}<span style="width:70px;height:4px;border-radius:2px;background:rgba(255,255,255,.2);position:relative"><span style="position:absolute;left:0;top:0;height:100%;width:65%;background:#fff;border-radius:2px"></span></span>
      <span style="flex:1"></span>
      {dm_btn}
      <span class="field" style="flex:0 0 {"180" if compact else "300"}px;height:30px;border-radius:999px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.35)">發送彈幕… <span class="kbd" style="margin-left:auto">⌘↩</span></span>
      <span style="width:1px;height:18px;background:rgba(255,255,255,.12);margin:0 4px"></span>
      <span style="font-size:12px;font-weight:700;color:rgba(255,255,255,.85);padding:0 6px">1.0×</span>
      {b("cc", 20, "rgba(255,255,255,.85)")}{b("audio", 20, "rgba(255,255,255,.85)")}{b("sparkle", 18, ACCENT)}{b("sidebar", 20, "rgba(255,255,255,.85)")}{b("mini", 20, "rgba(255,255,255,.85)")}{b("fullscreen", 20, "rgba(255,255,255,.85)")}
    </div>"""
    return (f'<div class="glass" style="position:absolute;left:{left}px;width:{w}px;bottom:{bottom}px;border-radius:16px;padding:14px 16px 10px">'
            f'{seek}{controls}</div>')


def inspector(tab: str, top: int = 0, width: int = 360) -> str:
    tabs = ""
    for t in ["集數", "彈幕", "來源", "字幕", "音訊", "視訊"]:
        label = t + (" 17" if t == "彈幕" else "")
        tabs += f'<span class="{"on" if t == tab else ""}" style="padding:10px 0 12px;font-size:12px;font-weight:600">{label}</span>'
    body = ""
    if tab == "集數":
        cells = ""
        for i in range(1, 14):
            cur = i == 1
            watched = i < 1
            cells += (f'<div style="position:relative;height:70px;border-radius:6px;background:{anime_gradient("ep" + str(i))};'
                      f'{"box-shadow:0 0 0 2px " + ACCENT + ";" if cur else ""}{"opacity:.45;" if i > 5 else ""}">'
                      f'<span style="position:absolute;left:6px;top:5px;font-size:10px;font-weight:700;color:#fff;background:rgba(0,0,0,.55);padding:2px 5px;border-radius:3px">EP {i}</span>'
                      + (f'<span style="position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.15)"><i style="display:block;height:100%;width:38%;background:{ACCENT}"></i></span>' if cur else "")
                      + (f'<span style="position:absolute;right:5px;top:5px;color:#4ade80">{ic("check", 12, 2.5)}</span>' if watched else "")
                      + '</div>')
        body = (f'<div style="padding:12px 14px;display:flex;flex-direction:column;gap:10px">'
                f'<div class="row" style="justify-content:space-between"><span style="font-size:12px;color:{T3}">13 集 · 5 有檔案</span><span class="seg"><span class="on">{ic("grid", 12)}</span><span>{ic("list", 12)}</span></span></div>'
                f'<div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:8px">{cells}</div>'
                f'<div style="font-size:12px;font-weight:700;color:#fff;margin-top:10px">相關作品</div>'
                f'<div class="row" style="gap:10px"><div style="width:40px;height:56px;border-radius:4px;background:{anime_gradient("尖帽子的魔法工房 第二季")}"></div><div><div style="font-size:12px;font-weight:600;color:#fff">尖帽子的魔法工房 第二季</div><div style="font-size:11px;color:{T3}">續篇 · 2027</div></div></div>'
                '</div>')
    elif tab == "彈幕":
        rows = ""
        items = [("00:12", "前排", "ddp"), ("00:41", "這作畫是劇場版規格", "ddp"), ("01:05", "BGM 好有氣氛", "bili"), ("01:48", "Qifrey 老師真係靚仔", "ddp"),
                 ("02:10", "魔法陣好複雜", "bili"), ("02:33", "哇好靚啊！", "ddp"), ("03:02", "可可加油！！", "ddp"), ("03:15", "第一集已經跪低", "bili"),
                 ("03:40", "呢段作畫勁！", "ddp"), ("04:12", "請問我做完後能去看飛天馬車嗎？", "me"), ("05:00", "op 好聽", "ddp"), ("05:27", "字幕組辛苦了", "bili")]
        for i, (t, s, src) in enumerate(items):
            cur = i == 6
            tag = {"ddp": ("DDP", "rgba(255,255,255,.06)", T3), "bili": ("B站", "rgba(56,189,248,.15)", "#7dd3fc"), "me": ("我", "rgba(167,139,250,.2)", ACCENT)}[src]
            rows += (f'<div class="row" style="gap:10px;padding:7px 10px;border-radius:6px;background:{"rgba(167,139,250,.12)" if cur else "transparent"}">'
                     f'<span style="font-size:11px;font-variant-numeric:tabular-nums;color:{ACCENT if cur else T3};font-weight:600;width:36px">{t}</span>'
                     f'<span style="font-size:12px;color:{"#fff" if cur else T1};flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{s}</span>'
                     f'<span style="font-size:9px;font-weight:700;padding:2px 5px;border-radius:3px;background:{tag[1]};color:{tag[2]}">{tag[0]}</span></div>')
        body = (f'<div style="padding:12px 14px;display:flex;flex-direction:column;gap:8px">'
                f'<div class="row" style="gap:8px"><span class="field" style="flex:1;height:28px">{ic("search", 12)}搜尋彈幕…</span><span class="tb-btn" style="background:rgba(255,255,255,.06)">{ic("filter", 14)}</span></div>'
                f'<div class="row" style="gap:6px;font-size:11px;color:{T3}"><span class="chip" style="font-size:10px;padding:2px 7px">DandanPlay 17</span><span class="chip" style="font-size:10px;padding:2px 7px;background:rgba(56,189,248,.12);color:#7dd3fc">B站 884</span><span style="margin-left:auto">密度 中 · 已顯示 901</span></div>'
                f'<div style="display:flex;flex-direction:column;gap:1px;margin:0 -4px">{rows}</div>'
                f'<div style="font-size:11px;color:{T3};text-align:center;padding-top:4px">點擊任一條跳到該時間 · 右鍵加入封鎖詞</div></div>')
    elif tab == "來源":
        res = ""
        for i, (t, c, d) in enumerate([("【尖帽子的魔法工房】第1话", "17 彈幕", "23:41"), ("『尖帽子的魔法工坊 工房』周更 全13话", "4.5k 彈幕", "127:42"),
                                       ("【尖帽子的魔法工坊】全13话 4K超清 简中", "4.4k 彈幕", "523:45"), ("【尖帽子的魔法工坊】第1集禁忌魔法片段", "0 彈幕", "4:28")]):
            imported = i == 1
            res += (f'<div class="row" style="gap:10px;padding:8px;border-radius:8px;background:{"rgba(56,189,248,.08)" if imported else "transparent"}">'
                    f'<div style="width:64px;height:40px;border-radius:4px;background:{anime_gradient(t)};flex-shrink:0"></div>'
                    f'<div style="min-width:0;flex:1"><div style="font-size:12px;font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{t}</div><div style="font-size:10px;color:{T3}">{c} · {d}</div></div>'
                    + (f'<span class="row" style="gap:8px"><span class="row" style="gap:4px;font-size:10px;color:{T3}">儲存<span class="toggle on" style="width:28px;height:16px"><i style="width:12px;height:12px;left:14px"></i></span></span><span class="tb-btn" style="color:#f87171">{ic("trash", 14)}</span></span>' if imported
                       else f'<span style="font-size:12px;font-weight:600;color:#7dd3fc">匯入</span>') + '</div>')
        body = (f'<div style="padding:12px 14px;display:flex;flex-direction:column;gap:10px">'
                f'<div class="row" style="gap:8px"><span class="seg"><span class="on">Bilibili</span><span>DandanPlay</span></span></div>'
                f'<div class="row" style="gap:8px"><span class="field" style="flex:1;height:30px;color:{T1}">尖帽子的魔法工房 第1话</span><span class="btn sec" style="padding:6px 12px;font-size:12px">搜尋</span></div>'
                f'<div style="font-size:11px;color:{T3}">選取影片後選擇分 P，匯入後即時合併；「儲存」會寫回伺服器讓 web 也看到。</div>'
                f'<div style="display:flex;flex-direction:column;gap:2px">{res}</div>'
                f'<div class="card" style="padding:10px 12px;display:flex;flex-direction:column;gap:6px"><div style="font-size:11px;font-weight:700;color:{T2}">分 P</div><div class="row" style="gap:6px;flex-wrap:wrap">'
                + "".join(f'<span class="chip{" on" if i == 0 else ""}" style="font-size:11px">P{i + 1}</span>' for i in range(6)) + '</div></div></div>')
    return (f'<div style="position:absolute;right:0;top:{top}px;bottom:0;width:{width}px;background:rgba(28,28,30,.86);backdrop-filter:blur(40px) saturate(160%);'
            f'border-left:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;z-index:4">'
            f'<div class="tabs" style="margin:44px 14px 0">{tabs}</div>'
            f'<div style="flex:1;overflow:hidden">{body}</div></div>')


def ab_player(tab: str = "集數", osd: str | None = None, popover: bool = False, skip: bool = True, peek: bool = True) -> str:
    vw = W - 360
    subtitle = not peek  # hover-seek state hides the subtitle under the thumbnail peek
    pop = ""
    if popover:
        def sl(label: str, val: str, pct: int) -> str:
            return (f'<div class="row" style="gap:12px"><span style="font-size:12px;color:{T2};width:64px">{label}</span>'
                    f'<span class="slider"><i style="width:{pct}%"></i><b style="left:{pct}%"></b></span><span style="font-size:11px;color:{T3};width:40px;text-align:right;font-variant-numeric:tabular-nums">{val}</span></div>')
        pop = f"""
        <div class="glass" style="position:absolute;left:404px;bottom:136px;width:400px;border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:12px;z-index:5">
          <div class="row" style="justify-content:space-between"><span style="font-size:13px;font-weight:700;color:#fff">彈幕設定</span><span style="font-size:11px;color:{T3}">與 web 同步</span></div>
          <div style="height:44px;border-radius:8px;background:rgba(0,0,0,.5);position:relative;overflow:hidden"><span class="dm" style="left:10px;top:12px;font-size:18px;color:#fff">預覽彈幕 Preview</span><span class="dm" style="left:200px;top:12px;font-size:18px;color:#fde68a">あいうえお</span></div>
          {sl("透明度", "85%", 85)}{sl("字體大小", "20", 40)}{sl("速度", "144", 50)}{sl("顯示區域", "75%", 66)}
          <div class="row" style="gap:12px"><span style="font-size:12px;color:{T2};width:64px">密度</span><span class="seg"><span>低</span><span class="on">中</span><span>高</span><span>無限</span></span></div>
          <div class="row" style="gap:12px"><span style="font-size:12px;color:{T2};width:64px">描邊</span><span class="seg"><span>無</span><span>陰影</span><span class="on">描邊</span></span><span style="flex:1"></span><span style="font-size:12px;color:{T2}">粗體</span><span class="toggle on"><i></i></span></div>
          <div class="row" style="gap:12px"><span style="font-size:12px;color:{T2};width:64px">繁簡</span><span class="seg"><span>關</span><span class="on">簡→繁</span><span>繁→簡</span></span><span style="flex:1"></span><span style="font-size:12px;color:{T2};white-space:nowrap">避開字幕</span><span class="toggle on"><i></i></span></div>
          <div class="row" style="gap:8px;font-size:12px;color:{T2}"><span>顯示</span><span class="chip on" style="font-size:11px">滾動</span><span class="chip on" style="font-size:11px">頂部</span><span class="chip" style="font-size:11px">底部</span><span style="flex:1"></span><span style="color:{ACCENT};font-weight:600">封鎖詞 (3)…</span></div>
        </div>"""
    skip_btn = (f'<div class="glass" style="position:absolute;right:{360 + 24}px;bottom:140px;border-radius:999px;padding:8px 14px 8px 12px;display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:#fff;z-index:5">{ic("skip", 16)}跳過 OP <span class="kbd">S</span></div>') if skip else ""
    resume = (f'<div class="glass" style="position:absolute;left:24px;bottom:140px;border-radius:999px;padding:8px 14px;display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:#fff;z-index:5">{ic("clock", 14)}從 09:02 繼續 <span style="color:{T3};font-weight:500">· 重頭播放</span></div>') if tab == "集數" else ""
    inner = (f'<div style="position:absolute;left:0;top:0;width:{vw}px;height:{H}px">{video_area(vw, H, osd=osd, subtitle=subtitle)}{osc(vw - 48, 24, 24, peek=peek)}{pop}{skip_btn}{resume}</div>'
             f'{inspector(tab)}{window_top()}')
    return doc(wrap(inner, bg="#000"))


def ab_player_end() -> str:
    w, h = 1080, 640
    inner = f"""
    <div style="position:absolute;inset:0">{video_area(w, h, title_overlay=False, danmaku=False, subtitle=False, scale=.75)}
      <div style="position:absolute;inset:0;background:rgba(0,0,0,.62)"></div>
      <div class="glass" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:520px;border-radius:18px;padding:18px;display:flex;flex-direction:column;gap:14px">
        <div style="font-size:11px;font-weight:700;color:{T3};letter-spacing:.04em">下一集 · 10 秒後自動播放</div>
        <div class="row" style="gap:16px"><div style="width:200px;height:112px;border-radius:10px;background:{anime_gradient("ep2")};flex-shrink:0;position:relative"><span style="position:absolute;left:8px;top:8px;font-size:10px;font-weight:700;color:#fff;background:rgba(0,0,0,.55);padding:3px 6px;border-radius:4px">EP 2</span></div>
          <div style="min-width:0"><div style="font-size:17px;font-weight:700;color:#fff">魔法使的條件</div><div style="font-size:12px;color:{T2};margin-top:4px;line-height:1.5">尖帽子的魔法工房 · 23:58 · 1080p HEVC</div><div style="font-size:12px;color:{T3};margin-top:8px;line-height:1.5">可可在奇弗利的工房開始了見習生活，認識了同門的阿加特、泰緹雅與莉奇…</div></div></div>
        <div style="height:3px;border-radius:2px;background:rgba(255,255,255,.12)"><div style="width:62%;height:100%;background:{ACCENT};border-radius:2px"></div></div>
        <div class="row" style="gap:8px"><span class="btn pri">{ic("play", 14)}立即播放</span><span class="btn sec">取消</span><span style="flex:1"></span><span class="btn sec" style="padding:8px 12px">{ic("refresh", 14)}重看本集</span><span class="btn sec" style="padding:8px 12px">{ic("list", 14)}集數</span></div>
      </div>
      <div style="position:absolute;left:24px;bottom:24px;font-size:11px;color:{T3}">偏好：自動下一集 開 · 自動跳 OP/ED 開 · 進度已上報 AniList / Bangumi</div>
    </div>"""
    return doc(wrap(inner, w, h, bg="#000"))


def ab_mini() -> str:
    w, h = 480, 270
    inner = f"""
    <div style="position:absolute;inset:0">{video_area(w, h, title_overlay=False, subtitle=False, scale=.42)}
      <div style="position:absolute;inset:0;background:linear-gradient(to bottom, rgba(0,0,0,.55), transparent 35%, transparent 60%, rgba(0,0,0,.7))"></div>
      <div style="position:absolute;left:12px;top:10px;right:12px;display:flex;align-items:center;gap:8px">
        <span style="width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;color:#fff">{ic("x", 12, 2)}</span>
        <span style="font-size:12px;font-weight:600;color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.6);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">尖帽子的魔法工房 · EP 1</span>
        <span style="width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;color:#fff" title="置頂">{ic("dot", 12)}</span>
        <span style="width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;color:#fff">{ic("fullscreen", 12)}</span>
      </div>
      <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:48px;height:48px;border-radius:50%;background:rgba(0,0,0,.45);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:inset 0 0 0 1px rgba(255,255,255,.2)">{ic("pause", 22)}</div>
      <div style="position:absolute;left:12px;right:12px;bottom:12px;display:flex;flex-direction:column;gap:8px">
        <div class="row" style="justify-content:space-between;font-size:11px;font-weight:600;color:rgba(255,255,255,.85);font-variant-numeric:tabular-nums"><span class="row" style="gap:6px">{ic("danmaku", 14)}<span style="color:{T3}">彈幕 開</span></span><span>09:02 / 23:41</span></div>
        <div style="height:3px;border-radius:2px;background:rgba(255,255,255,.2)"><div style="width:38%;height:100%;background:{ACCENT};border-radius:2px"></div></div>
      </div>
    </div>"""
    return doc(f'<div style="width:{w}px;height:{h}px;border-radius:12px;overflow:hidden;position:relative;background:#000;box-shadow:0 0 0 1px rgba(255,255,255,.15), 0 30px 60px rgba(0,0,0,.7)">{inner}</div>')


def ab_collection() -> str:
    tabs = "".join(f'<span class="{"on" if t == "在看" else ""}">{t} <span style="color:{T4};font-weight:600;font-size:11px">{n}</span></span>'
                   for t, n in [("全部", 24), ("在看", 6), ("想看", 10), ("看過", 5), ("擱置", 2), ("抛棄", 1)])
    grid = "".join(poster(n, 150, 225, score=s, status="在看", cnt=f"{3 + i}/13 集", sub="更新於 2 小時前" if i == 0 else "EP 5 · 週二") for i, (n, s) in enumerate(zip(SHOWS[:6], SCORES[:6])))
    inner = f"""{sidebar("收藏")}{toolbar("收藏", search="在收藏中搜尋…")}{window_top()}
    <div style="position:absolute;left:260px;right:32px;top:72px;display:flex;flex-direction:column;gap:18px">
      <div class="row" style="justify-content:space-between"><span style="font-size:26px;font-weight:700;letter-spacing:-0.01em">收藏</span><span class="row" style="gap:8px"><span class="field" style="height:30px;color:{T1}">排序 <span style="color:{T2}">最近更新</span>{ic("chevd", 12, 2)}</span><span class="btn sec" style="padding:6px 10px;font-size:12px">{ic("refresh", 14)}同步 AniList</span></span></div>
      <div class="tabs">{tabs}</div>
      <div style="display:grid;grid-template-columns:repeat(7, minmax(0, 1fr));gap:14px 14px">{grid}</div>
    </div>"""
    return doc(wrap(inner))


def ab_history() -> str:
    def bucket(title: str, rows: list[tuple[str, str, float, str, bool]]) -> str:
        r = ""
        for n, e, p, t, checked in rows:
            r += (f'<div class="row" style="gap:14px;padding:8px 10px;border-radius:10px;background:{"rgba(167,139,250,.08)" if checked else "transparent"}">'
                  f'<span style="width:16px;height:16px;border-radius:4px;background:{ACCENT if checked else "rgba(255,255,255,.06)"};box-shadow:inset 0 0 0 1px rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;color:#14082e">{ic("check", 11, 3) if checked else ""}</span>'
                  f'<div style="width:120px;height:68px;border-radius:6px;background:{anime_gradient(n)};position:relative;flex-shrink:0"><span style="position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.15)"><i style="display:block;height:100%;width:{int(p * 100)}%;background:{ACCENT}"></i></span></div>'
                  f'<div style="min-width:0;flex:1"><div style="font-size:14px;font-weight:600;color:#fff">{n}</div><div style="font-size:12px;color:{T3};margin-top:3px">{e} · {"已看完" if p >= .97 else f"看到 {int(p * 100)}%"}</div></div>'
                  f'<span style="font-size:12px;color:{T3};font-variant-numeric:tabular-nums">{t}</span>'
                  f'<span class="btn sec" style="padding:6px 12px;font-size:12px">{ic("play", 12)}繼續</span><span class="tb-btn">{ic("more", 16)}</span></div>')
        return f'<div><div style="font-size:12px;font-weight:700;color:{T3};padding:0 10px 8px;letter-spacing:.02em">{title}</div><div style="display:flex;flex-direction:column;gap:2px">{r}</div></div>'
    inner = f"""{sidebar("歷史")}{toolbar("歷史", search="搜尋歷史…")}{window_top()}
    <div style="position:absolute;left:260px;right:32px;top:72px;display:flex;flex-direction:column;gap:18px">
      <div class="row" style="justify-content:space-between"><span style="font-size:26px;font-weight:700;letter-spacing:-0.01em">觀看歷史</span><span class="row" style="gap:8px"><span class="seg"><span class="on">全部</span><span>進行中</span><span>已完成</span></span><span class="btn sec" style="padding:6px 12px;font-size:12px;color:#f87171">{ic("trash", 14)}刪除 2 項</span></span></div>
      {bucket("今天", [("尖帽子的魔法工房", "EP 1 · 魔法的開端", .71, "14:22", True), ("葬送的芙莉莲", "EP 12", .35, "09:10", True)])}
      {bucket("昨天", [("药屋少女的呢喃", "EP 4", .12, "23:40", False), ("迷宫饭", "EP 9", .9, "21:05", False), ("异兽魔都", "EP 3", 1.0, "19:30", False)])}
      {bucket("本週", [("黄泉使者", "EP 2", 1.0, "週一", False)])}
    </div>"""
    return doc(wrap(inner))


def ab_libraries() -> str:
    def lib(name: str, path: str, kind: str, files: int, used: str, pct: int, scanning: bool = False, online: bool = True) -> str:
        prog = (f'<div class="row" style="gap:10px;margin-top:10px;font-size:11px;color:{ACCENT}"><span style="width:12px;height:12px;border:2px solid {ACCENT};border-right-color:transparent;border-radius:50%"></span>掃描中 · 已 hash 128 / 312 · 匹配 96 <span style="color:{T3}">· Sousou no Frieren S01E12.mkv</span></div>'
                if scanning else f'<div style="font-size:11px;color:{T3};margin-top:10px">上次掃描 2 小時前 · 每 60 分鐘自動掃描 · 自動重新命名 開</div>')
        return f"""<div class="card" style="padding:16px 18px;display:flex;gap:16px;align-items:flex-start">
          <span style="width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;color:{T2};flex-shrink:0">{ic("folder", 20)}</span>
          <div style="flex:1;min-width:0">
            <div class="row" style="gap:8px"><span style="font-size:15px;font-weight:700;color:#fff">{name}</span><span class="chip" style="font-size:10px;padding:2px 7px;border-radius:4px">{kind}</span><span class="row" style="gap:4px;font-size:11px;color:{"#4ade80" if online else "#f87171"}"><span style="width:6px;height:6px;border-radius:50%;background:{"#22c55e" if online else "#ef4444"}"></span>{"連線中" if online else "離線"}</span>
              <span style="flex:1"></span><span style="font-size:20px;font-weight:700;color:#fff">{files}</span><span style="font-size:11px;color:{T3}">檔案</span><span class="tb-btn">{ic("chevr", 16, 2)}</span></div>
            <div style="font-size:12px;color:{T3};font-family:Menlo, monospace;margin-top:2px">{path}</div>
            <div class="row" style="gap:10px;margin-top:10px"><span style="flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,.08)"><span style="display:block;height:100%;width:{pct}%;background:{ACCENT};border-radius:2px"></span></span><span style="font-size:11px;color:{T3};font-variant-numeric:tabular-nums">{used}</span></div>
            {prog}
          </div></div>"""
    recent = "".join(poster(n, 120, 180, cnt=f"{c} 集") for n, c in [("尖帽子的魔法工房", 13), ("异兽魔都", 12), ("葬送的芙莉莲", 28), ("迷宫饭", 24)])
    inner = f"""{sidebar("媒體庫")}{toolbar("媒體庫")}{window_top()}
    <div style="position:absolute;left:260px;right:32px;top:72px;display:flex;flex-direction:column;gap:22px">
      <div class="row" style="justify-content:space-between"><div><div style="font-size:26px;font-weight:700;letter-spacing:-0.01em">我的媒體庫</div><div class="row" style="gap:8px;font-size:12px;color:{T3};margin-top:4px">3 媒體庫 <span style="color:{T4}">·</span> 318 檔案 <span style="color:{T4}">·</span> 1.2 TB <span style="color:{T4}">·</span> <span style="color:#4ade80;font-weight:600">97% 已匹配</span> <span style="color:{T4}">·</span> <span style="color:#fbbf24">9 未匹配</span></div></div>
        <span class="row" style="gap:8px"><span class="btn sec">{ic("refresh", 14)}全部掃描</span><span class="btn pri">{ic("plus", 14, 2)}新增媒體庫</span></span></div>
      <div><div style="font-size:13px;font-weight:700;color:{T2};margin-bottom:10px">最近匹配</div><div style="display:flex;gap:12px">{recent}</div></div>
      <div style="display:flex;flex-direction:column;gap:10px">
        {lib("Milmil", "/Volumes/Sandisk 250GB/Milmil", "本機", 6, "10.9 GB / 232.9 GB · 5%", 5)}
        {lib("NAS Anime", "smb://nas.home.arpa/media/anime", "SMB", 312, "1.2 TB / 4 TB · 30%", 30, scanning=True)}
        {lib("Seedbox", "sftp://seed.example.net/downloads/anime", "SFTP", 0, "—", 0, online=False)}
      </div>
      <div class="card" style="padding:12px 16px;display:flex;align-items:center;gap:12px;background:rgba(167,139,250,.06)"><span style="color:{ACCENT}">{ic("sparkle", 16)}</span><span style="font-size:12px;color:{T2}">桌面端可直接開啟已掛載的路徑播放：設定 › 播放器 › 本機路徑對應（/media/anime → /Volumes/anime）</span><span style="flex:1"></span><span style="font-size:12px;font-weight:600;color:{ACCENT}">設定對應 →</span></div>
    </div>"""
    return doc(wrap(inner))


def ab_library_detail() -> str:
    cols = [("檔名", 420), ("匹配作品", 220), ("集", 50), ("狀態", 90), ("字幕", 50), ("大小", 80), ("", 120)]
    head = "".join(f'<span style="width:{w}px;font-size:11px;font-weight:700;color:{T3};{"flex:1" if n == "檔名" else ""}">{n}</span>' for n, w in cols)
    rows_data = [
        ("[Sakurato] Tongari Boushi no Atelier [01][AVC-8bit 1080p AAC][CHT].mp4", "尖帽子的魔法工房", "1", "自動", 1, "1.4 GB", False),
        ("[Sakurato] Tongari Boushi no Atelier [02][AVC-8bit 1080p AAC][CHT].mp4", "尖帽子的魔法工房", "2", "自動", 1, "1.4 GB", False),
        ("[ANi] Dorohedoro - 03 [1080P][Baha][WEB-DL][AAC AVC][CHT].mp4", "异兽魔都", "3", "手動", 0, "612 MB", True),
        ("[SubsPlease] Sousou no Frieren - 12 (1080p) [A1B2C3D4].mkv", "葬送的芙莉莲", "12", "自動", 2, "1.1 GB", False),
        ("[Erai-raws] Kusuriya no Hitorigoto S2 - 04 [1080p][Multiple Subtitle].mkv", "药屋少女的呢喃", "4", "自動", 5, "1.3 GB", False),
        ("Dungeon.Meshi.S01E09.1080p.WEB.H264-EXTRAS.mkv", "迷宫饭", "9", "自動", 0, "890 MB", False),
        ("tongari_boushi_13_raw_final_v2.mkv", "—", "—", "未匹配", 0, "1.6 GB", False),
        ("夏日重现 06 [BD 1080p HEVC].mkv", "—", "—", "未匹配", 1, "2.1 GB", False),
    ]
    rows = ""
    for i, (f, a, e, s, c, size, sel) in enumerate(rows_data):
        sc = {"自動": ("rgba(34,197,94,.12)", "#4ade80"), "手動": ("rgba(56,189,248,.12)", "#7dd3fc"), "未匹配": ("rgba(251,191,36,.12)", "#fbbf24")}[s]
        act = (f'<span class="btn sec" style="padding:4px 10px;font-size:11px">{ic("search", 12)}匹配</span>' if s == "未匹配"
               else f'<span class="row" style="gap:2px"><span class="tb-btn">{ic("play", 14)}</span><span class="tb-btn">{ic("info", 14)}</span><span class="tb-btn">{ic("more", 14)}</span></span>')
        rows += (f'<div class="row" style="gap:12px;height:44px;padding:0 12px;border-radius:6px;background:{"rgba(167,139,250,.2)" if sel else ("rgba(255,255,255,.03)" if i % 2 else "transparent")}">'
                 f'<span style="flex:1;min-width:0;font-size:12px;color:{T1};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:Menlo, monospace">{f}</span>'
                 f'<span style="width:220px;font-size:12px;font-weight:600;color:{"#fff" if a != "—" else T4}">{a}</span>'
                 f'<span style="width:50px;font-size:12px;color:{T2};font-variant-numeric:tabular-nums">{e}</span>'
                 f'<span style="width:90px"><span class="chip" style="font-size:10px;padding:2px 7px;border-radius:4px;background:{sc[0]};color:{sc[1]}">{s}</span></span>'
                 f'<span style="width:50px;font-size:12px;color:{T2}">{c}</span><span style="width:80px;font-size:12px;color:{T2};font-variant-numeric:tabular-nums">{size}</span>'
                 f'<span style="width:120px;display:flex;justify-content:flex-end">{act}</span></div>')
    inner = f"""{sidebar("媒體庫")}{toolbar("NAS Anime", search="在此媒體庫搜尋檔案…")}{window_top()}
    <div style="position:absolute;left:260px;right:32px;top:72px;display:flex;flex-direction:column;gap:16px">
      <div class="row" style="justify-content:space-between"><div><div class="row" style="gap:10px"><span style="font-size:26px;font-weight:700;letter-spacing:-0.01em">NAS Anime</span><span class="chip" style="font-size:10px;padding:2px 7px;border-radius:4px">SMB</span></div><div style="font-size:12px;color:{T3};font-family:Menlo, monospace;margin-top:2px">smb://nas.home.arpa/media/anime</div></div>
        <span class="row" style="gap:8px"><span class="btn sec">{ic("refresh", 14)}掃描</span><span class="btn sec">{ic("sparkle", 14)}重新匹配全部</span><span class="btn sec">{ic("film", 14)}重複檔案 <span class="kbd">3</span></span><span class="btn sec">{ic("gear", 14)}</span></span></div>
      <div class="tabs"><span class="on">檔案 312</span><span>作品 28</span><span>缺集 4</span><span>重新命名</span><span>掃描記錄</span></div>
      <div class="row" style="gap:8px"><span class="seg"><span class="on">全部 312</span><span>已匹配 303</span><span>未匹配 9</span></span><span style="flex:1"></span><span style="font-size:12px;color:{T3}">已選 1</span><span class="btn sec" style="padding:6px 12px;font-size:12px">批次匹配</span><span class="btn sec" style="padding:6px 12px;font-size:12px">取消匹配</span></div>
      <div class="card" style="overflow:hidden"><div class="row" style="gap:12px;height:36px;padding:0 12px;border-bottom:1px solid rgba(255,255,255,.06)">{head}</div>{rows}
        <div class="row" style="justify-content:space-between;padding:10px 12px;font-size:11px;color:{T3}"><span>顯示 1–50 / 312</span><span class="row" style="gap:6px"><span class="kbd">‹</span><span class="kbd" style="color:#fff">1</span><span class="kbd">2</span><span class="kbd">3</span><span class="kbd">…</span><span class="kbd">7</span><span class="kbd">›</span></span></div></div>
    </div>"""
    return doc(wrap(inner))


def ab_match_sheet() -> str:
    w, h = 720, 560
    def res(n: str, meta: str, on: bool = False) -> str:
        return (f'<div class="row" style="gap:12px;padding:8px 10px;border-radius:8px;background:{"rgba(167,139,250,.12)" if on else "transparent"};{"box-shadow:inset 0 0 0 1px rgba(167,139,250,.4)" if on else ""}">'
                f'<div style="width:40px;height:56px;border-radius:4px;background:{anime_gradient(n)}"></div><div style="flex:1"><div style="font-size:13px;font-weight:600;color:#fff">{n}</div><div style="font-size:11px;color:{T3}">{meta}</div></div>{ic("check", 16, 2.5, ACCENT) if on else ""}</div>')
    eps = "".join(f'<span class="chip{" on" if i == 12 else ""}" style="font-size:11px;min-width:34px;justify-content:center">{i + 1}</span>' for i in range(13))
    inner = f"""
    <div style="position:absolute;inset:0;background:{SURFACE};display:flex;flex-direction:column">
      <div class="row" style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.06);gap:12px"><div><div style="font-size:15px;font-weight:700;color:#fff">匹配檔案</div><div style="font-size:11px;color:{T3};font-family:Menlo, monospace;margin-top:2px">tongari_boushi_13_raw_final_v2.mkv · 1.6 GB · 23:58</div></div><span style="flex:1"></span><span class="seg"><span class="on">1 作品</span><span>2 集數</span></span></div>
      <div style="display:flex;flex:1;min-height:0">
        <div style="flex:1;padding:14px 16px;display:flex;flex-direction:column;gap:10px;border-right:1px solid rgba(255,255,255,.06)">
          <div class="field" style="height:32px;color:{T1}">{ic("search", 14)}Tongari Boushi</div>
          <div style="font-size:11px;color:{T3}">DandanPlay 以檔案 hash 建議：<span style="color:#fff;font-weight:600">尖帽子的魔法工房 第13話</span>（信心 92%）</div>
          {res("尖帽子的魔法工房", "2026 · TV · 13 集 · Bangumi 501234", on=True)}{res("とんがり帽子のアトリエ (漫画)", "2016 · 漫畫")}{res("尖帽子的魔法工房 特別篇", "2027 · OVA · 2 集")}
        </div>
        <div style="width:320px;padding:14px 16px;display:flex;flex-direction:column;gap:10px">
          <div class="row" style="gap:10px"><div style="width:44px;height:62px;border-radius:4px;background:{anime_gradient("尖帽子的魔法工房")}"></div><div><div style="font-size:13px;font-weight:700;color:#fff">尖帽子的魔法工房</div><div style="font-size:11px;color:{T3}">選擇集數</div></div></div>
          <div class="row" style="gap:6px;flex-wrap:wrap">{eps}</div>
          <div class="card" style="padding:10px 12px;font-size:12px;color:{T2}"><div style="font-weight:700;color:#fff;margin-bottom:4px">第 13 集 · 魔法使之路</div>2026-07-05 播出 · 目前無其他檔案</div>
          <div class="row" style="gap:8px;font-size:12px;color:{T2}"><span class="toggle on"><i></i></span>套用後重新命名為範本格式</div>
        </div>
      </div>
      <div class="row" style="padding:12px 20px;border-top:1px solid rgba(255,255,255,.06);gap:8px;justify-content:flex-end"><span style="font-size:11px;color:{T3};margin-right:auto">可在 設定 › 稽核 撤銷</span><span class="btn sec">取消</span><span class="btn acc">確認匹配</span></div>
    </div>"""
    return doc(f'<div style="width:{w}px;height:{h}px;border-radius:12px;overflow:hidden;position:relative;box-shadow:0 0 0 1px rgba(255,255,255,.12), 0 30px 60px rgba(0,0,0,.7)">{inner}</div>')


def ab_downloads() -> str:
    def group(n: str, sub: str, rows: list[tuple[str, str, int, str, str]]) -> str:
        r = ""
        for e, f, p, sp, st in rows:
            col = {"下載中": ACCENT, "完成": "#4ade80", "排隊": T3, "做種": "#7dd3fc"}[st]
            r += (f'<div class="row" style="gap:12px;padding:8px 12px;border-top:1px solid rgba(255,255,255,.04)">'
                  f'<span style="font-size:12px;font-weight:700;color:{T2};width:40px">{e}</span>'
                  f'<span style="flex:1;min-width:0;font-size:12px;color:{T1};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:Menlo, monospace">{f}</span>'
                  f'<span style="width:160px;height:4px;border-radius:2px;background:rgba(255,255,255,.08)"><span style="display:block;height:100%;width:{p}%;background:{col};border-radius:2px"></span></span>'
                  f'<span style="width:70px;font-size:11px;color:{T3};font-variant-numeric:tabular-nums;text-align:right">{sp}</span>'
                  f'<span style="width:50px;font-size:11px;font-weight:600;color:{col}">{st}</span>'
                  f'<span class="row" style="gap:2px"><span class="tb-btn">{ic("pause" if st == "下載中" else "play", 14)}</span><span class="tb-btn">{ic("more", 14)}</span></span></div>')
        return (f'<div class="card" style="overflow:hidden"><div class="row" style="gap:12px;padding:12px">'
                f'<div style="width:44px;height:62px;border-radius:4px;background:{anime_gradient(n)}"></div><div style="flex:1"><div style="font-size:14px;font-weight:700;color:#fff">{n}</div><div style="font-size:11px;color:{T3};margin-top:2px">{sub}</div></div>'
                f'<span class="chip" style="font-size:10px;padding:2px 7px">{ic("rss", 11)}RSS 規則</span><span class="tb-btn">{ic("chevd", 16, 2)}</span></div>{r}</div>')
    g1 = group("葬送的芙莉莲", "Mikan · SubsPlease · 1080p · 媒體庫 NAS Anime", [
        ("EP 13", "[SubsPlease] Sousou no Frieren - 13 (1080p) [F1E2D3C4].mkv", 64, "12.4 MB/s", "下載中"),
        ("EP 14", "[SubsPlease] Sousou no Frieren - 14 (1080p) [A9B8C7D6].mkv", 0, "—", "排隊"),
        ("EP 12", "[SubsPlease] Sousou no Frieren - 12 (1080p) [A1B2C3D4].mkv", 100, "—", "做種")])
    g2 = group("药屋少女的呢喃", "Nyaa · Erai-raws · 1080p 多字幕", [
        ("EP 05", "[Erai-raws] Kusuriya no Hitorigoto S2 - 05 [1080p][Multiple Subtitle].mkv", 100, "—", "完成")])
    feeds = "".join(f'<div class="row" style="gap:10px;padding:8px 10px;border-radius:8px"><span style="color:{"#4ade80" if ok else "#fbbf24"}">{ic("rss", 14)}</span><div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;color:#fff">{n}</div><div style="font-size:10px;color:{T3}">{m}</div></div><span class="toggle on" style="width:28px;height:16px"><i style="width:12px;height:12px;left:14px"></i></span></div>'
                    for n, m, ok in [("Mikan · 葬送的芙莉莲 (SubsPlease)", "30 分鐘前更新 · 2 規則", True), ("Nyaa · Erai-raws 綜合", "1 小時前 · 1 規則", True), ("DMHY · 全站", "抓取失敗 · 3 小時前", False)])
    inner = f"""{sidebar("下載")}{toolbar("下載", search="搜尋種子 (Mikan / Nyaa / DMHY…)")}{window_top()}
    <div style="position:absolute;left:260px;right:32px;top:72px;display:flex;gap:24px">
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:16px">
        <div class="row" style="justify-content:space-between"><div><div style="font-size:26px;font-weight:700;letter-spacing:-0.01em">下載</div><div class="row" style="gap:8px;font-size:12px;color:{T3};margin-top:4px">{ic("download", 12)}12.4 MB/s <span style="color:{T4}">·</span> {ic("wifi", 12)}內建 torrent 引擎 · 連線 48 <span style="color:{T4}">·</span> 2 進行中 · 1 排隊</div></div>
          <span class="row" style="gap:8px"><span class="btn sec">{ic("magnet", 14)}新增連結</span><span class="btn pri">{ic("search", 14, 2)}搜尋種子</span></span></div>
        <div class="tabs"><span class="on">下載中 3</span><span>已完成 128</span><span>訂閱 12</span></div>
        {g1}{g2}
        <div style="border:1px dashed rgba(255,255,255,.12);border-radius:12px;padding:18px;text-align:center;font-size:12px;color:{T3}">把 .torrent 或 magnet 連結拖到這裡、視窗或 Dock 圖示即可新增</div>
      </div>
      <div style="width:320px;flex-shrink:0;display:flex;flex-direction:column;gap:12px">
        <div class="card" style="padding:12px"><div class="row" style="justify-content:space-between;margin-bottom:6px"><span style="font-size:13px;font-weight:700;color:#fff">RSS 訂閱</span><span class="tb-btn">{ic("plus", 14, 2)}</span></div>{feeds}</div>
        <div class="card" style="padding:12px;display:flex;flex-direction:column;gap:8px"><span style="font-size:13px;font-weight:700;color:#fff">缺集</span><div style="font-size:12px;color:{T2}">黄泉使者 缺 EP 5–8 · <span style="color:{ACCENT};font-weight:600">一鍵搜尋 →</span></div><div style="font-size:12px;color:{T2}">夏日重现 缺 EP 7 · <span style="color:{ACCENT};font-weight:600">一鍵搜尋 →</span></div></div>
      </div>
    </div>"""
    return doc(wrap(inner))


def ab_notifications() -> str:
    w, h = 420, 560
    def n(icon: str, title: str, body: str, t: str, unread: bool, col: str) -> str:
        return (f'<div class="row" style="gap:12px;padding:10px 12px;border-radius:10px;background:{"rgba(255,255,255,.03)" if unread else "transparent"};align-items:flex-start">'
                f'<span style="width:32px;height:32px;border-radius:8px;background:{col}22;color:{col};display:flex;align-items:center;justify-content:center;flex-shrink:0">{ic(icon, 16)}</span>'
                f'<div style="flex:1;min-width:0"><div class="row" style="gap:6px"><span style="font-size:13px;font-weight:600;color:#fff">{title}</span>{"<span style=width:6px;height:6px;border-radius:50%;background:" + ACCENT + "></span>" if unread else ""}<span style="margin-left:auto;font-size:11px;color:{T3}">{t}</span></div>'
                f'<div style="font-size:12px;color:{T2};margin-top:2px;line-height:1.45">{body}</div></div></div>')
    inner = f"""
    <div class="glass" style="position:absolute;inset:0;border-radius:14px;display:flex;flex-direction:column;overflow:hidden">
      <div class="row" style="padding:14px 16px;gap:10px;border-bottom:1px solid rgba(255,255,255,.06)"><span style="font-size:15px;font-weight:700;color:#fff">通知</span><span class="chip" style="font-size:10px;padding:2px 7px">12 未讀</span><span style="flex:1"></span><span style="font-size:12px;color:{ACCENT};font-weight:600">全部標為已讀</span></div>
      <div class="row" style="padding:10px 12px;gap:6px"><span class="seg"><span class="on">全部</span><span>下載</span><span>媒體庫</span><span>系統</span></span></div>
      <div style="padding:0 8px;display:flex;flex-direction:column;gap:2px">
        {n("download", "下載完成", "葬送的芙莉莲 EP 13 · 已移入 NAS Anime，已匹配。", "剛剛", True, "#4ade80")}
        {n("folder", "掃描完成", "NAS Anime · 新增 3 檔案，2 已自動匹配，1 未匹配。", "12 分鐘前", True, ACCENT)}
        {n("calendar", "今天播出", "黄泉使者 EP 5 · 21:55 JST（本地 20:55）", "1 小時前", True, "#7dd3fc")}
        {n("download", "下載失敗", "DMHY feed 抓取失敗：timeout。將於 30 分鐘後重試。", "3 小時前", False, "#f87171")}
        {n("sparkle", "有新版本", "milmil 0.1.18 已發佈 · 檢視更新內容", "昨天", False, "#fbbf24")}
        {n("refresh", "AniList 已同步", "推送 4 筆進度、拉取 2 筆變更。", "昨天", False, T2)}
      </div>
      <div class="row" style="margin-top:auto;padding:10px 16px;border-top:1px solid rgba(255,255,255,.06);font-size:11px;color:{T3};gap:8px">{ic("bell", 12)}系統通知：下載完成、掃描完成、今天播出 <span style="margin-left:auto;color:{ACCENT};font-weight:600">通知設定</span></div>
    </div>"""
    return doc(f'<div style="width:{w}px;height:{h}px;position:relative">{inner}</div>')


def settings_shell(tab: str, title: str, subtitle: str, content: str, w: int = 980, h: int = 680) -> str:
    tabs = ["一般", "伺服器", "播放器", "彈幕", "字幕", "快捷鍵", "整合", "通知", "下載", "帳號", "關於"]
    icons = ["gear", "server", "play", "danmaku", "cc", "keyboard", "link", "bell", "download", "dot", "info"]
    side = "".join(f'<div class="side-item{" on" if t == tab else ""}" style="height:28px">{ic(i, 15, 1.7)}<span>{t}</span></div>' for t, i in zip(tabs, icons))
    inner = f"""
    <div style="position:absolute;inset:0;background:{BG};display:flex">
      <div style="width:200px;flex-shrink:0;padding:48px 10px 14px;background:rgba(255,255,255,.025);border-right:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;gap:2px"><div class="field" style="height:26px;margin:0 0 8px">{ic("search", 12)}搜尋設定</div>{side}</div>
      <div style="flex:1;min-width:0;padding:44px 28px 24px;overflow:hidden;display:flex;flex-direction:column;gap:16px"><div><div style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.01em">{title}</div><div style="font-size:12px;color:{T3};margin-top:2px">{subtitle}</div></div>{content}</div>
    </div>
    <div style="position:absolute;left:0;top:0;right:0;height:44px;display:flex;align-items:center;padding:0 16px;pointer-events:none">{lights()}<div style="flex:1;text-align:center;font-size:13px;font-weight:600;color:{T2}">設定</div></div>"""
    return doc(f'<div class="win" style="width:{w}px;height:{h}px;background-image:none">{inner}</div>')


def ab_settings() -> str:
    w, h = 980, 680
    tabs = ["一般", "伺服器", "播放器", "彈幕", "字幕", "快捷鍵", "整合", "通知", "下載", "帳號", "關於"]
    icons = ["gear", "server", "play", "danmaku", "cc", "keyboard", "link", "bell", "download", "dot", "info"]
    side = "".join(f'<div class="side-item{" on" if t == "彈幕" else ""}" style="height:28px">{ic(i, 15, 1.7)}<span>{t}</span></div>' for t, i in zip(tabs, icons))

    def row(label: str, control: str, hint: str = "") -> str:
        return (f'<div class="row" style="gap:16px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.05)"><div style="width:200px"><div style="font-size:13px;color:{T1}">{label}</div>{"<div style=font-size:11px;color:" + T3 + ";margin-top:2px>" + hint + "</div>" if hint else ""}</div><div style="flex:1;display:flex;justify-content:flex-end;align-items:center;gap:10px">{control}</div></div>')

    def sl(pct: int, val: str) -> str:
        return f'<span class="slider" style="max-width:220px"><i style="width:{pct}%"></i><b style="left:{pct}%"></b></span><span style="font-size:12px;color:{T2};width:44px;text-align:right;font-variant-numeric:tabular-nums">{val}</span>'

    def grp(title: str, rows: str) -> str:
        return f'<div><div style="font-size:11px;font-weight:700;color:{T3};letter-spacing:.04em;margin-bottom:4px">{title}</div><div class="card" style="padding:2px 16px">{rows}</div></div>'

    preview = (f'<div style="height:96px;border-radius:10px;background:linear-gradient(135deg, oklch(30% 0.06 60), oklch(20% 0.05 300));position:relative;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)">'
               f'<span class="dm" style="left:16px;top:14px;font-size:20px;color:#fff">即時預覽 — 設定改動立即反映</span><span class="dm" style="left:420px;top:40px;font-size:20px;color:#fde68a">あいうえお</span><span class="dm" style="left:120px;top:64px;font-size:20px;color:#67e8f9">第一集已經跪低</span>'
               f'<div style="position:absolute;left:0;right:0;bottom:0;height:14%;background:repeating-linear-gradient(90deg, rgba(255,255,255,.06) 0 2px, transparent 2px 8px)" title="字幕區（避開）"></div></div>')
    content = f"""
    <div style="display:flex;flex-direction:column;gap:18px">
      {preview}
      {grp("顯示", row("啟用彈幕", '<span class="toggle on"><i></i></span>', "快捷鍵 D") + row("透明度", sl(85, "85%")) + row("字體大小", sl(40, "20")) + row("速度", sl(50, "144 px/s")) + row("顯示區域", '<span class="seg"><span>¼</span><span>½</span><span class="on">¾</span><span>全部</span></span>') + row("密度", '<span class="seg"><span>低</span><span class="on">中</span><span>高</span><span>無限</span></span>', "每 6 秒視窗上限 20 / 50 / 80"))}
      {grp("樣式", row("字體", '<span class="field" style="height:28px;color:' + T1 + '">PingFang TC ' + ic("chevd", 12, 2) + '</span>') + row("粗體", '<span class="toggle on"><i></i></span>') + row("描邊", '<span class="seg"><span>無</span><span>陰影</span><span class="on">描邊</span></span>') + row("覆寫顏色", '<span style="font-size:12px;color:' + T3 + '">依來源</span><span class="toggle"><i></i></span>'))}
      {grp("過濾", row("類型", '<span class="chip on" style="font-size:11px">滾動</span><span class="chip on" style="font-size:11px">頂部</span><span class="chip" style="font-size:11px">底部</span>') + row("避開字幕區", '<span class="toggle on"><i></i></span>', "顯示區域上限 85%") + row("繁簡轉換", '<span class="seg"><span>關</span><span class="on">簡→繁</span><span>繁→簡</span></span>', "OpenCC 詞級轉換") + row("封鎖詞", '<span class="chip" style="font-size:11px">劇透</span><span class="chip" style="font-size:11px">/前排.*/</span><span class="chip" style="font-size:11px">xswl</span><span class="btn sec" style="padding:4px 10px;font-size:11px">編輯…</span>'))}
    </div>"""
    return settings_shell("彈幕", "彈幕", "與 web 共用同一組設定（/user/preferences），任一端修改兩邊同步。", content, w, h)


def ab_keyboard() -> str:
    w, h = 980, 680
    tabs = ["一般", "伺服器", "播放器", "彈幕", "字幕", "快捷鍵", "整合", "通知", "下載", "帳號", "關於"]
    icons = ["gear", "server", "play", "danmaku", "cc", "keyboard", "link", "bell", "download", "dot", "info"]
    side = "".join(f'<div class="side-item{" on" if t == "快捷鍵" else ""}" style="height:28px">{ic(i, 15, 1.7)}<span>{t}</span></div>' for t, i in zip(tabs, icons))
    groups = [
        ("播放", [("播放 / 暫停", "Space"), ("快轉 ±5 秒", "← →"), ("快轉 ±30 秒", "⇧← ⇧→"), ("逐幀", ", ."), ("倍速 ∓0.25", "[ ]"), ("重置倍速", "⌫"), ("A-B 循環", "L"), ("下一集", "N"), ("跳過 OP / ED", "S")]),
        ("彈幕", [("開關彈幕", "D"), ("彈幕設定", "⇧D"), ("發送彈幕", "⌘↩")]),
        ("字幕 / 音訊", [("字幕開關", "C"), ("下一字幕軌", "V"), ("字幕延遲 ∓0.1s", "Z X"), ("音量 ±5%", "↑ ↓"), ("靜音", "M")]),
        ("視窗", [("全螢幕", "F"), ("Mini 播放器", "P"), ("側欄 (theater)", "T"), ("截圖", "⌘⇧S"), ("快捷鍵說明", "?")]),
    ]
    body = ""
    for g, items in groups:
        rows = ""
        for i, (a, k) in enumerate(items):
            conflict = a == "跳過 OP / ED"
            keys = "".join(f'<span class="kbd" style="font-size:11px;padding:3px 7px;{"box-shadow:inset 0 0 0 1px #f87171;color:#fca5a5" if conflict else ""}">{p}</span>' for p in k.split(" "))
            rows += (f'<div class="row" style="gap:12px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05)"><span style="font-size:13px;color:{T1};flex:1">{a}</span>'
                     + (f'<span style="font-size:11px;color:#fca5a5">與「截圖」衝突</span>' if conflict else "") + f'<span class="row" style="gap:4px">{keys}</span><span class="tb-btn">{ic("more", 14)}</span></div>')
        body += f'<div><div style="font-size:11px;font-weight:700;color:{T3};letter-spacing:.04em;margin-bottom:4px">{g}</div><div class="card" style="padding:2px 16px">{rows}</div></div>'
    content = (f'<div class="row" style="justify-content:flex-end;gap:8px"><span class="seg"><span class="on">milmil 預設</span><span>mpv</span><span>IINA</span></span><span class="btn sec">重置</span></div>'
               f'<div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:14px 20px">{body}</div>')
    return settings_shell("快捷鍵", "快捷鍵", "預設 = web 的 YouTube + mpv 混合表；重綁後同步到 web。點擊按鍵欄即可重新錄製。", content, w, h)


# ---------------------------------------------------------------- canvas layout
ARTBOARDS = {
    "Main": (ab_home_main, 1440, 900),
    "Login": (ab_login, 1440, 900),
    "AnimeDetail": (ab_detail, 1440, 900),
    "Schedule": (ab_schedule, 1440, 900),
    "Discover": (ab_discover, 1440, 900),
    "Search": (ab_search, 1440, 900),
    "CommandPalette": (ab_palette, 720, 560),
    "Player": (lambda: ab_player("集數", osd=ic("volume", 14) + "音量 65%"), 1440, 900),
    "PlayerDanmaku": (lambda: ab_player("彈幕", popover=True, skip=False, peek=False), 1440, 900),
    "PlayerSources": (lambda: ab_player("來源", skip=False, peek=False), 1440, 900),
    "PlayerNextUp": (ab_player_end, 1080, 640),
    "MiniPlayer": (ab_mini, 480, 270),
    "Collection": (ab_collection, 1440, 900),
    "History": (ab_history, 1440, 900),
    "Libraries": (ab_libraries, 1440, 900),
    "LibraryDetail": (ab_library_detail, 1440, 900),
    "MatchSheet": (ab_match_sheet, 720, 560),
    "Downloads": (ab_downloads, 1440, 900),
    "Notifications": (ab_notifications, 420, 560),
    "SettingsDanmaku": (ab_settings, 980, 680),
    "SettingsKeyboard": (ab_keyboard, 980, 680),
}

ROWS = [  # (page, [names])
    ("page-browse", ["Login", "Main", "AnimeDetail"]),
    ("page-browse", ["Schedule", "Discover", "Search", "CommandPalette"]),
    ("page-player", ["Player", "PlayerDanmaku", "PlayerSources"]),
    ("page-player", ["PlayerNextUp", "MiniPlayer"]),
    ("page-manage", ["Collection", "History", "Libraries"]),
    ("page-manage", ["LibraryDetail", "MatchSheet", "Downloads", "Notifications"]),
    ("page-manage", ["SettingsDanmaku", "SettingsKeyboard"]),
]

NOTES = {
    "page-browse": [("n-shell", 0, -260, 360, "Shell：左側 Apple TV 式 sidebar（可用 Main 上方的 tweak 切到 web 的 80px icon rail 比較）。工具列：返回/前進、頁名、⌘K 搜尋、通知。背景沿用 web 的 BannerImage 多層 gradient。"),
                    ("n-hero", 1520, -260, 360, "Home：Hero 主按鈕改為「播放」（Apple TV），指標停留 1 秒才自動預告。繼續睇 shelf 第一張示範 hover 狀態（▶ + ⋯ 選單：移除 / 標記已看）。")],
    "page-player": [("n-player", 0, -260, 420, "Player：mpv 畫面 + 原生 Core Animation 彈幕層 + 毛玻璃 floating OSC（seek bar 有 OP/ED 區段標記與縮圖 peek）。右側 inspector 六個 tab，T 收起 = theater。三張分別展示 集數 / 彈幕列表+設定 popover / 來源匯入。"),
                    ("n-next", 0, 1100, 360, "Post-play：結束前 30 秒出現下一集卡，10 秒倒數，Play Now / 取消。Mini：always-on-top 浮窗，hover 才顯示控制，彈幕照常。")],
    "page-manage": [("n-manage", 0, -260, 380, "管理頁 v1 全原生：媒體庫（掃描進度來自 WS）、檔案表（Table，可排序/篩選/批次）、匹配 sheet 兩步（作品 → 集數，DandanPlay hash 建議）、下載（分組卡 + RSS 側欄 + 拖放區）。設定用 macOS Settings 視窗（⌘,），彈幕頁有即時預覽。")],
}


def main() -> None:
    pages = [{"id": "page-browse", "name": "瀏覽"}, {"id": "page-player", "name": "播放器 + 彈幕"}, {"id": "page-manage", "name": "管理 + 設定"}]
    boards = []
    y_by_page: dict[str, int] = {}
    for page, names in ROWS:
        y = y_by_page.get(page, 0)
        x = 0
        row_h = 0
        for n in names:
            fn, w, h = ARTBOARDS[n]
            with open(os.path.join(OUT, f"{n}.dc.html"), "w", encoding="utf-8") as f:
                f.write(fn())
            boards.append({"file": f"{n}.dc.html", "x": x, "y": y, "w": w, "h": h, "page": page})
            x += w + 100
            row_h = max(row_h, h)
        y_by_page[page] = y + row_h + 160
    ann = [{"id": i, "x": x, "y": y, "w": w, "text": t, "page": p} for p, notes in NOTES.items() for i, x, y, w, t in notes]
    canvas = {"artboards": boards, "pages": pages, "annotations": ann, "launch": {"view": "canvas", "page": "page-browse"}}
    with open(os.path.join(OUT, "canvas.json"), "w", encoding="utf-8") as f:
        json.dump(canvas, f, ensure_ascii=False, indent=2)
    print(f"wrote {len(boards)} artboards + canvas.json")


if __name__ == "__main__":
    main()
