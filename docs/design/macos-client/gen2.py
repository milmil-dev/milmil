#!/usr/bin/env python3
"""Second batch of artboards (settings, library/download flows, player states,
onboarding, system integration, empty states). Run this instead of gen.py — it
imports the primitives and the first batch from gen.py and writes everything.
"""
from __future__ import annotations

import json
import os

from gen import *  # noqa: F401,F403 — primitives + first-batch artboards
import gen

SETTINGS_TABS = ["一般", "伺服器", "播放器", "彈幕", "字幕", "快捷鍵", "整合", "通知", "下載", "帳號", "關於"]
SETTINGS_ICONS = ["gear", "server", "play", "danmaku", "cc", "keyboard", "link", "bell", "download", "dot", "info"]


# ---------------------------------------------------------------- shared shells
def _settings_shell_unused(tab: str, title: str, subtitle: str, content: str, w: int = 980, h: int = 680) -> str:
    side = "".join(f'<div class="side-item{" on" if t == tab else ""}" style="height:28px">{ic(i, 15, 1.7)}<span>{t}</span></div>'
                   for t, i in zip(SETTINGS_TABS, SETTINGS_ICONS))
    inner = f"""
    <div style="position:absolute;inset:0;background:{BG};display:flex">
      <div style="width:200px;flex-shrink:0;padding:48px 10px 14px;background:rgba(255,255,255,.025);border-right:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;gap:2px"><div class="field" style="height:26px;margin:0 0 8px">{ic("search", 12)}搜尋設定</div>{side}</div>
      <div style="flex:1;min-width:0;padding:44px 28px 24px;overflow:hidden;display:flex;flex-direction:column;gap:16px">
        <div><div style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.01em">{title}</div><div style="font-size:12px;color:{T3};margin-top:2px">{subtitle}</div></div>
        {content}
      </div>
    </div>
    <div style="position:absolute;left:0;top:0;right:0;height:44px;display:flex;align-items:center;padding:0 16px;pointer-events:none">{lights()}<div style="flex:1;text-align:center;font-size:13px;font-weight:600;color:{T2}">設定</div></div>"""
    return doc(f'<div class="win" style="width:{w}px;height:{h}px;background-image:none">{inner}</div>')


def srow(label: str, control: str, hint: str = "") -> str:
    h = f'<div style="font-size:11px;color:{T3};margin-top:2px">{hint}</div>' if hint else ""
    return (f'<div class="row" style="gap:16px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.05)"><div style="width:220px;flex-shrink:0"><div style="font-size:13px;color:{T1}">{label}</div>{h}</div>'
            f'<div style="flex:1;display:flex;justify-content:flex-end;align-items:center;gap:10px;min-width:0">{control}</div></div>')


def sgrp(title: str, rows: str, note: str = "") -> str:
    n = f'<div style="font-size:11px;color:{T3};margin-top:6px">{note}</div>' if note else ""
    return f'<div><div style="font-size:11px;font-weight:700;color:{T3};letter-spacing:.04em;margin-bottom:4px">{title}</div><div class="card" style="padding:2px 16px">{rows}</div>{n}</div>'


def toggle(on: bool = True) -> str:
    return f'<span class="toggle{" on" if on else ""}"><i></i></span>'


def select(v: str, w: int = 160) -> str:
    return f'<span class="field" style="height:28px;color:{T1};width:{w}px;justify-content:space-between">{v}{ic("chevd", 12, 2)}</span>'


def seg(opts: list[str], on: str) -> str:
    return '<span class="seg">' + "".join(f'<span class="{"on" if o == on else ""}">{o}</span>' for o in opts) + "</span>"


def sheet(inner: str, w: int, h: int, title: str, subtitle: str = "", footer: str = "") -> str:
    sub = f'<div style="font-size:11px;color:{T3};margin-top:2px">{subtitle}</div>' if subtitle else ""
    ft = f'<div class="row" style="padding:12px 20px;border-top:1px solid rgba(255,255,255,.06);gap:8px;justify-content:flex-end">{footer}</div>' if footer else ""
    body = f"""
    <div style="position:absolute;inset:0;background:{SURFACE};display:flex;flex-direction:column">
      <div class="row" style="padding:16px 20px;border-bottom:1px solid rgba(255,255,255,.06);gap:12px"><div><div style="font-size:15px;font-weight:700;color:#fff">{title}</div>{sub}</div></div>
      <div style="flex:1;min-height:0;overflow:hidden;padding:16px 20px">{inner}</div>{ft}
    </div>"""
    return doc(f'<div style="width:{w}px;height:{h}px;border-radius:12px;overflow:hidden;position:relative;box-shadow:0 0 0 1px rgba(255,255,255,.12), 0 30px 60px rgba(0,0,0,.7)">{body}</div>')


def mono(s: str) -> str:
    return f'<span style="font-family:Menlo, monospace;font-size:11px;color:{T2}">{s}</span>'


# ---------------------------------------------------------------- settings pages
def ab_settings_general() -> str:
    c = (sgrp("介面", srow("語言", select("繁體中文（台灣）")) + srow("外觀", seg(["深色", "跟隨系統"], "深色"), "v1 只有深色主題（與 web 一致）") + srow("減少動態", toggle(False), "跟隨系統「減少動態效果」時自動啟用") + srow("海報 hover 展開", toggle(True), "延遲 250ms 後 lift + 顯示 ▶ / 資訊"))
         + sgrp("時刻表", srow("週起始日", seg(["週一", "週日", "週六"], "週一")) + srow("播出時間顯示", seg(["本地", "JST", "兩者"], "兩者")))
         + sgrp("行為", srow("開始播放時自動加入收藏", toggle(True), "狀態設為「在看」") + srow("登入時啟動", toggle(False)) + srow("關閉視窗時保留在 Dock", toggle(True), "背景維持 WebSocket 與下載通知") + srow("⌘K 搜尋範圍", seg(["本地", "本地 + Bangumi"], "本地 + Bangumi"))))
    return settings_shell("一般", "一般", "語言、外觀與基本行為。", c)


def ab_settings_server() -> str:
    def prof(name: str, url: str, on: bool, ver: str, ok: bool = True) -> str:
        return (f'<div class="row" style="gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)"><span style="color:{"#4ade80" if ok else "#f87171"}">{ic("server", 16)}</span>'
                f'<div style="flex:1;min-width:0"><div class="row" style="gap:8px"><span style="font-size:13px;font-weight:600;color:#fff">{name}</span>{"<span class=chip style=font-size:10px;padding:2px_7px;background:rgba(167,139,250,.15);color:" + ACCENT + ">目前</span>" if on else ""}</div>'
                f'<div style="margin-top:2px">{mono(url)} <span style="font-size:11px;color:{T3}">· {ver}</span></div></div>'
                + (f'<span class="btn sec" style="padding:5px 10px;font-size:11px">切換</span>' if not on else "") + f'<span class="tb-btn">{ic("more", 14)}</span></div>')
    def tok(name: str, prefix: str, last: str, cur: bool = False) -> str:
        return (f'<div class="row" style="gap:12px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.05)"><span style="color:{T3}">{ic("keyboard" if not cur else "dot", 14)}</span>'
                f'<div style="flex:1;min-width:0"><div class="row" style="gap:8px"><span style="font-size:13px;color:#fff">{name}</span>{"<span style=font-size:10px;color:" + ACCENT + ">此裝置</span>" if cur else ""}</div><div style="margin-top:2px">{mono("mlml_" + prefix + "…")} <span style="font-size:11px;color:{T3}">· {last}</span></div></div>'
                f'<span class="btn sec" style="padding:5px 10px;font-size:11px;color:#f87171">撤銷</span></div>')
    c = (sgrp("伺服器", prof("home-nas", "https://milmil.home.arpa", True, "v0.1.17 · WebSocket 已連線") + prof("seedbox", "https://seed.example.net:8443", False, "v0.1.15", ok=False) + f'<div class="row" style="padding:10px 0;gap:6px;font-size:12px;color:{ACCENT};font-weight:600">{ic("plus", 12, 2.2)}新增伺服器…</div>')
         + sgrp("此伺服器的 Token / 裝置", tok("milmil for macOS — Pie", "a1b2c3d4", "剛剛 · 192.168.1.20", cur=True) + tok("Safari on Mac", "9f8e7d6c", "2 小時前 · 192.168.1.20") + tok("Infuse (Jellyfin)", "5a6b7c8d", "昨天 · 192.168.1.31") + tok("milmil-cli", "11223344", "3 天前"), "Token 不會過期；撤銷即登出該裝置。改密碼會撤銷其他所有裝置。")
         + sgrp("連線", srow("允許自簽憑證", toggle(False), "只對此伺服器生效") + srow("WebSocket", f'<span style="font-size:12px;color:#4ade80">已連線 · ticket 42s 前換發</span>') + srow("離線快取", f'<span style="font-size:12px;color:{T2}">中繼資料 38 MB · 彈幕 12 MB</span><span class="btn sec" style="padding:4px 10px;font-size:11px">清除</span>')))
    return settings_shell("伺服器", "伺服器", "多個 milmil 伺服器、此裝置的 token 與其他登入裝置。", c, h=780)


def ab_settings_player() -> str:
    maps = "".join(f'<div class="row" style="gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05)">{mono(a)}<span style="color:{T3}">→</span>{mono(b)}<span style="margin-left:auto;font-size:11px;color:{"#4ade80" if ok else "#fbbf24"}">{"已掛載" if ok else "未掛載"}</span><span class="tb-btn">{ic("trash", 13)}</span></div>'
                   for a, b, ok in [("/media/anime", "/Volumes/anime", True), ("/mnt/seedbox", "/Volumes/seedbox", False)])
    c = (sgrp("播放", srow("硬體解碼", seg(["VideoToolbox", "auto-safe", "關"], "VideoToolbox"), "目前：HEVC 10-bit 硬解 ✓") + srow("串流策略", seg(["本機路徑 → 直接 → remux → 轉碼", "永遠直接"], "本機路徑 → 直接 → remux → 轉碼")) + srow("預設字幕語言", select("繁體中文 → 日文", 200)) + srow("預設音訊語言", select("日文", 200)) + srow("緩衝", seg(["低", "平衡", "高"], "平衡"), "mpv cache 30s / 60s / 120s"))
         + sgrp("本機路徑對應", maps + f'<div class="row" style="padding:8px 0;gap:6px;font-size:12px;color:{ACCENT};font-weight:600">{ic("plus", 12, 2.2)}新增對應…</div>', "伺服器路徑前綴對應到 Finder 掛載點時，直接以 file:// 播放：零伺服器負載、即時 seek。")
         + sgrp("自動", srow("自動下一集", toggle(True), "結束前 30 秒顯示倒數卡") + srow("自動跳過 OP / ED", f'{toggle(True)}<span style="font-size:12px;color:{T2}">OP</span>{toggle(True)}<span style="font-size:12px;color:{T2}">ED</span>') + srow("記住每部作品的倍速 / 音量 / 字幕軌", toggle(True), "per-series 偏好，與 web 同步") + srow("播放時防止睡眠", toggle(True)) + srow("耳機拔除時暫停", toggle(True)))
         + sgrp("畫質", srow("Anime4K", seg(["關", "Fast", "Balanced", "HQ"], "Balanced"), "依 GPU 建議：M1 → Balanced") + srow("插幀 (interpolation)", toggle(False)) + srow("HDR tone-mapping", select("auto (bt.2390)", 160)))
         + sgrp("工具", srow("yt-dlp", f'<span style="font-size:12px;color:#4ade80">2026.08.10 已安裝</span><span class="btn sec" style="padding:4px 10px;font-size:11px">檢查更新</span>', "用於 YouTube 預告片與「開啟 URL」；不隨 app 打包") + srow("截圖儲存位置", f'{mono("~/Pictures/milmil")}<span class="btn sec" style="padding:4px 10px;font-size:11px">選擇…</span>')))
    return settings_shell("播放器", "播放器", "mpv 引擎、串流策略、本機路徑對應與畫質。", c, h=1080)


