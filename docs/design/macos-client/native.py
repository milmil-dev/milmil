#!/usr/bin/env python3
"""macOS-native restyle (macOS 26 / Apple TV app language) applied on top of gen.py + gen2.py.

gen2.py calls `native.apply(gen, globals())` right before main() so every artboard —
first and second batch — is rendered with these primitives instead of the web-flavoured ones:
SF Pro, floating glass sidebar, capsule buttons / segmented controls, popup indicators,
System-Settings style settings window, alternating table rows.
"""
from __future__ import annotations

import gen

# ---------------------------------------------------------------- tokens (Apple TV app, dark)
BG = "#141416"
SURFACE = "#1c1c1e"
ACCENT = "#a78bfa"
T1 = "rgba(255,255,255,0.92)"
T2 = "rgba(255,255,255,0.62)"
T3 = "rgba(255,255,255,0.42)"
T4 = "rgba(255,255,255,0.22)"
FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', system-ui, 'PingFang TC', 'Hiragino Sans', 'Noto Sans TC', sans-serif"
GFONTS = "https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap"
GLASS = "rgba(255,255,255,0.07)"
GLASS_EDGE = "inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 1px 0 rgba(255,255,255,0.10)"


def base_css() -> str:
    return f"""
    @import url('{GFONTS}');
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; background: #2a2a2e; font-family: {FONT}; color: {T1}; -webkit-font-smoothing: antialiased; font-size: 13px; }}
    a {{ color: {ACCENT}; text-decoration: none; }} a:hover {{ color: #c4b5fd; }}
    .win {{ position: relative; overflow: hidden; background: {BG}; border-radius: 12px;
            box-shadow: 0 0 0 1px rgba(255,255,255,0.14), 0 30px 80px rgba(0,0,0,0.6);
            background-image:
              radial-gradient(ellipse 700px 500px at 10% 0%, rgba(167,139,250,0.10), transparent),
              radial-gradient(ellipse 600px 400px at 90% 0%, oklch(0.45 0.12 300 / 0.07), transparent); }}
    .lights {{ display: flex; gap: 8px; align-items: center; }}
    .lights span {{ width: 12px; height: 12px; border-radius: 50%; display: block; }}
    .side-item {{ display: flex; align-items: center; gap: 9px; height: 28px; padding: 0 8px 0 9px; border-radius: 7px;
                  font-size: 13px; font-weight: 500; color: {T1}; }}
    .side-item.on {{ background: rgba(255,255,255,0.14); color: #fff; box-shadow: inset 0 0 0 0.5px rgba(255,255,255,0.08); }}
    .side-item svg {{ color: {ACCENT}; }} .side-item.on svg {{ color: #fff; }}
    .side-sec {{ font-size: 11px; font-weight: 600; color: {T3}; padding: 12px 9px 4px; }}
    .chip {{ display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 999px; background: rgba(255,255,255,0.10);
             color: {T2}; font-size: 11px; font-weight: 500; line-height: 1.25; }}
    .chip.on {{ background: rgba(167,139,250,0.22); color: #d6ccff; }}
    .btn {{ display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 14px; border-radius: 999px; font-size: 13px; font-weight: 600; line-height: 1; white-space: nowrap; }}
    .btn.pri {{ background: #fff; color: #111; }}
    .btn.sec {{ background: rgba(255,255,255,0.10); color: {T1}; font-weight: 500; box-shadow: {GLASS_EDGE}; }}
    .btn.acc {{ background: {ACCENT}; color: #14082e; box-shadow: inset 0 1px 0 rgba(255,255,255,0.25); }}
    .h2 {{ font-size: 20px; font-weight: 700; letter-spacing: -0.01em; color: #fff; margin: 0; }}
    .more {{ font-size: 12px; font-weight: 500; color: {T3}; display: inline-flex; align-items: center; gap: 2px; }}
    .poster {{ position: relative; border-radius: 8px; overflow: hidden; flex-shrink: 0; box-shadow: 0 0 0 0.5px rgba(255,255,255,0.08); }}
    .poster .shade {{ position: absolute; left: 0; right: 0; bottom: 0; height: 50%; background: linear-gradient(to top, rgba(20,20,22,.9), transparent); }}
    .poster .score {{ position: absolute; top: 6px; right: 6px; display: inline-flex; align-items: center; gap: 2px; font-size: 10px; font-weight: 700; color: #fff;
                      background: rgba(0,0,0,0.55); border-radius: 999px; padding: 3px 7px; line-height: 1; backdrop-filter: blur(6px); font-variant-numeric: tabular-nums; }}
    .poster .ep {{ position: absolute; top: 6px; left: 6px; font-size: 10px; font-weight: 700; color: #fff; background: rgba(167,139,250,0.9); border-radius: 999px; padding: 3px 7px; line-height: 1; }}
    .poster .cnt {{ position: absolute; bottom: 6px; right: 6px; font-size: 10px; font-weight: 600; color: rgba(255,255,255,.9); background: rgba(0,0,0,0.55); border-radius: 999px; padding: 3px 7px; line-height: 1; backdrop-filter: blur(6px); }}
    .poster .ttl {{ position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; padding: 12px; text-align: center; font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.55); line-height: 1.4; }}
    .cap {{ font-size: 12px; font-weight: 600; color: #fff; margin-top: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }}
    .sub {{ font-size: 11px; color: {T3}; margin-top: 2px; }}
    .still {{ position: relative; border-radius: 10px; overflow: hidden; flex-shrink: 0; box-shadow: 0 0 0 0.5px rgba(255,255,255,0.08); }}
    .still .bar {{ position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255,255,255,0.12); }}
    .still .bar i {{ display: block; height: 100%; background: {ACCENT}; border-radius: 0 999px 999px 0; }}
    .still .fade {{ position: absolute; inset: 0; background: linear-gradient(to top, rgba(20,20,22,0.8), transparent 50%); }}
    .still .playbtn {{ position: absolute; left: 50%; top: 50%; width: 40px; height: 40px; margin: -20px 0 0 -20px; border-radius: 50%; background: rgba(255,255,255,0.92); display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 20px rgba(0,0,0,.4); color: #000; }}
    .still .menu {{ position: absolute; top: 8px; right: 8px; width: 26px; height: 26px; border-radius: 50%; background: rgba(30,30,34,0.7); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; color: #fff; box-shadow: {GLASS_EDGE}; }}
    .tb-btn {{ width: 28px; height: 28px; border-radius: 7px; display: flex; align-items: center; justify-content: center; color: {T2}; }}
    .field {{ display: flex; align-items: center; gap: 7px; height: 28px; padding: 0 9px; border-radius: 8px; background: rgba(255,255,255,0.07); color: {T3}; font-size: 13px;
              box-shadow: inset 0 0 0 1px rgba(255,255,255,0.10); }}
    .kbd {{ font-size: 10px; font-weight: 600; color: {T3}; background: rgba(255,255,255,0.08); border-radius: 4px; padding: 2px 5px; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.10); font-family: {FONT}; }}
    .seg {{ display: inline-flex; background: rgba(255,255,255,0.08); border-radius: 999px; padding: 2px; gap: 2px; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06); }}
    .seg span {{ padding: 4px 11px; border-radius: 999px; font-size: 12px; font-weight: 500; color: {T2}; white-space: nowrap; display: inline-flex; align-items: center; }}
    .seg span.on {{ background: rgba(255,255,255,0.18); color: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,0.15); }}
    .card {{ border-radius: 12px; background: rgba(255,255,255,0.05); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08); }}
    .row {{ display: flex; align-items: center; }}
    .tabs {{ display: inline-flex; align-self: flex-start; background: rgba(255,255,255,0.08); border-radius: 999px; padding: 2px; gap: 2px; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06); }}
    .tabs span {{ padding: 4px 11px !important; border-radius: 999px; font-size: 12px !important; font-weight: 500 !important; color: {T2}; position: relative; white-space: nowrap; }}
    .tabs span.on {{ color: #fff; background: rgba(255,255,255,0.18); box-shadow: 0 1px 3px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,0.15); }}
    .toggle {{ width: 36px; height: 21px; border-radius: 999px; background: rgba(255,255,255,0.18); position: relative; flex-shrink: 0; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08); }}
    .toggle i {{ position: absolute; top: 2px; left: 2px; width: 17px; height: 17px; border-radius: 50%; background: #fff; display: block; box-shadow: 0 1px 3px rgba(0,0,0,.4); }}
    .toggle.on {{ background: {ACCENT}; }} .toggle.on i {{ left: 17px; }}
    .slider {{ position: relative; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.14); flex: 1; }}
    .slider i {{ position: absolute; left: 0; top: 0; height: 100%; background: {ACCENT}; border-radius: 2px; display: block; }}
    .slider b {{ position: absolute; top: -8px; width: 20px; height: 20px; border-radius: 50%; background: #fff; margin-left: -10px; box-shadow: 0 1px 4px rgba(0,0,0,.5), inset 0 0 0 0.5px rgba(0,0,0,.2); display: block; }}
    .dm {{ position: absolute; font-weight: 700; font-size: 22px; white-space: nowrap; line-height: 1;
           text-shadow: 0 0 1px #000, 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; }}
    .glass {{ background: rgba(34,34,38,0.62); backdrop-filter: blur(30px) saturate(170%);
              box-shadow: inset 0 0 0 1px rgba(255,255,255,0.12), inset 0 1px 0 rgba(255,255,255,0.14), 0 20px 50px rgba(0,0,0,0.5); }}
    .popup {{ width: 16px; height: 16px; border-radius: 5px; background: {ACCENT}; display: inline-flex; align-items: center; justify-content: center; margin-left: auto; flex-shrink: 0; }}
    .mono {{ font-family: 'SF Mono', Menlo, monospace; }}
    """


_orig_ic = gen.ic


def ic(name: str, size: int = 16, sw: float = 1.5, color: str = "currentColor") -> str:
    """SF Symbols weight: bump the default 1.5 stroke to 1.8."""
    if name == "updown":
        return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="display:block">'
                f'<path d="M8 10l4-4 4 4M8 14l4 4 4-4"/></svg>')
    return _orig_ic(name, size, 1.8 if sw == 1.5 else sw, color)


def popup() -> str:
    return f'<span class="popup">{ic("updown", 11, 0, "#14082e")}</span>'


def lights() -> str:
    return ('<div class="lights"><span style="background:#ff5f57;box-shadow:inset 0 0 0 0.5px rgba(0,0,0,.25)"></span>'
            '<span style="background:#febc2e;box-shadow:inset 0 0 0 0.5px rgba(0,0,0,.25)"></span>'
            '<span style="background:#28c840;box-shadow:inset 0 0 0 0.5px rgba(0,0,0,.25)"></span></div>')


def sidebar(active: str, rail: bool = False, height: int = 900) -> str:
    """Floating glass sidebar (macOS 26). The icon-rail variant is kept for reference only."""
    if rail:
        return gen.sidebar(active, True, height)
    groups = ""
    for sec, group in gen.NAV:
        groups += f'<div class="side-sec">{sec}</div>'
        for icon, label in group:
            on = label == active
            badge = (f'<span style="margin-left:auto;background:rgba(255,255,255,0.16);color:#fff;font-size:10px;font-weight:600;border-radius:999px;padding:2px 6px;line-height:1">12</span>') if label == "通知" else ""
            groups += f'<div class="side-item{" on" if on else ""}">{ic(icon, 16, 1.9)}<span>{label}</span>{badge}</div>'
    return f"""
    <div style="position:absolute;left:10px;top:10px;bottom:10px;width:210px;display:flex;flex-direction:column;padding:42px 8px 10px;border-radius:14px;z-index:7;
                background:{GLASS};backdrop-filter:blur(40px) saturate(160%);box-shadow:{GLASS_EDGE}, 0 10px 30px rgba(0,0,0,0.25)">
      <div style="display:flex;align-items:center;gap:8px;padding:0 9px 8px">
        <div style="width:24px;height:24px;border-radius:7px;background:radial-gradient(circle at 35% 35%, #c4b5fd, #6d28d9 70%);display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.4)">{ic("play", 11, 0, "#fff")}</div>
        <div style="font-size:13px;font-weight: 700;color:#fff">milmil</div>
      </div>
      {groups}
      <div style="margin-top:auto">
        <div class="side-item{" on" if active == "設定" else ""}">{ic("gear", 16, 1.9)}<span>設定</span><span class="kbd" style="margin-left:auto">⌘,</span></div>
        <div style="display:flex;align-items:center;gap:9px;padding:10px 9px 2px;margin-top:6px;border-top:1px solid rgba(255,255,255,0.08)">
          <div style="width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg, #6d28d9, #a78bfa);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff">A</div>
          <div style="min-width:0"><div style="font-size:12px;font-weight:600;color:#fff">admin</div><div style="font-size:10px;color:{T3};display:flex;align-items:center;gap:4px"><span style="width:6px;height:6px;border-radius:50%;background:#30d158;display:inline-block"></span>home-nas · v0.1.17</div></div>
        </div>
      </div>
    </div>"""