def ab_settings_subtitles() -> str:
    preview = (f'<div style="height:120px;border-radius:10px;background:linear-gradient(135deg, oklch(30% 0.06 60), oklch(20% 0.05 300));position:relative;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)">'
               f'<div style="position:absolute;left:50%;top:18px;transform:translateX(-50%);font-size:16px;font-weight:600;color:#fff;text-shadow:0 0 2px #000,1px 1px 0 #000,-1px -1px 0 #000;opacity:.85">Secondary: The magic circle is too complex.</div>'
               f'<div style="position:absolute;left:50%;bottom:14px;transform:translateX(-50%);font-size:22px;font-weight:600;color:#fff;text-shadow:0 0 2px #000,1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000">這個魔法陣也太複雜了吧</div></div>')
    presets = "".join(f'<span class="chip{" on" if p == "動漫" else ""}">{p}</span>' for p in ["默認", "電影院", "動漫", "高對比", "自訂"])
    c = (preview + f'<div class="row" style="gap:8px"><span style="font-size:12px;color:{T3}">預設組</span>{presets}<span style="flex:1"></span><span class="btn sec" style="padding:5px 10px;font-size:11px">另存為預設…</span></div>'
         + sgrp("樣式", srow("字體", select("Noto Sans CJK TC", 200)) + srow("大小", f'<span class="slider" style="max-width:200px"><i style="width:45%"></i><b style="left:45%"></b></span><span style="font-size:12px;color:{T2};width:36px;text-align:right">24</span>') + srow("顏色 / 背景", f'<span style="width:20px;height:20px;border-radius:6px;background:#fff;box-shadow:inset 0 0 0 1px rgba(0,0,0,.3)"></span><span style="width:20px;height:20px;border-radius:6px;background:rgba(0,0,0,.75);box-shadow:inset 0 0 0 1px rgba(255,255,255,.2)"></span><span style="font-size:12px;color:{T2}">背景 0%</span>') + srow("描邊", f'<span class="slider" style="max-width:120px"><i style="width:50%"></i><b style="left:50%"></b></span><span style="font-size:12px;color:{T2}">2px</span>{seg(["outline", "drop", "raised"], "outline")}') + srow("位置", f'{seg(["上", "中", "下"], "下")}<span style="font-size:12px;color:{T2}">安全邊距 5%</span>'))
         + sgrp("ASS / 進階", srow("尊重 ASS 原生樣式", toggle(True), "關閉時以上方樣式覆寫（mpv sub-ass-override=force）") + srow("雙字幕", toggle(True), "副字幕顯示在上方，可獨立語言") + srow("字幕延遲步進", seg(["0.1s", "0.5s"], "0.1s"), "Z / X") + srow("自動載入同名字幕", toggle(True), "sub-auto=fuzzy；拖放 .srt/.ass/.vtt 亦可")))
    return settings_shell("字幕", "字幕", "樣式、預設組與 ASS 行為；以 SubtitleStyle 同步到 web。", c, h=900)


def ab_settings_integrations() -> str:
    def card(name: str, status: str, ok: bool, body: str) -> str:
        return (f'<div class="card" style="padding:14px 16px;display:flex;flex-direction:column;gap:10px"><div class="row" style="gap:10px"><span style="width:32px;height:32px;border-radius:8px;background:{anime_gradient(name)};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:13px">{name[0]}</span>'
                f'<div style="flex:1"><div style="font-size:14px;font-weight:700;color:#fff">{name}</div><div style="font-size:11px;color:{"#4ade80" if ok else T3}">{status}</div></div>{body}</div></div>')
    bang = card("Bangumi", "已連結 · niskan · 上次同步 12 分鐘前", True, f'<span class="row" style="gap:8px"><span style="font-size:12px;color:{T2}">自動拉取</span>{toggle(True)}<span class="btn sec" style="padding:5px 10px;font-size:11px">立即同步</span><span class="btn sec" style="padding:5px 10px;font-size:11px;color:#f87171">中斷</span></span>')
    anil = card("AniList", "已連結 · niskan · 2 筆待推送", True, f'<span class="row" style="gap:8px"><span style="font-size:12px;color:{T2}">自動拉取</span>{toggle(True)}<span class="btn sec" style="padding:5px 10px;font-size:11px">立即同步</span><span class="btn sec" style="padding:5px 10px;font-size:11px;color:#f87171">中斷</span></span>')
    trakt = card("Trakt", "未連結", False, f'<span class="btn acc" style="padding:6px 12px;font-size:12px">連結 Trakt</span>')
    device = (f'<div class="card" style="padding:14px 16px;display:flex;gap:16px;align-items:center;background:rgba(167,139,250,.06)"><div style="flex:1"><div style="font-size:13px;font-weight:700;color:#fff">在瀏覽器開啟 trakt.tv/activate 並輸入代碼</div><div style="font-size:11px;color:{T3};margin-top:2px">代碼 14:32 後失效 · 正在等待授權…</div></div>'
              f'<span style="font-size:26px;font-weight:800;letter-spacing:.18em;color:{ACCENT};font-family:Menlo, monospace">8F3K-2QZD</span><span class="btn sec" style="padding:6px 12px;font-size:12px">複製</span></div>')
    tmdb = sgrp("TMDB", srow("API Key", f'{mono("eyJhbGciOiJIUzI1NiJ9…")}<span class="btn sec" style="padding:4px 10px;font-size:11px">測試</span>', "用於劇照與英文標題"))
    sync = sgrp("同步狀態", srow("推送佇列", f'<span style="font-size:12px;color:{T2}">2 筆 → AniList · 0 筆 → Bangumi</span><span class="btn sec" style="padding:4px 10px;font-size:11px">立即推送</span>') + srow("最近錯誤", f'<span style="font-size:12px;color:#fbbf24">AniList 429 rate limited · 09:12，已重試</span>'))
    c = f'<div style="display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:12px">{bang}{anil}</div>{trakt}{device}{tmdb}{sync}'
    return settings_shell("整合", "整合", "追番網站 OAuth（瀏覽器回跳 milmil://）與 Trakt device-code。", c, h=900)


def ab_settings_notifications() -> str:
    sysn = sgrp("系統通知（macOS）", srow("下載完成", toggle(True)) + srow("掃描完成 / 新匹配", toggle(True)) + srow("今天播出（收藏中的作品）", toggle(True), "播出前 10 分鐘") + srow("有新版本", toggle(True)) + srow("同步需要重新授權", toggle(True)) + srow("Dock 圖示 badge", seg(["未讀通知", "進行中下載", "關"], "未讀通知")))
    def prov(name: str, on: bool, detail: str) -> str:
        return (f'<div class="row" style="gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05)"><span style="color:{T2}">{ic("link", 14)}</span><div style="flex:1"><div style="font-size:13px;color:#fff">{name}</div><div style="font-size:11px;color:{T3};margin-top:2px">{detail}</div></div>'
                f'<span class="btn sec" style="padding:4px 10px;font-size:11px">測試</span>{toggle(on)}</div>')
    srv = sgrp("伺服器端通知（與 web 共用）", prov("Discord Webhook", True, "https://discord.com/api/webhooks/…") + prov("Telegram Bot", True, "@milmil_bot · chat 1234…") + prov("Webhook", False, "未設定"), "事件對應（download.completed、library.scan_complete、system.error…）在此與 web 同步。")
    return settings_shell("通知", "通知", "本機系統通知與伺服器端推送 provider。", c := sysn + srv, h=720)


def ab_settings_downloads() -> str:
    c = (sgrp("內建下載引擎（伺服器端）", srow("狀態", f'<span style="font-size:12px;color:#4ade80">執行中 · 連線 48 · ↓12.4 MB/s ↑1.1 MB/s</span>') + srow("下載完成後自動刪除種子檔", toggle(True)) + srow("做種上限", seg(["關", "1.0", "2.0", "無限"], "2.0")) + srow("預設媒體庫", select("NAS Anime", 180)))
         + sgrp("桌面端", srow("拖放 magnet / .torrent 時詢問媒體庫", toggle(True)) + srow("以 milmil 開啟 magnet: 連結", toggle(False), "設為系統預設處理程式") + srow("下載完成時", seg(["通知", "通知 + 開啟詳情", "無"], "通知"))))
    return settings_shell("下載", "下載", "伺服器內建 torrent 引擎與桌面端行為。", c)


def ab_settings_account() -> str:
    c = (sgrp("帳號", srow("使用者", f'<span class="row" style="gap:8px"><span style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:{T2}">A</span><span style="font-size:13px;color:#fff">admin</span></span>') + srow("變更密碼", f'<span class="btn sec" style="padding:5px 10px;font-size:11px">變更…</span>', "會撤銷其他裝置的 token"))
         + sgrp("兩步驟驗證", srow("TOTP", f'<span style="font-size:12px;color:#4ade80">已啟用</span><span class="btn sec" style="padding:5px 10px;font-size:11px;color:#f87171">停用</span>') + srow("備用碼", f'<span style="font-size:12px;color:{T2}">剩 6 組</span><span class="btn sec" style="padding:5px 10px;font-size:11px">重新產生</span>'))
         + sgrp("API Token", srow("建立長期 token", f'<span class="btn sec" style="padding:5px 10px;font-size:11px">{ic("plus", 11, 2.2)}新增</span>', "給 CLI / 自動化用；列表見「伺服器」分頁"))
         + sgrp("稽核", srow("最近變更", f'<span style="font-size:12px;color:{T2}">今天 14 筆 · 最近：匹配 tongari_boushi_13 → 尖帽子的魔法工房 EP13</span><span class="btn sec" style="padding:5px 10px;font-size:11px">檢視 / 撤銷</span>')))
    return settings_shell("帳號", "帳號", "密碼、2FA 與 API token。", c)


def ab_settings_about() -> str:
    lic = "".join(f'<div class="row" style="gap:10px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05)"><span style="font-size:12px;color:#fff;width:160px">{n}</span><span style="font-size:11px;color:{T3};flex:1">{d}</span><span class="chip" style="font-size:10px;padding:2px 7px">{l}</span></div>'
                  for n, d, l in [("mpv / FFmpeg (MPVKit)", "播放引擎", "LGPL-2.1+"), ("libass · libplacebo", "字幕 / 渲染", "ISC / LGPL"), ("Anime4K", "GLSL shaders", "MIT"), ("Nuke", "圖片快取", "MIT"), ("SwiftyOpenCC", "繁簡轉換", "Apache-2.0"), ("yt-dlp", "選用，使用者自行下載", "Unlicense")])
    c = (f'<div class="row" style="gap:16px"><div style="width:64px;height:64px;border-radius:16px;background:radial-gradient(circle at 35% 35%, #c4b5fd, #6d28d9 70%);display:flex;align-items:center;justify-content:center">{ic("play", 26, 0, "#fff")}</div><div><div style="font-size:18px;font-weight:800;color:#fff">milmil for macOS</div><div style="font-size:12px;color:{T3};margin-top:2px">0.1.0 (12) · arm64 · macOS 15+ · dev build（未公證）</div><div style="font-size:12px;color:{T2};margin-top:6px">伺服器 home-nas v0.1.17 · <span style="color:#fbbf24">伺服器有新版本 0.1.18</span></div></div><span style="flex:1"></span><span class="btn sec" style="padding:6px 12px;font-size:12px">{ic("refresh", 14)}檢查更新</span></div>'
         + sgrp("診斷", srow("mpv", f'<span style="font-size:12px;color:{T2}">0.41.0 · hwdec videotoolbox · vo libmpv (GL)</span>') + srow("記錄檔", f'{mono("~/Library/Logs/milmil/")}<span class="btn sec" style="padding:4px 10px;font-size:11px">在 Finder 顯示</span>') + srow("重設所有設定", f'<span class="btn sec" style="padding:4px 10px;font-size:11px;color:#f87171">重設…</span>'))
         + sgrp("致謝與授權", lic + f'<div style="font-size:11px;color:{T3};padding:8px 0">設計參考 IINA 與 OKVideoMac（GPL-3.0，僅參考架構，未使用其原始碼）。</div>'))
    return settings_shell("關於", "關於", "版本、診斷與第三方授權。", c, h=780)