def toolbar(title: str, left: int = 220, search: str = "搜尋", extra: str = "") -> str:
    left = 230 if left == 220 else left
    return f"""
    <div style="position:absolute;left:{left}px;right:0;top:0;height:52px;display:flex;align-items:center;gap:10px;padding:0 16px 0 10px;z-index:5">
      <span class="row glass" style="border-radius:999px;padding:2px;box-shadow:{GLASS_EDGE}"><span class="tb-btn" style="border-radius:999px;color:#fff">{ic("chevl", 15, 2.2)}</span><span class="tb-btn" style="border-radius:999px;color:{T4}">{ic("chevr", 15, 2.2)}</span></span>
      <div style="font-size:15px;font-weight:700;color:{T1};letter-spacing:-0.01em">{title}</div>
      <div style="flex:1"></div>
      {extra}
      <div class="field" style="width:220px;border-radius:999px;background:rgba(255,255,255,0.09)">{ic("search", 13, 2.2)}<span style="flex:1;font-size:13px">{search}</span></div>
      <span class="tb-btn" style="border-radius:999px;background:rgba(255,255,255,0.09);box-shadow:{GLASS_EDGE};position:relative;color:#fff">{ic("bell", 16, 1.9)}<span style="position:absolute;top:4px;right:5px;width:7px;height:7px;border-radius:50%;background:#ff453a;box-shadow:0 0 0 1.5px {BG}"></span></span>
    </div>"""