# ---------------------------------------------------------------- library / download flows
def ab_library_add() -> str:
    kinds = seg(["本機", "SMB", "SFTP", "WebDAV", "S3", "rclone"], "SMB")
    found = "".join(f'<div class="row" style="gap:10px;padding:7px 10px;border-radius:8px;background:{"rgba(167,139,250,.1)" if i == 0 else "transparent"}">{ic("wifi", 14)}<span style="font-size:12px;color:#fff;flex:1">{n}</span>{mono(a)}</div>' for i, (n, a) in enumerate([("nas", "nas.home.arpa · 192.168.1.10"), ("TimeCapsule", "192.168.1.3")]))
    inner = f"""
    <div style="display:flex;gap:20px;height:100%">
      <div style="flex:1;display:flex;flex-direction:column;gap:12px">
        <div><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px">來源類型</div>{kinds}</div>
        <div><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px">名稱</div><div class="field" style="height:32px;color:{T1}">NAS Anime</div></div>
        <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px"><div><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px">主機</div><div class="field" style="height:32px;color:{T1}">nas.home.arpa</div></div><div><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px">分享</div><div class="field" style="height:32px;color:{T1}">media</div></div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px">使用者</div><div class="field" style="height:32px;color:{T1}">niskan</div></div><div><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px">密碼</div><div class="field" style="height:32px;color:{T1};letter-spacing:.2em">••••••••</div></div></div>
        <div><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px">路徑</div><div class="row" style="gap:8px"><div class="field" style="height:32px;color:{T1};flex:1">{mono("/anime")}</div><span class="btn sec" style="padding:6px 12px;font-size:12px">{ic("folder", 14)}瀏覽…</span></div></div>
        <div class="row" style="gap:10px"><span class="btn sec" style="padding:6px 12px;font-size:12px">{ic("wifi", 14)}測試連線</span><span style="font-size:12px;color:#4ade80" class="row">{ic("check", 14, 2.5)} 連線成功 · 312 個影片檔 · 1.2 TB</span></div>
      </div>
      <div style="width:260px;display:flex;flex-direction:column;gap:12px">
        <div class="card" style="padding:10px"><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px">網路上找到的主機</div>{found}</div>
        <div class="card" style="padding:12px;display:flex;flex-direction:column;gap:8px"><div class="row" style="justify-content:space-between"><span style="font-size:12px;color:{T1}">掃描間隔</span>{select("60 分鐘", 110)}</div><div class="row" style="justify-content:space-between"><span style="font-size:12px;color:{T1}">自動重新命名</span>{toggle(True)}</div><div><div style="font-size:11px;color:{T3};margin-bottom:4px">範本</div>{mono("{title}/S{season:02}E{episode:02} - {ep_title}.{ext}")}</div></div>
        <div class="card" style="padding:12px;background:rgba(167,139,250,.06);font-size:11px;color:{T2};line-height:1.5">{ic("sparkle", 12, 0, ACCENT)} 若此分享也掛載在 Finder，可在 設定 › 播放器 加入本機路徑對應，播放時直接開檔。</div>
      </div>
    </div>"""
    return sheet(inner, 840, 560, "新增媒體庫", "伺服器透過 rclone / SMB 讀取；桌面端只負責設定。", '<span class="btn sec">取消</span><span class="btn acc">建立並掃描</span>')


def ab_library_rename() -> str:
    rows = ""
    for a, b, st in [("[Sakurato] Tongari Boushi no Atelier [01][AVC-8bit 1080p AAC][CHT].mp4", "尖帽子的魔法工房/S01E01 - 魔法的開端.mp4", "ok"),
                     ("[Sakurato] Tongari Boushi no Atelier [02][AVC-8bit 1080p AAC][CHT].mp4", "尖帽子的魔法工房/S01E02 - 魔法使的條件.mp4", "ok"),
                     ("尖帽子的魔法工房/S01E03 - 三人的見習生.mp4", "（相同）", "skip"),
                     ("[ANi] Dorohedoro - 03 [1080P][Baha][WEB-DL].mp4", "异兽魔都/S01E03 - 第三話.mp4", "collision"),
                     ("tongari_boushi_13_raw_final_v2.mkv", "—", "error")]:
        col, lab = {"ok": ("#4ade80", "將重新命名"), "skip": (T3, "略過 · 已是目標名"), "collision": ("#fbbf24", "略過 · 目標已存在"), "error": ("#f87171", "未匹配")}[st]
        rows += (f'<div class="row" style="gap:12px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.04)"><span style="width:16px;height:16px;border-radius:4px;background:{ACCENT if st == "ok" else "rgba(255,255,255,.06)"};box-shadow:inset 0 0 0 1px rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;color:#14082e">{ic("check", 11, 3) if st == "ok" else ""}</span>'
                 f'<div style="flex:1;min-width:0"><div>{mono(a)}</div><div class="row" style="gap:6px;margin-top:2px"><span style="color:{T4}">→</span>{mono(b) if b != "—" else ""}</div></div><span style="font-size:11px;font-weight:600;color:{col};white-space:nowrap">{lab}</span></div>')
    hist = "".join(f'<div class="row" style="gap:10px;padding:8px 10px;border-radius:8px;background:rgba(255,255,255,.03)"><span style="color:{T3}">{ic("clock", 13)}</span><div style="flex:1"><div style="font-size:12px;color:#fff">{n}</div><div style="font-size:10px;color:{T3}">{t}</div></div><span class="btn sec" style="padding:4px 10px;font-size:11px">撤銷</span></div>' for n, t in [("重新命名 12 個檔案", "今天 09:12"), ("重新命名 3 個檔案", "昨天 22:40")])
    inner = f"""{sidebar("媒體庫")}{toolbar("NAS Anime › 重新命名")}{window_top()}
    <div style="position:absolute;left:260px;right:32px;top:72px;display:flex;gap:24px">
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:14px">
        <div class="row" style="justify-content:space-between"><div><div style="font-size:26px;font-weight:700;letter-spacing:-0.01em">重新命名預覽</div><div style="font-size:12px;color:{T3};margin-top:4px">範本 {mono("{title}/S{season:02}E{episode:02} - {ep_title}.{ext}")} · 2 將重新命名 · 2 略過 · 1 錯誤</div></div><span class="row" style="gap:8px"><span class="btn sec">編輯範本</span><span class="btn acc">套用 2 項</span></span></div>
        <div class="card" style="overflow:hidden">{rows}</div>
      </div>
      <div style="width:300px;flex-shrink:0;display:flex;flex-direction:column;gap:8px"><div style="font-size:13px;font-weight:700;color:#fff">歷史</div>{hist}<div style="font-size:11px;color:{T3};line-height:1.5;margin-top:4px">每次套用都是一個批次，可整批撤銷（伺服器稽核記錄）。</div></div>
    </div>"""
    return doc(wrap(inner))


def ab_library_duplicates() -> str:
    def dset(name: str, ep: str, files: list[tuple[str, str, str, bool]]) -> str:
        fr = ""
        for f, q, s, pref in files:
            fr += (f'<div class="row" style="gap:12px;padding:8px 12px;border-top:1px solid rgba(255,255,255,.04);background:{"rgba(167,139,250,.08)" if pref else "transparent"}"><span style="width:16px;height:16px;border-radius:50%;box-shadow:inset 0 0 0 {"5px " + ACCENT if pref else "1px rgba(255,255,255,.2)"};background:{"#fff" if pref else "transparent"}"></span>'
                   f'<span style="flex:1;min-width:0">{mono(f)}</span><span class="chip" style="font-size:10px;padding:2px 7px;border-radius:4px">{q}</span><span style="font-size:11px;color:{T3};width:60px;text-align:right">{s}</span>'
                   + (f'<span style="font-size:11px;font-weight:600;color:{ACCENT}">偏好</span>' if pref else f'<span class="tb-btn" style="color:#f87171">{ic("trash", 13)}</span>') + '</div>')
        return f'<div class="card" style="overflow:hidden"><div class="row" style="gap:10px;padding:10px 12px"><div style="width:32px;height:44px;border-radius:4px;background:{anime_gradient(name)}"></div><div style="flex:1"><div style="font-size:13px;font-weight:700;color:#fff">{name} · {ep}</div><div style="font-size:11px;color:{T3}">{len(files)} 個檔案</div></div><span class="btn sec" style="padding:4px 10px;font-size:11px">保留偏好、刪除其餘</span></div>{fr}</div>'
    inner = f"""{sidebar("媒體庫")}{toolbar("NAS Anime › 重複檔案")}{window_top()}
    <div style="position:absolute;left:260px;right:32px;top:72px;display:flex;flex-direction:column;gap:14px">
      <div class="row" style="justify-content:space-between"><div><div style="font-size:26px;font-weight:700;letter-spacing:-0.01em">重複檔案</div><div style="font-size:12px;color:{T3};margin-top:4px">3 組 · 可回收 4.2 GB · 偏好規則：解析度 › HEVC › 檔案較新</div></div><span class="row" style="gap:8px"><span class="btn sec">偏好規則…</span><span class="btn sec" style="color:#f87171">{ic("trash", 14)}自動清理 3 組</span></span></div>
      {dset("葬送的芙莉莲", "EP 12", [("[SubsPlease] Sousou no Frieren - 12 (1080p).mkv", "1080p HEVC", "1.1 GB", True), ("[Erai-raws] Sousou no Frieren - 12 [720p].mkv", "720p H264", "480 MB", False)])}
      {dset("尖帽子的魔法工房", "EP 1", [("[Sakurato] Tongari Boushi no Atelier [01][1080p][CHT].mp4", "1080p H264", "1.4 GB", True), ("[Sakurato] Tongari Boushi no Atelier [01][1080p][CHS].mp4", "1080p H264", "1.4 GB", False), ("Tongari Boushi 01 [BD 1080p HEVC].mkv", "1080p HEVC", "2.0 GB", False)])}
    </div>"""
    return doc(wrap(inner))


def ab_library_missing() -> str:
    def miss(name: str, have: int, total: int, missing: str, airing: bool) -> str:
        pct = int(have / total * 100)
        return (f'<div class="card" style="padding:12px;display:flex;gap:12px;align-items:center"><div style="width:44px;height:62px;border-radius:4px;background:{anime_gradient(name)}"></div><div style="flex:1;min-width:0"><div class="row" style="gap:8px"><span style="font-size:14px;font-weight:700;color:#fff">{name}</span>{"<span class=chip style=font-size:10px;padding:2px_7px;background:rgba(245,158,11,.2);color:#fcd34d>放送中</span>" if airing else ""}</div>'
                f'<div style="font-size:12px;color:{T3};margin-top:2px">{have}/{total} 集 · 缺 <span style="color:#fbbf24;font-weight:600">{missing}</span></div><div style="height:4px;border-radius:2px;background:rgba(255,255,255,.08);margin-top:8px"><div style="width:{pct}%;height:100%;background:{ACCENT};border-radius:2px"></div></div></div>'
                f'<span class="btn sec" style="padding:6px 12px;font-size:12px">{ic("search", 13)}搜尋缺集</span><span class="btn sec" style="padding:6px 12px;font-size:12px">{ic("rss", 13)}建立規則</span></div>')
    results = "".join(f'<div class="row" style="gap:10px;padding:8px 10px;border-radius:8px;background:{"rgba(167,139,250,.1)" if i == 0 else "transparent"}"><span style="font-size:11px;font-weight:700;color:{T2};width:40px">EP {e}</span><span style="flex:1;min-width:0">{mono(t)}</span><span style="font-size:11px;color:{T3}">{s}</span><span style="font-size:11px;color:#4ade80">↑{sd}</span><span class="btn sec" style="padding:4px 10px;font-size:11px">下載</span></div>'
                      for i, (e, t, s, sd) in enumerate([("5", "[SubsPlease] Yomi no Tsugai - 05 (1080p).mkv", "1.3 GB", 412), ("6", "[SubsPlease] Yomi no Tsugai - 06 (1080p).mkv", "1.3 GB", 380), ("7", "[Erai-raws] Yomi no Tsugai - 07 [1080p].mkv", "1.2 GB", 95)]))
    inner = f"""{sidebar("媒體庫")}{toolbar("NAS Anime › 缺集")}{window_top()}
    <div style="position:absolute;left:260px;right:32px;top:72px;display:flex;gap:24px">
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:12px">
        <div><div style="font-size:26px;font-weight:700;letter-spacing:-0.01em">缺集</div><div style="font-size:12px;color:{T3};margin-top:4px">4 部作品缺 11 集 · 只計已播出</div></div>
        {miss("黄泉使者", 4, 8, "EP 5–8", True)}{miss("夏日重现", 12, 13, "EP 7", False)}{miss("左撇子艾伦", 3, 4, "EP 2", True)}
      </div>
      <div style="width:460px;flex-shrink:0;display:flex;flex-direction:column;gap:10px"><div class="card" style="padding:12px;display:flex;flex-direction:column;gap:8px"><div class="row" style="justify-content:space-between"><span style="font-size:13px;font-weight:700;color:#fff">黄泉使者 · 缺集搜尋</span><span class="seg"><span class="on">全部</span><span>Mikan</span><span>Nyaa</span></span></div>{results}<div class="row" style="gap:8px;padding-top:4px"><span class="btn acc" style="padding:6px 12px;font-size:12px">全部下載 (3)</span><span class="btn sec" style="padding:6px 12px;font-size:12px">同時建立自動規則</span></div></div></div>
    </div>"""
    return doc(wrap(inner))


def ab_torrent_search() -> str:
    provs = "".join(f'<span class="chip{" on" if p in ("Mikan", "Nyaa") else ""}">{p}</span>' for p in ["Mikan", "Nyaa", "DMHY", "ACG.rip", "Bangumi.moe", "DandanPlay"])
    head = "".join(f'<span style="{s};font-size:11px;font-weight:700;color:{T3}">{n}</span>' for n, s in [("標題", "flex:1"), ("字幕組", "width:110px"), ("解析度", "width:70px"), ("大小", "width:70px"), ("做種", "width:60px"), ("日期", "width:80px"), ("", "width:150px")])
    rows = ""
    for i, (t, g, r, s, sd, d) in enumerate([("[SubsPlease] Sousou no Frieren - 13 (1080p) [F1E2D3C4].mkv", "SubsPlease", "1080p", "1.4 GB", 1203, "今天"), ("[Erai-raws] Sousou no Frieren - 13 [1080p][Multiple Subtitle].mkv", "Erai-raws", "1080p", "1.3 GB", 640, "今天"),
                                             ("【喵萌奶茶屋】★01月新番★[葬送的芙莉莲][13][1080p][简繁内封].mkv", "喵萌奶茶屋", "1080p", "1.2 GB", 512, "今天"), ("[ANi] 葬送的芙莉蓮 - 13 [1080P][Baha][WEB-DL][AAC AVC][CHT].mp4", "ANi", "1080p", "690 MB", 388, "昨天"), ("[Sakurato] Sousou no Frieren [13][AVC-8bit 1080p AAC][CHT].mp4", "Sakurato", "1080p", "1.1 GB", 210, "昨天")]):
        rows += (f'<div class="row" style="gap:12px;height:44px;padding:0 12px;border-radius:6px;background:{"rgba(255,255,255,.03)" if i % 2 else "transparent"}"><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{mono(t)}</span><span style="width:110px;font-size:12px;color:{T2}">{g}</span><span style="width:70px"><span class="chip" style="font-size:10px;padding:2px 6px;border-radius:4px">{r}</span></span><span style="width:70px;font-size:12px;color:{T2}">{s}</span><span style="width:60px;font-size:12px;color:#4ade80">↑{sd}</span><span style="width:80px;font-size:12px;color:{T3}">{d}</span>'
                 f'<span style="width:150px;display:flex;gap:6px;justify-content:flex-end"><span class="btn sec" style="padding:4px 10px;font-size:11px">{ic("download", 12)}下載</span><span class="btn sec" style="padding:4px 10px;font-size:11px">{ic("rss", 12)}訂閱</span></span></div>')
    inner = f"""{sidebar("下載")}{toolbar("下載 › 搜尋種子", search="葬送的芙莉莲 13")}{window_top()}
    <div style="position:absolute;left:260px;right:32px;top:72px;display:flex;flex-direction:column;gap:14px">
      <div class="row" style="justify-content:space-between"><div><div style="font-size:26px;font-weight:700;letter-spacing:-0.01em">「葬送的芙莉莲 13」</div><div style="font-size:12px;color:{T3};margin-top:4px">23 個結果 · 2 provider · 0.8s</div></div><span class="row" style="gap:8px"><span class="field" style="height:30px;color:{T1}">排序 <span style="color:{T2}">做種</span>{ic("chevd", 12, 2)}</span><span class="field" style="height:30px;color:{T1}">下載到 <span style="color:{T2}">NAS Anime</span>{ic("chevd", 12, 2)}</span></span></div>
      <div class="row" style="gap:8px"><span style="font-size:12px;color:{T3}">來源</span>{provs}<span style="flex:1"></span>{seg(["全部", "1080p", "4K", "簡", "繁"], "1080p")}</div>
      <div class="card" style="overflow:hidden"><div class="row" style="gap:12px;height:36px;padding:0 12px;border-bottom:1px solid rgba(255,255,255,.06)">{head}</div>{rows}</div>
      <div style="font-size:11px;color:{T3}">「訂閱」會以此字幕組 + 解析度建立 RSS 規則（POST /subscribe），之後每集自動下載。</div>
    </div>"""
    return doc(wrap(inner))


def ab_subscribe_sheet() -> str:
    inner = f"""
    <div style="display:flex;flex-direction:column;gap:14px">
      <div class="row" style="gap:12px"><div style="width:48px;height:68px;border-radius:4px;background:{anime_gradient("葬送的芙莉莲")}"></div><div><div style="font-size:15px;font-weight:700;color:#fff">葬送的芙莉莲</div><div style="font-size:11px;color:{T3}">Bangumi 400602 · 放送中 · 每週五</div></div></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px">來源</div>{seg(["Mikan", "Nyaa", "DMHY"], "Mikan")}</div>
        <div><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px">字幕組</div>{select("SubsPlease", 200)}</div>
        <div><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px">解析度</div>{seg(["720p", "1080p", "4K", "任何"], "1080p")}</div>
        <div><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px">媒體庫</div>{select("NAS Anime", 200)}</div>
      </div>
      <div class="card" style="padding:10px 12px;display:flex;flex-direction:column;gap:6px"><div style="font-size:11px;font-weight:700;color:{T3}">預覽符合項目（最近 3 筆）</div>{"".join(f"<div>{mono(t)}</div>" for t in ["[SubsPlease] Sousou no Frieren - 13 (1080p).mkv", "[SubsPlease] Sousou no Frieren - 12 (1080p).mkv", "[SubsPlease] Sousou no Frieren - 11 (1080p).mkv"])}</div>
      <div class="row" style="gap:8px;font-size:12px;color:{T2}">{toggle(True)}回補已播出但缺少的集數（EP 1–10）</div>
    </div>"""
    return sheet(inner, 640, 520, "一鍵訂閱", "建立 RSS feed + 下載規則，之後每集自動下載。", '<span class="btn sec">取消</span><span class="btn sec">進階規則…</span><span class="btn acc">訂閱</span>')


def ab_rule_editor() -> str:
    feeds = "".join(f'<div class="row" style="gap:8px;font-size:12px;color:{T1}"><span style="width:14px;height:14px;border-radius:4px;background:{ACCENT if on else "rgba(255,255,255,.06)"};box-shadow:inset 0 0 0 1px rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;color:#14082e">{ic("check", 10, 3) if on else ""}</span>{n}</div>' for n, on in [("Mikan · 葬送的芙莉莲 (SubsPlease)", True), ("Nyaa · Erai-raws 綜合", True), ("DMHY · 全站", False)])
    matches = "".join(f'<div class="row" style="gap:8px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.04)"><span style="color:{"#4ade80" if ok else "#f87171"}">{ic("check" if ok else "x", 12, 2.5)}</span><span style="flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{mono(t)}</span><span style="font-size:10px;color:{T3}">{r}</span></div>'
                      for t, ok, r in [("[SubsPlease] Sousou no Frieren - 13 (1080p).mkv", True, "EP 13"), ("[SubsPlease] Sousou no Frieren - 13 (720p).mkv", False, "解析度"), ("[SubsPlease] Sousou no Frieren - 13v2 (1080p).mkv", True, "EP 13 (v2)"), ("[Erai-raws] Sousou no Frieren - 13 [1080p].mkv", False, "字幕組")])
    inner = f"""
    <div style="display:flex;gap:20px;height:100%">
      <div style="flex:1;display:flex;flex-direction:column;gap:12px">
        <div><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px">名稱</div><div class="field" style="height:32px;color:{T1}">葬送的芙莉莲 · SubsPlease 1080p</div></div>
        <div><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px">套用到 feeds</div><div style="display:flex;flex-direction:column;gap:6px">{feeds}</div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px">包含 (regex)</div><div class="field" style="height:32px">{mono("Sousou no Frieren.*1080p")}</div></div>
          <div><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px">排除 (regex)</div><div class="field" style="height:32px">{mono("720p|HEVC-10bit|\\[Batch\\]")}</div></div>
          <div><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px">字幕組</div>{select("SubsPlease", 0).replace("width:0px", "width:100%")}</div>
          <div><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px">解析度</div>{seg(["任何", "1080p", "4K"], "1080p")}</div>
          <div><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px">最少做種</div><div class="field" style="height:32px;color:{T1}">10</div></div>
          <div><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px">集數範圍 / 位移</div><div class="row" style="gap:6px"><div class="field" style="height:32px;color:{T1};flex:1">1–28</div><div class="field" style="height:32px;color:{T1};width:70px">+0</div></div></div>
        </div>
        <div class="row" style="gap:10px"><div style="flex:1"><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px">下載到</div>{select("NAS Anime", 0).replace("width:0px", "width:100%")}</div><div class="row" style="gap:8px;font-size:12px;color:{T2};padding-top:18px">{toggle(True)}啟用</div></div>
      </div>
      <div style="width:300px;display:flex;flex-direction:column;gap:8px"><div class="card" style="padding:10px 12px"><div class="row" style="justify-content:space-between;margin-bottom:6px"><span style="font-size:11px;font-weight:700;color:{T3}">即時預覽（最近 feed 項目）</span><span style="font-size:10px;color:{ACCENT}">2 / 4 符合</span></div>{matches}</div><div style="font-size:11px;color:{T3};line-height:1.5">規則存在伺服器（/download-rules），web 與 mac 共用；編輯後立即重新比對最近項目。</div></div>
    </div>"""
    return sheet(inner, 860, 600, "下載規則", "RSS 項目符合條件時自動加入下載。", '<span class="btn sec" style="margin-right:auto;color:#f87171">刪除規則</span><span class="btn sec">取消</span><span class="btn acc">儲存</span>')


def ab_add_link_sheet() -> str:
    inner = f"""
    <div style="display:flex;flex-direction:column;gap:12px">
      <div><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px">magnet / torrent URL / HTTP</div><div class="field" style="height:64px;align-items:flex-start;padding-top:8px;color:{T1};word-break:break-all;white-space:normal">{mono("magnet:?xt=urn:btih:3a4f…&dn=%5BSubsPlease%5D%20Sousou%20no%20Frieren%20-%2013%20%281080p%29")}</div></div>
      <div class="card" style="padding:10px 12px;display:flex;gap:10px;align-items:center"><span style="color:#4ade80">{ic("check", 14, 2.5)}</span><div style="flex:1"><div style="font-size:12px;color:#fff">[SubsPlease] Sousou no Frieren - 13 (1080p).mkv</div><div style="font-size:11px;color:{T3}">1.4 GB · 辨識為 <span style="color:#fff">葬送的芙莉莲 EP 13</span></div></div></div>
      <div class="row" style="gap:12px"><div style="flex:1"><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px">媒體庫</div>{select("NAS Anime", 0).replace("width:0px", "width:100%")}</div><div class="row" style="gap:8px;font-size:12px;color:{T2};padding-top:18px">{toggle(True)}完成後自動匹配</div></div>
    </div>"""
    return sheet(inner, 560, 360, "新增下載", "也可以直接把連結或 .torrent 拖到視窗 / Dock 圖示。", '<span class="btn sec">取消</span><span class="btn acc">加入</span>')