def window_top(title_center: str = "") -> str:
    return f"""
    <div style="position:absolute;left:0;top:0;right:0;height:52px;display:flex;align-items:center;padding:0 20px;z-index:6;pointer-events:none">
      {lights()}<div style="flex:1;text-align:center;font-size:13px;font-weight:600;color:{T2}">{title_center}</div>
    </div>"""


def wrap(inner: str, w: int = gen.W, h: int = gen.H, bg: str | None = None) -> str:
    bg = bg or BG
    return f'<div class="win" style="width:{w}px;height:{h}px;background-color:{bg}">{inner}</div>'


def backdrop(name: str, top: int = 0, height: int = 640, left: int = 220, alpha: float = 1.0) -> str:
    if left == 220:
        left = 0  # the floating sidebar sits over the backdrop, like the Apple TV app
    h1 = gen.hue(name)
    return (f'<div style="position:absolute;left:{left}px;right:0;top:{top}px;height:{height}px;pointer-events:none;opacity:{alpha};'
            f'background:linear-gradient(to bottom, rgba(20,20,22,0) 0%, rgba(20,20,22,0) 45%, {BG} 100%),'
            f'linear-gradient(to right, rgba(20,20,22,0.85) 0%, rgba(20,20,22,0.35) 35%, rgba(20,20,22,0) 60%),'
            f'radial-gradient(ellipse 60% 80% at 75% 30%, oklch(45% 0.18 {h1}) 0%, transparent 70%),'
            f'radial-gradient(ellipse 40% 60% at 95% 70%, oklch(35% 0.2 {(h1 + 60) % 360}) 0%, transparent 70%),'
            f'{gen.anime_gradient(name)}"></div>')