# ---------------------------------------------------------------- player states
def inspector_tracks(tab: str) -> str:
    tabs = "".join(f'<span class="{"on" if t == tab else ""}" style="padding:10px 0 12px;font-size:12px;font-weight:600">{t + (" 17" if t == "彈幕" else "")}</span>' for t in ["集數", "彈幕", "來源", "字幕", "音訊", "視訊"])
    def track(n: str, meta: str, on: bool, tag: str = "") -> str:
        return (f'<div class="row" style="gap:10px;padding:8px 10px;border-radius:8px;background:{"rgba(167,139,250,.12)" if on else "transparent"}"><span style="width:14px;color:{ACCENT}">{ic("check", 14, 2.5) if on else ""}</span><div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:600;color:#fff">{n}</div><div style="font-size:10px;color:{T3}">{meta}</div></div>'
                + (f'<span class="chip" style="font-size:9px;padding:2px 6px">{tag}</span>' if tag else "") + '</div>')
    if tab == "字幕":
        body = (f'<div style="padding:12px 14px;display:flex;flex-direction:column;gap:10px">'
                f'<div style="font-size:11px;font-weight:700;color:{T3}">主字幕</div>'
                + track("繁體中文", "內嵌 · ASS · 喵萌奶茶屋", True, "內嵌") + track("简体中文", "內嵌 · ASS", False, "內嵌") + track("日本語", "內嵌 · PGS", False, "內嵌") + track("English", "外掛 · srt · 伺服器 sidecar", False, "外掛") + track("關", "", False)
                + f'<div style="font-size:11px;font-weight:700;color:{T3};margin-top:6px">副字幕（上方）</div>' + track("日本語", "內嵌 · PGS", True) + track("關", "", False)
                + f'<div class="card" style="padding:10px 12px;display:flex;flex-direction:column;gap:8px;margin-top:6px"><div class="row" style="justify-content:space-between"><span style="font-size:12px;color:{T1}">延遲</span><span class="row" style="gap:6px"><span class="kbd">Z</span><span style="font-size:12px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums;width:50px;text-align:center">-0.3s</span><span class="kbd">X</span></span></div>'
                + f'<div class="row" style="justify-content:space-between"><span style="font-size:12px;color:{T1}">樣式</span>{seg(["原生 ASS", "動漫", "自訂"], "原生 ASS")}</div><div class="row" style="justify-content:space-between"><span style="font-size:12px;color:{T1}">大小</span><span class="slider" style="max-width:120px"><i style="width:45%"></i><b style="left:45%"></b></span></div></div>'
                + f'<div style="border:1px dashed rgba(255,255,255,.12);border-radius:8px;padding:10px;text-align:center;font-size:11px;color:{T3}">拖放 .srt / .ass / .vtt 到播放器載入</div></div>')
    else:  # 音訊 + 視訊 combined view
        body = (f'<div style="padding:12px 14px;display:flex;flex-direction:column;gap:10px">'
                f'<div style="font-size:11px;font-weight:700;color:{T3}">音軌</div>' + track("日本語", "AAC 2.0 · 192 kbps", True) + track("廣東話", "AAC 2.0 · TVB 配音", False)
                + f'<div class="card" style="padding:10px 12px;display:flex;flex-direction:column;gap:8px"><div class="row" style="justify-content:space-between"><span style="font-size:12px;color:{T1}">輸出裝置</span>{select("MacBook Pro 揚聲器", 160)}</div><div class="row" style="justify-content:space-between"><span style="font-size:12px;color:{T1}">音訊延遲</span><span style="font-size:12px;font-weight:700;color:#fff">0 ms</span></div><div class="row" style="justify-content:space-between"><span style="font-size:12px;color:{T1}">變速不變調</span>{toggle(True)}</div></div>'
                + f'<div style="font-size:11px;font-weight:700;color:{T3};margin-top:6px">視訊</div>'
                + f'<div class="card" style="padding:10px 12px;display:flex;flex-direction:column;gap:8px"><div class="row" style="justify-content:space-between"><span style="font-size:12px;color:{T1}">Anime4K</span>{seg(["關", "Fast", "Balanced", "HQ"], "Balanced")}</div><div class="row" style="justify-content:space-between"><span style="font-size:12px;color:{T1}">畫面比例</span>{seg(["自動", "16:9", "4:3", "填滿"], "自動")}</div><div class="row" style="justify-content:space-between"><span style="font-size:12px;color:{T1}">插幀</span>{toggle(False)}</div><div class="row" style="justify-content:space-between"><span style="font-size:12px;color:{T1}">去交錯</span>{toggle(False)}</div><div class="row" style="justify-content:space-between"><span style="font-size:12px;color:{T1}">旋轉</span>{seg(["0°", "90°", "180°", "270°"], "0°")}</div></div>'
                + f'<div style="font-size:11px;color:{T3};line-height:1.6">1920×1080 · HEVC Main10 · 23.976 fps<br>hwdec <span style="color:#4ade80">videotoolbox</span> · vo libmpv · 丟幀 0<br>來源 本機路徑 /Volumes/anime/…（直開）</div></div>')
    return (f'<div style="position:absolute;right:0;top:0;bottom:0;width:360px;background:rgba(12,12,12,.92);backdrop-filter:blur(30px);border-left:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;z-index:4">'
            f'<div class="tabs" style="margin:44px 14px 0">{tabs}</div><div style="flex:1;overflow:hidden">{body}</div></div>')


def ab_player_tracks(tab: str) -> str:
    vw = W - 360
    inner = (f'<div style="position:absolute;left:0;top:0;width:{vw}px;height:{H}px">{video_area(vw, H)}{osc(vw - 48, 24, 24, peek=False)}</div>{inspector_tracks(tab)}{window_top()}')
    return doc(wrap(inner, bg="#000"))


def ab_player_fullscreen() -> str:
    inner = (f'<div style="position:absolute;inset:0">{video_area(W, H, title_overlay=False)}'
             f'<div style="position:absolute;left:0;right:0;top:0;height:120px;background:linear-gradient(to bottom, rgba(0,0,0,.6), transparent)"></div>'
             f'<div style="position:absolute;left:32px;top:26px"><div style="font-size:18px;font-weight:700;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.6)">尖帽子的魔法工房</div><div style="font-size:13px;color:rgba(255,255,255,.7);text-shadow:0 1px 6px rgba(0,0,0,.6)">EP 1 · 魔法的開端</div></div>'
             f'<div style="position:absolute;right:32px;top:28px;display:flex;gap:8px"><span class="glass" style="border-radius:999px;padding:6px 12px;font-size:12px;font-weight:600;color:#fff;display:flex;gap:6px;align-items:center">{ic("clock", 13)}22:41</span><span class="glass" style="border-radius:999px;padding:6px 10px;color:#fff;display:flex;align-items:center">{ic("sidebar", 16)}</span></span></div>'
             f'{osc(W - 160, 80, 32, peek=False)}</div>')
    return doc(f'<div style="width:{W}px;height:{H}px;position:relative;overflow:hidden;background:#000">{inner}</div>')


def ab_player_help() -> str:
    groups = [("播放", [("Space", "播放 / 暫停"), ("← →", "±5 秒"), ("⇧← ⇧→", "±30 秒"), (", .", "逐幀"), ("[ ]", "倍速"), ("N", "下一集"), ("S", "跳過 OP/ED"), ("L", "A-B 循環")]),
              ("彈幕 / 字幕", [("D", "彈幕開關"), ("⇧D", "彈幕設定"), ("⌘↩", "發送彈幕"), ("C", "字幕開關"), ("V", "下一字幕軌"), ("Z X", "字幕延遲")]),
              ("音量 / 視窗", [("↑ ↓", "音量"), ("M", "靜音"), ("F", "全螢幕"), ("P", "Mini 播放器"), ("T", "側欄"), ("⌘⇧S", "截圖"), ("I", "技術資訊"), ("?", "此說明")])]
    cols = ""
    for g, items in groups:
        rows = "".join(f'<div class="row" style="gap:10px;padding:5px 0"><span class="row" style="gap:4px;width:80px">{"".join(f"<span class=kbd style=font-size:11px;padding:3px_7px>{k}</span>" for k in key.split(" "))}</span><span style="font-size:12px;color:{T1}">{a}</span></div>' for key, a in items)
        cols += f'<div><div style="font-size:11px;font-weight:700;color:{T3};letter-spacing:.04em;margin-bottom:6px">{g}</div>{rows}</div>'
    inner = (f'<div style="position:absolute;inset:0">{video_area(W, H, danmaku=False, subtitle=False)}<div style="position:absolute;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(6px)"></div>'
             f'<div class="glass" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:860px;border-radius:18px;padding:22px 26px;display:flex;flex-direction:column;gap:16px">'
             f'<div class="row" style="justify-content:space-between"><span style="font-size:16px;font-weight:700;color:#fff">快捷鍵</span><span class="row" style="gap:8px"><span style="font-size:12px;color:{ACCENT};font-weight:600">自訂…</span><span class="kbd">esc</span></span></div>'
             f'<div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:24px">{cols}</div>'
             f'<div style="font-size:11px;color:{T3}">滑鼠：雙擊全螢幕 · 滾輪 seek（畫面右側：音量）· 捏合全螢幕 · 右鍵選單</div></div></div>')
    return doc(f'<div style="width:{W}px;height:{H}px;position:relative;overflow:hidden;background:#000">{inner}</div>')


def player_state(kind: str) -> str:
    w, h = 720, 405
    if kind == "buffering":
        ov = (f'<div class="glass" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border-radius:14px;padding:14px 18px;display:flex;align-items:center;gap:12px"><span style="width:18px;height:18px;border:2px solid {ACCENT};border-right-color:transparent;border-radius:50%"></span><div><div style="font-size:13px;font-weight:600;color:#fff">緩衝中 · 64%</div><div style="font-size:11px;color:{T3}">↓ 8.2 MB/s · 快取 12s · 直接串流</div></div></div>')
    elif kind == "error":
        ov = (f'<div class="glass" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:380px;border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;gap:10px"><div class="row" style="gap:10px"><span style="color:#f87171">{ic("info", 18)}</span><span style="font-size:13px;font-weight:700;color:#fff">無法播放此檔案</span></div><div style="font-size:12px;color:{T2};line-height:1.5">媒體庫「Seedbox」目前離線（SFTP 連線逾時）。</div><div class="row" style="gap:8px"><span class="btn pri" style="padding:6px 12px;font-size:12px">重試</span><span class="btn sec" style="padding:6px 12px;font-size:12px">選其他檔案</span><span style="margin-left:auto;font-size:11px;color:{ACCENT}">詳細記錄</span></div></div>')
    else:  # transcoding fallback
        ov = (f'<div class="glass" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:400px;border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;gap:10px"><div class="row" style="gap:10px"><span style="width:18px;height:18px;border:2px solid #fbbf24;border-right-color:transparent;border-radius:50%"></span><span style="font-size:13px;font-weight:700;color:#fff">伺服器轉碼中 · 38%</span></div><div style="font-size:12px;color:{T2};line-height:1.5">直接播放失敗（此來源不支援 Range）→ remux 失敗 → 改用 HLS 轉碼。預計 20 秒後開始。</div><div style="height:3px;border-radius:2px;background:rgba(255,255,255,.12)"><div style="width:38%;height:100%;background:#fbbf24;border-radius:2px"></div></div><div class="row" style="gap:8px"><span class="btn sec" style="padding:6px 12px;font-size:12px">取消</span><span style="margin-left:auto;font-size:11px;color:{T3}">等待 WS transcode:ready</span></div></div>')
    inner = f'<div style="position:absolute;inset:0">{video_area(w, h, danmaku=False, subtitle=False, scale=.5)}<div style="position:absolute;inset:0;background:rgba(0,0,0,.35)"></div>{ov}</div>'
    return doc(f'<div style="width:{w}px;height:{h}px;position:relative;overflow:hidden;background:#000;border-radius:10px;box-shadow:0 0 0 1px rgba(255,255,255,.12)">{inner}</div>')


def ab_player_context_menu() -> str:
    w, h = 720, 405
    def mi(label: str, key: str = "", sub: bool = False, sep: bool = False, danger: bool = False) -> str:
        if sep:
            return '<div style="height:1px;background:rgba(255,255,255,.08);margin:4px 10px"></div>'
        return f'<div class="row" style="gap:8px;padding:5px 12px;font-size:13px;color:{"#f87171" if danger else "#fff"}"><span style="flex:1">{label}</span>{"<span style=font-size:11px;color:" + T3 + ">" + key + "</span>" if key else ""}{ic("chevr", 12, 2, T3) if sub else ""}</div>'
    menu = (f'<div class="glass" style="position:absolute;left:300px;top:90px;width:230px;border-radius:10px;padding:5px 0">'
            + mi("暫停", "Space") + mi("下一集", "N") + mi("跳過 OP", "S") + mi("", sep=True) + mi("字幕", sub=True) + mi("音軌", sub=True) + mi("倍速 · 1.0×", sub=True) + mi("畫面比例", sub=True) + mi("Anime4K · Balanced", sub=True) + mi("", sep=True)
            + mi("彈幕 開", "D") + mi("彈幕設定…", "⇧D") + mi("", sep=True) + mi("截圖", "⌘⇧S") + mi("截圖（含字幕與彈幕）") + mi("", sep=True) + mi("Mini 播放器", "P") + mi("技術資訊", "I") + mi("在 Finder 顯示檔案") + '</div>')
    inner = f'<div style="position:absolute;inset:0">{video_area(w, h, subtitle=False, scale=.5)}{menu}</div>'
    return doc(f'<div style="width:{w}px;height:{h}px;position:relative;overflow:hidden;background:#000;border-radius:10px;box-shadow:0 0 0 1px rgba(255,255,255,.12)">{inner}</div>')


def ab_player_drop() -> str:
    w, h = 720, 405
    ov = (f'<div style="position:absolute;inset:12px;border:2px dashed rgba(167,139,250,.7);border-radius:14px;background:rgba(167,139,250,.1);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px">'
          f'<span style="color:{ACCENT}">{ic("cc", 32)}</span><div style="font-size:15px;font-weight:700;color:#fff">放開以載入字幕</div><div style="font-size:12px;color:{T2}">尖帽子的魔法工房 01.ass · 將作為主字幕</div></div>')
    inner = f'<div style="position:absolute;inset:0">{video_area(w, h, danmaku=False, subtitle=False, scale=.5)}{ov}</div>'
    return doc(f'<div style="width:{w}px;height:{h}px;position:relative;overflow:hidden;background:#000;border-radius:10px;box-shadow:0 0 0 1px rgba(255,255,255,.12)">{inner}</div>')


# ---------------------------------------------------------------- onboarding / system
def onboard_card(inner: str, title: str, subtitle: str) -> str:
    wall = "".join(f'<div style="aspect-ratio:2/3;border-radius:3px;background:{anime_gradient(n + str(i))}"></div>' for i, n in enumerate((SHOWS * 4)[:60]))
    body = f"""
    <div style="position:absolute;inset:0;overflow:hidden"><div style="position:absolute;left:-30%;right:-30%;top:-20%;bottom:-20%;transform:rotate(-12deg);display:grid;grid-template-columns:repeat(12, minmax(0, 1fr));gap:10px 5px;opacity:.9">{wall}</div><div style="position:absolute;inset:0;background:rgba(0,0,0,.55)"></div><div style="position:absolute;inset:0;background:linear-gradient(to bottom, rgba(7,7,7,.4), rgba(7,7,7,.95))"></div></div>
    {window_top()}
    <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:420px;display:flex;flex-direction:column;align-items:center">
      <div style="width:52px;height:52px;border-radius:14px;background:rgba(167,139,250,.1);box-shadow:inset 0 0 0 1px rgba(167,139,250,.2);display:flex;align-items:center;justify-content:center;margin-bottom:14px"><div style="width:30px;height:30px;border-radius:50%;background:radial-gradient(circle at 35% 35%, #c4b5fd, #6d28d9 70%);display:flex;align-items:center;justify-content:center">{ic("play", 12, 0, "#fff")}</div></div>
      <div style="font-size:22px;font-weight:700;color:#fff">{title}</div><div style="font-size:13px;font-weight:500;color:{T2};margin-top:4px;margin-bottom:24px;text-align:center">{subtitle}</div>
      <div style="width:100%;border-radius:14px;padding:24px;background:rgba(7,7,7,.7);backdrop-filter:blur(24px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06), 0 30px 60px rgba(0,0,0,.5);display:flex;flex-direction:column;gap:14px">{inner}</div>
    </div>"""
    return doc(wrap(body))


def ab_server_add() -> str:
    found = "".join(f'<div class="row" style="gap:10px;padding:8px 10px;border-radius:8px;background:{"rgba(167,139,250,.1)" if i == 0 else "rgba(255,255,255,.03)"}"><span style="color:#4ade80">{ic("server", 14)}</span><div style="flex:1"><div style="font-size:12px;font-weight:600;color:#fff">{n}</div><div>{mono(u)} <span style="font-size:10px;color:{T3}">· {v}</span></div></div><span class="btn sec" style="padding:4px 10px;font-size:11px">選擇</span></div>'
                    for i, (n, u, v) in enumerate([("home-nas", "https://milmil.home.arpa", "v0.1.17"), ("milmil on raspberrypi", "http://192.168.1.42:8080", "v0.1.15")]))
    inner = (f'<div><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px;display:flex;gap:6px;align-items:center">{ic("wifi", 12)}區網上找到（Bonjour）</div><div style="display:flex;flex-direction:column;gap:6px">{found}</div></div>'
             f'<div class="row" style="gap:10px;color:{T4};font-size:11px"><span style="flex:1;height:1px;background:rgba(255,255,255,.08)"></span>或輸入網址<span style="flex:1;height:1px;background:rgba(255,255,255,.08)"></span></div>'
             f'<div class="field" style="height:36px;font-size:13px;color:{T1}">https://</div><div class="btn sec" style="justify-content:center;height:36px">連線</div>')
    return onboard_card(inner, "新增伺服器", "milmil 伺服器的網址，或從區網自動發現。")


def ab_two_factor() -> str:
    digits = "".join(f'<span style="width:46px;height:52px;border-radius:10px;background:rgba(255,255,255,.06);box-shadow:inset 0 0 0 1px {"rgba(167,139,250,.8)" if i == 3 else "rgba(255,255,255,.08)"};display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums">{d}</span>' for i, d in enumerate(["4", "8", "2", "", "", ""]))
    inner = (f'<div style="display:flex;gap:8px;justify-content:center">{digits}</div><div style="font-size:11px;color:{T3};text-align:center">輸入驗證 app 的 6 位數代碼 · 支援從剪貼簿自動填入</div><div class="btn acc" style="justify-content:center;height:38px;opacity:.5">驗證</div><div style="font-size:11px;color:{T3};text-align:center">使用備用碼 · 返回</div>')
    return onboard_card(inner, "兩步驟驗證", "帳號 admin 已啟用 TOTP。")


def ab_setup_redirect() -> str:
    inner = (f'<div class="card" style="padding:14px;background:rgba(251,191,36,.06);display:flex;gap:10px"><span style="color:#fbbf24">{ic("info", 18)}</span><div style="font-size:12px;color:{T1};line-height:1.5">伺服器 <span style="color:#fff;font-weight:600">home-nas</span> 尚未建立管理員帳號。首次設定（建立帳號、第一個媒體庫、整合）請在瀏覽器完成，之後再回來登入。</div></div>'
             f'<div class="btn acc" style="justify-content:center;height:38px">{ic("link", 14)}在瀏覽器開啟 https://milmil.home.arpa/setup</div><div class="btn sec" style="justify-content:center;height:36px">{ic("refresh", 14)}已完成，重新檢查</div>')
    return onboard_card(inner, "伺服器尚未初始化", "需要先在 web 完成首次設定。")


def ab_connection_error() -> str:
    inner = (f'<div class="card" style="padding:14px;background:rgba(239,68,68,.06);display:flex;gap:10px"><span style="color:#f87171">{ic("wifi", 18)}</span><div style="font-size:12px;color:{T1};line-height:1.5">無法連線到 <span style="color:#fff;font-weight:600">home-nas</span>（https://milmil.home.arpa）<br><span style="color:{T3}">NSURLErrorDomain -1004 · 連線被拒 · 14:32:05</span></div></div>'
             f'<div style="font-size:12px;color:{T2};line-height:1.6">• 確認伺服器已啟動（docker compose ps）<br>• 若在外網，確認 VPN / 反向代理<br>• 自簽憑證需在 設定 › 伺服器 允許</div>'
             f'<div class="btn acc" style="justify-content:center;height:38px">{ic("refresh", 14)}重試</div><div class="row" style="gap:8px"><div class="btn sec" style="flex:1;justify-content:center">切換伺服器</div><div class="btn sec" style="flex:1;justify-content:center">離線瀏覽快取</div></div>')
    return onboard_card(inner, "連線中斷", "已自動重試 3 次。")


def ab_menubar_extra() -> str:
    w, h = 360, 420
    inner = f"""
    <div style="position:absolute;left:0;right:0;top:0;height:24px;background:rgba(30,30,32,.9);backdrop-filter:blur(20px);display:flex;align-items:center;justify-content:flex-end;gap:14px;padding:0 12px;font-size:12px;color:#fff;border-bottom:1px solid rgba(255,255,255,.08)"><span style="display:flex;align-items:center;gap:4px;background:rgba(255,255,255,.18);border-radius:4px;padding:1px 6px">{ic("play", 11, 0, "#fff")}<span style="font-size:11px">EP 1 · 09:02</span></span>{ic("wifi", 14)}<span>14:32</span></div>
    <div class="glass" style="position:absolute;right:96px;top:30px;width:300px;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:10px">
      <div class="row" style="gap:10px"><div style="width:56px;height:56px;border-radius:8px;background:{anime_gradient("尖帽子的魔法工房")};flex-shrink:0"></div><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">尖帽子的魔法工房</div><div style="font-size:11px;color:{T3}">EP 1 · 魔法的開端</div><div style="height:3px;border-radius:2px;background:rgba(255,255,255,.12);margin-top:8px"><div style="width:38%;height:100%;background:{ACCENT};border-radius:2px"></div></div></div></div>
      <div class="row" style="justify-content:center;gap:6px;color:#fff">{ic("prev", 16)}<span style="width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center">{ic("pause", 18)}</span>{ic("next", 16)}<span style="width:18px"></span>{ic("danmaku", 16, 0, ACCENT)}{ic("mini", 16)}</div>
      <div style="height:1px;background:rgba(255,255,255,.08)"></div>
      <div style="font-size:11px;font-weight:700;color:{T3}">下載</div>
      <div class="row" style="gap:8px"><span style="font-size:12px;color:#fff;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">葬送的芙莉莲 EP 13</span><span style="width:80px;height:3px;border-radius:2px;background:rgba(255,255,255,.12)"><span style="display:block;width:64%;height:100%;background:{ACCENT};border-radius:2px"></span></span><span style="font-size:11px;color:{T3}">12.4 MB/s</span></div>
      <div class="row" style="gap:8px"><span style="font-size:12px;color:{T2};flex:1">葬送的芙莉莲 EP 14</span><span style="font-size:11px;color:{T3}">排隊</span></div>
      <div style="height:1px;background:rgba(255,255,255,.08)"></div>
      <div style="font-size:11px;font-weight:700;color:{T3}">今天</div>
      <div class="row" style="gap:8px;font-size:12px;color:#fff"><span style="color:{T3};font-variant-numeric:tabular-nums">20:55</span>黄泉使者 EP 5</div>
      <div class="row" style="gap:8px;font-size:12px;color:#fff"><span style="color:{T3};font-variant-numeric:tabular-nums">22:30</span>夏日重现 EP 7</div>
      <div style="height:1px;background:rgba(255,255,255,.08)"></div>
      <div class="row" style="justify-content:space-between;font-size:12px;color:{T2}"><span>開啟 milmil</span><span>設定…</span><span>結束</span></div>
    </div>"""
    return doc(f'<div style="width:{w}px;height:{h}px;position:relative;overflow:hidden;border-radius:10px;background:{anime_gradient("desktop")}">{inner}</div>')