def select(v: str, w: int = 160) -> str:
    style = f"width:{w}px;" if w else "width:100%;"
    return f'<span class="field" style="height:28px;color:{T1};{style}gap:8px">{v}{popup()}</span>'


SETTINGS_TILES = {  # System Settings style: coloured icon tiles
    "一般": ("gear", "#8e8e93"), "伺服器": ("server", "#5e5ce6"), "播放器": ("play", "#ff9f0a"), "彈幕": ("danmaku", "#a78bfa"), "字幕": ("cc", "#30d158"),
    "快捷鍵": ("keyboard", "#64d2ff"), "整合": ("link", "#ff375f"), "通知": ("bell", "#ff453a"), "下載": ("download", "#0a84ff"), "帳號": ("dot", "#bf5af2"), "關於": ("info", "#8e8e93"),
}


def settings_shell(tab: str, title: str, subtitle: str, content: str, w: int = 980, h: int = 680) -> str:
    side = ""
    for t, (i, col) in SETTINGS_TILES.items():
        on = t == tab
        side += (f'<div class="side-item{" on" if on else ""}" style="height:30px;gap:8px">'
                 f'<span style="width:20px;height:20px;border-radius:6px;background:{col};display:inline-flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 0.5px rgba(0,0,0,.2), 0 1px 2px rgba(0,0,0,.3)">{ic(i, 12, 2.2, "#fff")}</span><span>{t}</span></div>')
    inner = f"""
    <div style="position:absolute;inset:0;background:{BG};display:flex">
      <div style="width:210px;flex-shrink:0;padding:48px 10px 14px;background:{GLASS};border-right:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;gap:1px;backdrop-filter:blur(40px)">
        <div class="field" style="height:26px;margin:0 0 10px;border-radius:999px">{ic("search", 12, 2.2)}搜尋</div>{side}</div>
      <div style="flex:1;min-width:0;padding:46px 28px 24px;overflow:hidden;display:flex;flex-direction:column;gap:16px">
        <div><div style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.01em">{title}</div><div style="font-size:12px;color:{T3};margin-top:2px">{subtitle}</div></div>
        {content}
      </div>
    </div>
    <div style="position:absolute;left:0;top:0;right:0;height:44px;display:flex;align-items:center;padding:0 16px;pointer-events:none">{lights()}<div style="position:absolute;left:226px;top:14px;font-size:13px;font-weight:600;color:{T2}">{title}</div></div>"""
    return gen.doc(f'<div class="win" style="width:{w}px;height:{h}px;background-image:none">{inner}</div>')


def apply(*namespaces) -> None:
    """Install the native primitives into the given module / dict namespaces."""
    overrides = {
        "BG": BG, "SURFACE": SURFACE, "T1": T1, "T2": T2, "T3": T3, "T4": T4, "FONT": FONT, "GFONTS": GFONTS,
        "base_css": base_css, "ic": ic, "lights": lights, "sidebar": sidebar, "toolbar": toolbar, "window_top": window_top,
        "wrap": wrap, "backdrop": backdrop, "select": select, "settings_shell": settings_shell, "popup": popup,
    }
    for ns in namespaces:
        for k, v in overrides.items():
            if isinstance(ns, dict):
                ns[k] = v
            else:
                setattr(ns, k, v)