def ab_system_integration() -> str:
    w, h = 1080, 620
    dock = (f'<div class="glass" style="position:absolute;left:60px;top:236px;width:240px;border-radius:10px;padding:5px 0">'
            + "".join(f'<div class="row" style="padding:5px 12px;font-size:13px;color:#fff;gap:8px">{t}</div>' for t in ["繼續播放：尖帽子的魔法工房 EP 1", "下一集", "今天播出（2）"]) + '<div style="height:1px;background:rgba(255,255,255,.08);margin:4px 10px"></div>'
            + "".join(f'<div class="row" style="padding:5px 12px;font-size:13px;color:#fff">{t}</div>' for t in ["新增下載…", "全部掃描"]) + '<div style="height:1px;background:rgba(255,255,255,.08);margin:4px 10px"></div>'
            + "".join(f'<div class="row" style="padding:5px 12px;font-size:13px;color:#fff">{t}</div>' for t in ["選項", "顯示所有視窗", "隱藏", "結束"]) + '</div>')
    dockicon = (f'<div style="position:absolute;left:140px;top:548px;width:56px;height:56px;border-radius:14px;background:radial-gradient(circle at 35% 35%, #c4b5fd, #6d28d9 70%);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 20px rgba(0,0,0,.5)">{ic("play", 22, 0, "#fff")}<span style="position:absolute;top:-6px;right:-6px;background:#ef4444;color:#fff;font-size:11px;font-weight:700;border-radius:999px;padding:2px 7px;box-shadow:0 0 0 2px #000">3</span></div>')
    banner = (f'<div class="glass" style="position:absolute;right:40px;top:40px;width:360px;border-radius:14px;padding:12px 14px;display:flex;gap:12px;align-items:center;background:rgba(40,40,44,.85)"><div style="width:40px;height:40px;border-radius:10px;background:radial-gradient(circle at 35% 35%, #c4b5fd, #6d28d9 70%);display:flex;align-items:center;justify-content:center;flex-shrink:0">{ic("play", 16, 0, "#fff")}</div><div style="flex:1;min-width:0"><div class="row" style="justify-content:space-between"><span style="font-size:13px;font-weight:700;color:#fff">下載完成</span><span style="font-size:11px;color:{T3}">現在</span></div><div style="font-size:12px;color:{T2};line-height:1.4">葬送的芙莉莲 EP 13 已加入 NAS Anime，已自動匹配。</div></div></div>'
              f'<div class="glass" style="position:absolute;right:40px;top:130px;width:360px;border-radius:14px;padding:12px 14px;display:flex;gap:12px;align-items:center;background:rgba(40,40,44,.85)"><div style="width:40px;height:40px;border-radius:10px;background:radial-gradient(circle at 35% 35%, #c4b5fd, #6d28d9 70%);display:flex;align-items:center;justify-content:center;flex-shrink:0">{ic("calendar", 16, 0, "#fff")}</div><div style="flex:1;min-width:0"><div class="row" style="justify-content:space-between"><span style="font-size:13px;font-weight:700;color:#fff">10 分鐘後播出</span><span style="font-size:11px;color:{T3}">現在</span></div><div style="font-size:12px;color:{T2};line-height:1.4">黄泉使者 EP 5 · 20:55 · 訂閱規則會自動下載</div></div><div style="display:flex;flex-direction:column;gap:4px"><span class="btn sec" style="padding:4px 10px;font-size:11px">提醒我</span></div></div>')
    drop = (f'<div style="position:absolute;left:420px;top:240px;width:560px;height:300px;border-radius:14px;background:rgba(7,7,7,.8);box-shadow:0 0 0 1px rgba(255,255,255,.1)">'
            f'<div style="position:absolute;inset:14px;border:2px dashed rgba(167,139,250,.7);border-radius:12px;background:rgba(167,139,250,.1);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px"><span style="color:{ACCENT}">{ic("magnet", 32)}</span><div style="font-size:15px;font-weight:700;color:#fff">放開以加入下載</div><div style="font-size:12px;color:{T2}">magnet · 辨識為 葬送的芙莉莲 EP 13 · 將下載到 NAS Anime</div></div></div>')
    labels = (f'<div style="position:absolute;left:60px;top:206px;font-size:11px;font-weight:700;color:{T3}">Dock 右鍵選單 + badge</div><div style="position:absolute;right:40px;top:18px;font-size:11px;font-weight:700;color:{T3}">系統通知（UNUserNotificationCenter）</div><div style="position:absolute;left:420px;top:214px;font-size:11px;font-weight:700;color:{T3}">拖放 magnet / .torrent 到主視窗</div>')
    inner = f'<div style="position:absolute;inset:0;background:{anime_gradient("desktop2")}"><div style="position:absolute;inset:0;background:rgba(0,0,0,.45)"></div>{labels}{dock}{dockicon}{banner}{drop}</div>'
    return doc(f'<div style="width:{w}px;height:{h}px;position:relative;overflow:hidden;border-radius:10px">{inner}</div>')


# ---------------------------------------------------------------- states & menus
def ab_hover_card() -> str:
    w, h = 720, 420
    card = (f'<div class="glass" style="position:absolute;left:250px;top:40px;width:400px;border-radius:14px;overflow:hidden">'
            f'<div style="height:150px;background:{anime_gradient("尖帽子的魔法工房 banner")};position:relative"><div style="position:absolute;inset:0;background:linear-gradient(to top, rgba(18,18,20,.95), transparent 60%)"></div><div style="position:absolute;left:14px;bottom:10px;font-size:18px;font-weight:800;color:#fff;letter-spacing:-0.01em">尖帽子的魔法工房</div><div style="position:absolute;right:12px;top:10px" class="row"><span class="chip" style="font-size:10px;padding:2px 7px;background:rgba(59,130,246,.8);color:#fff">在看</span></div></div>'
            f'<div style="padding:12px 14px;display:flex;flex-direction:column;gap:8px"><div class="row" style="gap:8px"><span class="btn pri" style="padding:6px 14px;font-size:12px">{ic("play", 12)}繼續 EP 1 · 剩 7 分鐘</span><span class="btn sec" style="padding:6px 10px;font-size:12px">{ic("plus", 12, 2)}</span><span class="btn sec" style="padding:6px 10px;font-size:12px">{ic("info", 12)}</span></div>'
            f'<div class="row" style="gap:8px;font-size:12px;color:{T2}"><span style="color:{ACCENT};font-weight:700">♥ 7.1</span><span>2026 春</span><span>13 集</span><span style="color:#4ade80">5 集已下載</span></div>'
            f'<div class="row" style="gap:6px"><span class="chip" style="font-size:11px">奇幻</span><span class="chip" style="font-size:11px">冒險</span><span class="chip" style="font-size:11px">漫畫改編</span></div>'
            f'<div style="font-size:12px;color:{T2};line-height:1.55;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">眾人皆以為魔法是與生俱來的血統，可可卻意外撞見了通往魔女之路的另一種可能，這也讓她陷入左右世界命運的爭鬥核心。</div>'
            f'<div style="font-size:11px;color:{T3}">下一集 EP 6 · 週二 23:00</div></div></div>')
    inner = f'<div style="position:absolute;inset:0;background:{BG}">{poster("尖帽子的魔法工房", 150, 225, score=7.1, cnt="13 集", lift=True).replace("<div style=\"width:150px;flex-shrink:0\">", "<div style=\"position:absolute;left:60px;top:60px;width:150px\">")}{card}<div style="position:absolute;left:60px;bottom:16px;font-size:11px;color:{T3}">hover 250ms → 海報 lift；停留 400ms → 右側 hover card（對應 web AnimeCard 的 hover card）</div></div>'
    return doc(f'<div style="width:{w}px;height:{h}px;position:relative;overflow:hidden;border-radius:10px;box-shadow:0 0 0 1px rgba(255,255,255,.12)">{inner}</div>')


def ab_context_menus() -> str:
    w, h = 900, 420
    def menu(x: int, y: int, title: str, items: list[tuple[str, str]]) -> str:
        rows = ""
        for t, k in items:
            if t == "-":
                rows += '<div style="height:1px;background:rgba(255,255,255,.08);margin:4px 10px"></div>'
            else:
                rows += f'<div class="row" style="gap:8px;padding:5px 12px;font-size:13px;color:{"#f87171" if "刪除" in t else "#fff"}"><span style="flex:1">{t}</span>{"<span style=font-size:11px;color:" + T3 + ">" + k + "</span>" if k and k != ">" else ""}{ic("chevr", 12, 2, T3) if k == ">" else ""}</div>'
        return f'<div style="position:absolute;left:{x}px;top:{y}px;width:230px"><div style="font-size:11px;font-weight:700;color:{T3};margin-bottom:6px">{title}</div><div class="glass" style="border-radius:10px;padding:5px 0">{rows}</div></div>'
    m1 = menu(30, 30, "海報右鍵", [("播放", "↩"), ("繼續 EP 1", ""), ("-", ""), ("收藏狀態 · 在看", ">"), ("評分", ">"), ("-", ""), ("搜尋資源", ""), ("在 Bangumi 開啟", ""), ("複製標題", "⌘C"), ("-", ""), ("從繼續觀看移除", "")])
    m2 = menu(320, 30, "集數右鍵", [("播放", "↩"), ("從頭播放", ""), ("-", ""), ("標記為已看", ""), ("標記為未看", ""), ("-", ""), ("設為偏好檔案", ">"), ("搜尋此集資源", ""), ("在 Finder 顯示", ""), ("-", ""), ("檔案資訊", "I")])
    m3 = menu(610, 30, "收藏狀態（子選單）", [("無", ""), ("✓ 在看", ""), ("想看", ""), ("看過", ""), ("擱置", ""), ("抛棄", ""), ("-", ""), ("同步到 AniList · Bangumi · Trakt", "")])
    inner = f'<div style="position:absolute;inset:0;background:{BG}">{m1}{m2}{m3}</div>'
    return doc(f'<div style="width:{w}px;height:{h}px;position:relative;overflow:hidden;border-radius:10px;box-shadow:0 0 0 1px rgba(255,255,255,.12)">{inner}</div>')


def ab_empty_states() -> str:
    w, h = 1080, 420
    def es(x: int, title: str, icon: str, head: str, body: str, cta: str) -> str:
        return (f'<div style="position:absolute;left:{x}px;top:20px;width:330px;height:380px;border-radius:12px;background:rgba(255,255,255,.02);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;text-align:center">'
                f'<div style="position:absolute;left:12px;top:10px;font-size:11px;font-weight:700;color:{T3}">{title}</div><span style="width:56px;height:56px;border-radius:16px;background:rgba(167,139,250,.1);display:flex;align-items:center;justify-content:center;color:{ACCENT}">{ic(icon, 26)}</span>'
                f'<div style="font-size:15px;font-weight:700;color:#fff">{head}</div><div style="font-size:12px;color:{T3};line-height:1.55">{body}</div><span class="btn sec" style="padding:6px 12px;font-size:12px;margin-top:4px">{cta}</span></div>')
    inner = (f'<div style="position:absolute;inset:0;background:{BG}">'
             + es(20, "首頁 · 無繼續觀看", "play", "還沒開始看任何作品", "從時刻表挑一部，或打開媒體庫裡已匹配的作品。", "去探索")
             + es(375, "媒體庫 · 空", "folder", "還沒有媒體庫", "加入本機資料夾或 NAS 分享，milmil 會掃描、比對並抓取中繼資料與彈幕。", "新增媒體庫")
             + es(730, "搜尋 · 無結果", "search", "找不到「魔法少女まどか」", "試試原名或英文名；⌘K 同時搜尋 Bangumi。", "搜尋種子資源") + '</div>')
    return doc(f'<div style="width:{w}px;height:{h}px;position:relative;overflow:hidden;border-radius:10px;box-shadow:0 0 0 1px rgba(255,255,255,.12)">{inner}</div>')


def ab_skeleton() -> str:
    sk = lambda w_, h_, r=6: f'<div style="width:{w_}px;height:{h_}px;border-radius:{r}px;background:rgba(255,255,255,.05)"></div>'
    hero = (f'<div style="position:absolute;left:260px;top:120px;display:flex;gap:32px;align-items:center">{sk(220, 320)}<div style="display:flex;flex-direction:column;gap:14px">{sk(360, 40)}{sk(280, 20, 999)}{sk(560, 16)}{sk(500, 16)}<div class="row" style="gap:10px">{sk(110, 34)}{sk(70, 34)}</div></div></div>')
    shelf = (f'<div style="position:absolute;left:260px;right:32px;top:540px;display:flex;flex-direction:column;gap:32px"><div>{sk(90, 22)}<div style="display:flex;gap:14px;margin-top:14px">{"".join(sk(280, 158, 8) for _ in range(4))}</div></div><div>{sk(110, 22)}<div style="display:flex;gap:14px;margin-top:14px">{"".join(sk(150, 225) for _ in range(7))}</div></div></div>')
    note = f'<div style="position:absolute;left:260px;top:84px;font-size:11px;color:{T3}">載入骨架：與實際卡片同尺寸，不閃爍（Reduce Motion 時靜態）；資料到達後 crossfade 0.2s</div>'
    return doc(wrap(sidebar("首頁") + toolbar("首頁") + window_top() + hero + shelf + note))


def ab_trailer_sheet() -> str:
    w, h = 900, 560
    inner = (f'<div style="position:absolute;inset:0;background:#000"><div style="position:absolute;left:0;right:0;top:0;bottom:60px;background:{anime_gradient("pv")};display:flex;align-items:center;justify-content:center"><span style="width:64px;height:64px;border-radius:50%;background:rgba(255,255,255,.92);display:flex;align-items:center;justify-content:center;color:#000">{ic("play", 26)}</span></div>'
             f'<div class="row" style="position:absolute;left:0;right:0;bottom:0;height:60px;padding:0 16px;gap:12px;background:{SURFACE};border-top:1px solid rgba(255,255,255,.06)"><div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700;color:#fff">【メインPV】TVアニメ「黄泉のツガイ」</div><div style="font-size:11px;color:{T3}">YouTube · アニプレックス チャンネル · 以 mpv + yt-dlp 播放（未安裝 yt-dlp 時改用內嵌網頁）</div></div><span class="btn sec" style="padding:6px 12px;font-size:12px">{ic("link", 13)}在 YouTube 開啟</span><span class="btn sec" style="padding:6px 12px;font-size:12px">{ic("x", 13, 2)}</span></div></div>')
    return doc(f'<div style="width:{w}px;height:{h}px;position:relative;overflow:hidden;border-radius:12px;box-shadow:0 0 0 1px rgba(255,255,255,.12), 0 30px 60px rgba(0,0,0,.7)">{inner}</div>')


def ab_discover_category() -> str:
    grid = "".join(poster(n, 150, 225, score=s, cnt="13 集") for n, s in zip(SHOWS, SCORES)) + poster("魔法使的新娘", 150, 225, score=7.6)
    inner = f"""{sidebar("探索")}{toolbar("探索 › 奇幻")}{window_top()}
    <div style="position:absolute;left:260px;right:32px;top:72px;display:flex;flex-direction:column;gap:16px">
      <div class="row" style="justify-content:space-between"><div><div class="row" style="gap:10px"><span style="font-size:26px;font-weight:700;letter-spacing:-0.01em">奇幻</span><span class="chip">類型</span></div><div style="font-size:12px;color:{T3};margin-top:4px">1,284 部 · 依人氣</div></div><span class="row" style="gap:8px"><span class="field" style="height:30px;color:{T1}">排序 <span style="color:{T2}">人氣</span>{ic("chevd", 12, 2)}</span><span class="field" style="height:30px;color:{T1}">年份 <span style="color:{T2}">全部</span>{ic("chevd", 12, 2)}</span><span class="field" style="height:30px;color:{T1}">狀態 <span style="color:{T2}">全部</span>{ic("chevd", 12, 2)}</span></span></div>
      <div class="row" style="gap:8px">{"".join(f'<span class="chip{" on" if t == "奇幻" else ""}">{t}</span>' for t in ["奇幻", "異世界", "冒險", "魔法", "戰鬥", "日常", "戀愛"])}</div>
      <div style="display:grid;grid-template-columns:repeat(7, minmax(0, 1fr));gap:14px">{grid}</div>
    </div>"""
    return doc(wrap(inner))


# ---------------------------------------------------------------- registry
NEW_ARTBOARDS = {
    "SettingsGeneral": (ab_settings_general, 980, 680),
    "SettingsServer": (ab_settings_server, 980, 780),
    "SettingsPlayer": (ab_settings_player, 980, 1080),
    "SettingsSubtitles": (ab_settings_subtitles, 980, 900),
    "SettingsIntegrations": (ab_settings_integrations, 980, 900),
    "SettingsNotifications": (ab_settings_notifications, 980, 720),
    "SettingsDownloads": (ab_settings_downloads, 980, 680),
    "SettingsAccount": (ab_settings_account, 980, 680),
    "SettingsAbout": (ab_settings_about, 980, 780),
    "LibraryAdd": (ab_library_add, 840, 560),
    "LibraryRename": (ab_library_rename, 1440, 900),
    "LibraryDuplicates": (ab_library_duplicates, 1440, 900),
    "LibraryMissing": (ab_library_missing, 1440, 900),
    "TorrentSearch": (ab_torrent_search, 1440, 900),
    "SubscribeSheet": (ab_subscribe_sheet, 640, 520),
    "RuleEditor": (ab_rule_editor, 860, 600),
    "AddLinkSheet": (ab_add_link_sheet, 560, 360),
    "PlayerSubtitles": (lambda: ab_player_tracks("字幕"), 1440, 900),
    "PlayerAudioVideo": (lambda: ab_player_tracks("視訊"), 1440, 900),
    "PlayerFullscreen": (ab_player_fullscreen, 1440, 900),
    "PlayerHelp": (ab_player_help, 1440, 900),
    "PlayerBuffering": (lambda: player_state("buffering"), 720, 405),
    "PlayerError": (lambda: player_state("error"), 720, 405),
    "PlayerTranscoding": (lambda: player_state("transcoding"), 720, 405),
    "PlayerContextMenu": (ab_player_context_menu, 720, 405),
    "PlayerDropSubtitle": (ab_player_drop, 720, 405),
    "ServerAdd": (ab_server_add, 1440, 900),
    "TwoFactor": (ab_two_factor, 1440, 900),
    "SetupRedirect": (ab_setup_redirect, 1440, 900),
    "ConnectionError": (ab_connection_error, 1440, 900),
    "MenuBarExtra": (ab_menubar_extra, 360, 420),
    "SystemIntegration": (ab_system_integration, 1080, 620),
    "HoverCard": (ab_hover_card, 720, 420),
    "ContextMenus": (ab_context_menus, 900, 420),
    "EmptyStates": (ab_empty_states, 1080, 420),
    "Skeleton": (ab_skeleton, 1440, 900),
    "TrailerSheet": (ab_trailer_sheet, 900, 560),
    "DiscoverCategory": (ab_discover_category, 1440, 900),
}

ROWS2 = [
    ("page-browse", ["Login", "Main", "AnimeDetail"]),
    ("page-browse", ["Schedule", "Discover", "DiscoverCategory", "Search"]),
    ("page-browse", ["CommandPalette", "HoverCard", "ContextMenus", "TrailerSheet"]),
    ("page-browse", ["EmptyStates", "Skeleton"]),
    ("page-player", ["Player", "PlayerDanmaku", "PlayerSources"]),
    ("page-player", ["PlayerSubtitles", "PlayerAudioVideo", "PlayerFullscreen"]),
    ("page-player", ["PlayerHelp", "PlayerNextUp", "MiniPlayer"]),
    ("page-player", ["PlayerBuffering", "PlayerError", "PlayerTranscoding", "PlayerContextMenu", "PlayerDropSubtitle"]),
    ("page-manage", ["Collection", "History", "Libraries"]),
    ("page-manage", ["LibraryDetail", "LibraryRename", "LibraryDuplicates"]),
    ("page-manage", ["LibraryMissing", "LibraryAdd", "MatchSheet", "Notifications"]),
    ("page-manage", ["Downloads", "TorrentSearch", "SubscribeSheet"]),
    ("page-manage", ["RuleEditor", "AddLinkSheet"]),
    ("page-settings", ["SettingsGeneral", "SettingsServer", "SettingsPlayer"]),
    ("page-settings", ["SettingsDanmaku", "SettingsSubtitles", "SettingsKeyboard"]),
    ("page-settings", ["SettingsIntegrations", "SettingsNotifications", "SettingsDownloads"]),
    ("page-settings", ["SettingsAccount", "SettingsAbout"]),
    ("page-onboard", ["ServerAdd", "TwoFactor", "SetupRedirect"]),
    ("page-onboard", ["ConnectionError", "MenuBarExtra", "SystemIntegration"]),
]

NOTES2 = {
    "page-browse": [("n-shell", 0, -260, 380, "Shell：Apple TV 式 labeled sidebar（已拍板）。工具列：返回/前進、頁名、⌘K 搜尋、通知。背景沿用 web 的 BannerImage 多層 gradient。第三、四列是瀏覽層的輔助 UI：⌘K、海報 hover card、右鍵選單、預告片 sheet、空狀態、載入骨架。"),
                    ("n-hero", 1540, -260, 360, "Home：Hero 主按鈕改為「播放」（Apple TV），指標停留 1 秒才自動預告。繼續睇 shelf 第一張示範 hover 狀態（▶ + ⋯ 選單：移除 / 標記已看）。")],
    "page-player": [("n-player", 0, -260, 420, "Player：mpv 畫面 + 原生 Core Animation 彈幕層 + 毛玻璃 floating OSC（seek bar 有 OP/ED 區段標記與縮圖 peek）。右側 inspector 六個 tab（集數 / 彈幕 / 來源 / 字幕 / 音訊 / 視訊），T 收起 = theater。"),
                    ("n-states", 0, 2280, 420, "狀態列：緩衝（顯示串流方式與快取）、錯誤（媒體庫離線，可重試/換檔）、轉碼 fallback（direct → remux → HLS，等待 WS transcode:ready）、右鍵選單、拖放字幕。")],
    "page-manage": [("n-manage", 0, -260, 380, "管理頁 v1 全原生：媒體庫（掃描進度來自 WS）、檔案表、重新命名預覽 + 批次撤銷、重複檔案（偏好規則）、缺集 + 一鍵搜尋、新增媒體庫 sheet（SMB/SFTP/WebDAV/S3/rclone + Bonjour 發現）、下載（分組卡 + RSS）、種子搜尋表、一鍵訂閱、規則編輯器（即時預覽比對）、新增連結。")],
    "page-settings": [("n-settings", 0, -260, 420, "設定用 macOS Settings 視窗（⌘,）、左側分頁。所有 player/danmaku/subtitle/keyboard 設定與 web 的 /user/preferences 共用同一組 key；「伺服器」分頁管理多 server profile 與各裝置 token；「播放器」含本機路徑對應與 yt-dlp。")],
    "page-onboard": [("n-onboard", 0, -260, 400, "Onboarding：新增伺服器（Bonjour 自動發現或輸入網址）、2FA、伺服器未初始化（導去 web 完成 setup）、連線中斷。系統整合：menu bar extra（Now Playing + 下載 + 今天播出）、Dock 右鍵選單 + badge、系統通知、拖放 magnet。")],
}


def main() -> None:
    all_boards = dict(gen.ARTBOARDS)
    all_boards["Main"] = (lambda: doc(gen.ab_home(False)), 1440, 900)  # sidebar decided: labeled
    all_boards.update(NEW_ARTBOARDS)
    pages = [{"id": "page-browse", "name": "瀏覽"}, {"id": "page-player", "name": "播放器 + 彈幕"}, {"id": "page-manage", "name": "管理"},
             {"id": "page-settings", "name": "設定"}, {"id": "page-onboard", "name": "Onboarding + 系統"}]
    boards = []
    y_by_page: dict[str, int] = {}
    used = set()
    for page, names in ROWS2:
        y = y_by_page.get(page, 0)
        x = 0
        row_h = 0
        for n in names:
            fn, w, h = all_boards[n]
            used.add(n)
            with open(os.path.join(OUT, f"{n}.dc.html"), "w", encoding="utf-8") as f:
                f.write(fn())
            boards.append({"file": f"{n}.dc.html", "x": x, "y": y, "w": w, "h": h, "page": page})
            x += w + 100
            row_h = max(row_h, h)
        y_by_page[page] = y + row_h + 160
    missing = set(all_boards) - used
    if missing:
        raise SystemExit(f"artboards not placed: {missing}")
    ann = [{"id": i, "x": x, "y": y, "w": w, "text": t, "page": p} for p, notes in NOTES2.items() for i, x, y, w, t in notes]
    canvas = {"artboards": boards, "pages": pages, "annotations": ann, "launch": {"view": "canvas", "page": "page-browse"}}
    with open(os.path.join(OUT, "canvas.json"), "w", encoding="utf-8") as f:
        json.dump(canvas, f, ensure_ascii=False, indent=2)
    with open(os.path.join(OUT, "artboards.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(b["file"] for b in boards) + "\n")
    print(f"wrote {len(boards)} artboards + canvas.json")


import native  # noqa: E402
native.apply(gen, globals())

if __name__ == "__main__":
    main()
