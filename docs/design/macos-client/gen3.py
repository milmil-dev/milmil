#!/usr/bin/env python3
"""Third batch: the danmaku system in depth + more player states. Run this one (it
chains gen.py → gen2.py → native restyle and writes the whole set)."""
from __future__ import annotations

import json
import os

import gen
import gen2
import native
from gen import *  # noqa: F401,F403
from gen2 import sheet, seg, toggle, mono, srow, sgrp  # noqa: F401

native.apply(gen, gen2, globals())

VW = W - 360


def glass_pill(inner: str, extra: str = "") -> str:
    return f'<span class="glass" style="border-radius:999px;padding:7px 12px;display:inline-flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:#fff;{extra}">{inner}</span>'


def swatch(c: str, on: bool = False) -> str:
    return f'<span style="width:22px;height:22px;border-radius:50%;background:{c};box-shadow:{"0 0 0 2px #fff, 0 0 0 4px " + c if on else "inset 0 0 0 1px rgba(255,255,255,.2)"}"></span>'


# ---------------------------------------------------------------- danmaku system
def ab_danmaku_send() -> str:
    colors = ["#ffffff", "#fde68a", "#fb7185", "#f0abfc", "#67e8f9", "#86efac", "#93c5fd", "#fdba74"]
    pop = f"""
    <div class="glass" style="position:absolute;left:{int(VW * 0.36)}px;bottom:132px;width:420px;border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:12px;z-index:5">
      <div class="row" style="justify-content:space-between"><span style="font-size:13px;font-weight:700;color:#fff">發送彈幕</span><span style="font-size:11px;color:{T3}">09:02 · 尖帽子的魔法工房 EP 1</span></div>
      <div style="height:40px;border-radius:8px;background:rgba(0,0,0,.5);position:relative;overflow:hidden"><span class="dm" style="left:12px;top:10px;font-size:20px;color:#fde68a">可可加油！！</span><span style="position:absolute;right:10px;top:12px;font-size:11px;color:{T3}">預覽</span></div>
      <div class="row" style="gap:12px"><span style="font-size:12px;color:{T2};width:44px">模式</span>{seg(["滾動", "頂部", "底部"], "滾動")}<span style="flex:1"></span><span style="font-size:12px;color:{T2}">字級</span>{seg(["小", "標準", "大"], "標準")}</div>
      <div class="row" style="gap:12px"><span style="font-size:12px;color:{T2};width:44px">顏色</span><span class="row" style="gap:8px">{"".join(swatch(c, c == "#fde68a") for c in colors)}</span><span class="tb-btn" style="margin-left:auto">{ic("plus", 13, 2.2)}</span></div>
      <div class="row" style="gap:8px;font-size:11px;color:{T3};white-space:nowrap"><span class="kbd">⌘↩</span>發送 <span class="kbd">esc</span>關閉 <span style="flex:1"></span>發到 DandanPlay（ep 123456）· 同時顯示在本機</div>
    </div>"""
    bar = (f'<div class="row" style="position:absolute;left:24px;right:24px;bottom:24px;height:46px;border-radius:999px;padding:0 8px 0 10px;gap:8px;z-index:6" class="glass">'
           f'<span class="row" style="gap:6px;padding:5px 10px 5px 8px;border-radius:999px;background:rgba(255,255,255,.14);color:#fff;font-size:11px;font-weight:600">{ic("danmaku", 16)}開</span>'
           f'<span style="flex:1;font-size:13px;color:#fff">可可加油！！<span style="display:inline-block;width:1px;height:16px;background:{ACCENT};vertical-align:-3px"></span></span>'
           f'<span class="chip" style="background:rgba(253,230,138,.25);color:#fde68a">滾動 · 標準 · 黃</span><span class="btn acc" style="height:30px;padding:0 14px">發送</span></div>')
    o = osc(VW - 48, 24, 24, peek=False).replace('color:rgba(255,255,255,.35)">發送彈幕… ', f'color:#fff;box-shadow:inset 0 0 0 1px {ACCENT}">可可加油！！ ', 1)
    inner = (f'<div style="position:absolute;left:0;top:0;width:{VW}px;height:{H}px">{video_area(VW, H, subtitle=False)}{o}{pop}</div>{inspector("彈幕")}{window_top()}')
    return doc(wrap(inner, bg="#000"))


def ab_danmaku_blocklist() -> str:
    rules = ""
    for i, (kind, pat, hits, on) in enumerate([("關鍵字", "劇透", 42, True), ("正則", "/^前排.*/", 310, True), ("關鍵字", "xswl", 88, True), ("正則", "/(哈){4,}/", 1204, True), ("使用者", "uid 8f3a…", 17, False), ("關鍵字", "廣告", 3, True)]):
        kc = {"關鍵字": (T3, "rgba(255,255,255,.08)"), "正則": ("#7dd3fc", "rgba(56,189,248,.15)"), "使用者": ("#f0abfc", "rgba(240,171,252,.15)")}[kind]
        rules += (f'<div class="row" style="gap:12px;padding:8px 12px;border-radius:6px;background:{"rgba(255,255,255,.03)" if i % 2 else "transparent"}"><span class="chip" style="width:58px;justify-content:center;background:{kc[1]};color:{kc[0]}">{kind}</span>'
                  f'<span style="flex:1;font-size:13px;color:#fff" class="mono">{pat}</span><span style="font-size:11px;color:{T3};width:90px;text-align:right">已擋 {hits}</span>{toggle(on)}<span class="tb-btn" style="color:#ff453a">{ic("trash", 13)}</span></div>')
    inner = f"""
    <div style="display:flex;flex-direction:column;gap:12px;height:100%">
      <div class="row" style="gap:8px"><span class="field" style="flex:1;height:30px;color:{T1}">{ic("plus", 12, 2.2)}新增關鍵字或 /正則/…</span>{seg(["關鍵字", "正則", "使用者"], "關鍵字")}<span class="btn acc" style="height:30px">加入</span></div>
      <div class="card" style="overflow:hidden;flex:1"><div class="row" style="gap:12px;padding:8px 12px;font-size:11px;font-weight:700;color:{T3}"><span style="width:58px">類型</span><span style="flex:1">規則</span><span style="width:90px;text-align:right">本集命中</span><span style="width:36px"></span><span style="width:28px"></span></div>{rules}</div>
      <div class="row" style="gap:14px;font-size:12px;color:{T2}"><span class="row" style="gap:6px">{toggle(True)}合併重複彈幕（顯示 ×N）</span><span class="row" style="gap:6px">{toggle(False)}隱藏彩色彈幕</span><span class="row" style="gap:6px">{toggle(True)}過濾純表情 / 純符號</span></div>
      <div style="font-size:11px;color:{T3}">封鎖詞存於 /user/preferences（danmakuBlockKeywords），web 與 mac 共用；正則以 / 包住。本集 17 + 884 條 → 顯示 901，擋下 1,664。</div>
    </div>"""
    return sheet(inner, 760, 520, "彈幕封鎖規則", "關鍵字、正則與使用者封鎖。", '<span class="btn sec" style="margin-right:auto">{0}匯入 / 匯出</span><span class="btn sec">完成</span>'.format(ic("download", 13)))


def ab_danmaku_match() -> str:
    def cand(title: str, ep: str, conf: int, on: bool) -> str:
        return (f'<div class="row" style="gap:12px;padding:9px 10px;border-radius:8px;background:{"rgba(167,139,250,.16)" if on else "transparent"};{"box-shadow:inset 0 0 0 1px rgba(167,139,250,.5)" if on else ""}"><div style="width:40px;height:56px;border-radius:4px;background:{anime_gradient(title)}"></div>'
                f'<div style="flex:1"><div style="font-size:13px;font-weight:600;color:#fff">{title}</div><div style="font-size:11px;color:{T3}">{ep}</div></div><span style="font-size:11px;font-weight:700;color:{"#30d158" if conf > 80 else T3}">{conf}%</span>{ic("check", 16, 2.5, ACCENT) if on else ""}</div>')
    inner = f"""
    <div style="display:flex;gap:20px;height:100%">
      <div style="flex:1;display:flex;flex-direction:column;gap:10px">
        <div class="card" style="padding:10px 12px;display:flex;flex-direction:column;gap:4px"><div style="font-size:11px;font-weight:700;color:{T3}">檔案</div><div class="mono" style="font-size:11px;color:{T1}">[Sakurato] Tongari Boushi no Atelier [01][AVC-8bit 1080p AAC][CHT].mp4</div><div style="font-size:11px;color:{T3}">MD5(前 16MB) 3f9a…c21e · 1.4 GB · 23:41 · 已配對 Bangumi EP 1</div></div>
        <div style="font-size:11px;font-weight:700;color:{T3}">DandanPlay hash + 檔名比對結果</div>
        {cand("とんがり帽子のアトリエ", "第1話 魔法的開端 · ep 123456", 98, True)}{cand("とんがり帽子のアトリエ", "第2話 · ep 123457", 41, False)}{cand("Witch Hat Atelier (Dub)", "Episode 1 · ep 998811", 22, False)}
        <div class="row" style="gap:8px;margin-top:4px"><span class="field" style="flex:1;height:30px;color:{T1}">{ic("search", 12)}手動搜尋作品…</span></div>
      </div>
      <div style="width:280px;display:flex;flex-direction:column;gap:10px">
        <div class="card" style="padding:12px;display:flex;flex-direction:column;gap:8px"><div style="font-size:12px;font-weight:700;color:#fff">套用到</div><div class="row" style="gap:8px;font-size:12px;color:{T2}">{toggle(True)}只此檔案</div><div class="row" style="gap:8px;font-size:12px;color:{T2}">{toggle(False)}整部作品（依集數順推）</div></div>
        <div class="card" style="padding:12px;display:flex;flex-direction:column;gap:6px;font-size:12px;color:{T2};line-height:1.5"><div style="font-weight:700;color:#fff">目前彈幕</div>ep 123456 · 17 條（6 小時前快取）<br>B站匯入 884 條（已儲存）</div>
        <div style="font-size:11px;color:{T3};line-height:1.5">重新匹配會更新 media_files.dandanplay_episode_id（伺服器端），web 也會看到新的彈幕。</div>
      </div>
    </div>"""
    return sheet(inner, 800, 520, "彈幕匹配", "此檔案的 DandanPlay 集數對應。", '<span class="btn sec">取消</span><span class="btn acc">套用匹配</span>')


def ab_danmaku_nomatch() -> str:
    body = (f'<div style="position:absolute;right:0;top:0;bottom:0;width:360px;background:rgba(28,28,30,.86);backdrop-filter:blur(40px) saturate(160%);border-left:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;z-index:4">'
            f'<div class="tabs" style="margin:44px 14px 0">' + "".join(f'<span class="{"on" if t == "彈幕" else ""}">{t}</span>' for t in ["集數", "彈幕", "來源", "字幕", "音訊", "視訊"]) + '</div>'
            f'<div style="padding:40px 24px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px"><span style="width:56px;height:56px;border-radius:16px;background:rgba(167,139,250,.12);display:flex;align-items:center;justify-content:center;color:{ACCENT}">{ic("danmaku", 26)}</span>'
            f'<div style="font-size:15px;font-weight:700;color:#fff">此檔案尚未匹配彈幕</div><div style="font-size:12px;color:{T3};line-height:1.55">DandanPlay 找不到對應的集數（檔案 hash 無命中，檔名「tongari_boushi_13_raw_final_v2」無法辨識）。</div>'
            f'<span class="btn acc" style="margin-top:6px">{ic("search", 13)}手動匹配 DandanPlay</span><span class="btn sec">{ic("download", 13)}從 Bilibili 匯入</span><span class="btn sec">{ic("folder", 13)}載入本機 XML / JSON</span>'
            f'<div style="font-size:11px;color:{T3};margin-top:10px">已自動嘗試：hash ✗ · 檔名 ✗ · Bangumi 集數推斷 ✓（第13話）→ <span style="color:{ACCENT};font-weight:600">用推斷結果匹配</span></div></div></div>')
    inner = (f'<div style="position:absolute;left:0;top:0;width:{VW}px;height:{H}px">{video_area(VW, H, danmaku=False)}{osc(VW - 48, 24, 24, peek=False, danmaku_on=False)}'
             f'<div class="glass" style="position:absolute;left:50%;top:72px;transform:translateX(-50%);border-radius:999px;padding:7px 14px;font-size:12px;font-weight:600;color:#fff;display:flex;gap:8px;align-items:center">{ic("info", 14)}無彈幕 · 此檔案未匹配 <span style="color:{ACCENT}">匹配…</span></div></div>{body}{window_top()}')
    return doc(wrap(inner, bg="#000"))


def ab_danmaku_offset() -> str:
    pop = f"""
    <div class="glass" style="position:absolute;left:{VW - 48 - 380}px;bottom:132px;width:380px;border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:12px;z-index:5">
      <div class="row" style="justify-content:space-between"><span style="font-size:13px;font-weight:700;color:#fff">彈幕時間偏移</span><span style="font-size:11px;color:{T3}">每來源獨立</span></div>
      <div class="row" style="gap:10px"><span style="font-size:12px;color:{T2};width:80px">DandanPlay</span><span class="row" style="gap:6px"><span class="tb-btn" style="background:rgba(255,255,255,.08);border-radius:999px">{ic("chevl", 12, 2.2)}</span><span style="font-size:14px;font-weight:700;color:#fff;width:64px;text-align:center;font-variant-numeric:tabular-nums">+0.0s</span><span class="tb-btn" style="background:rgba(255,255,255,.08);border-radius:999px">{ic("chevr", 12, 2.2)}</span></span><span style="flex:1"></span><span style="font-size:11px;color:{T3}">17 條</span></div>
      <div class="row" style="gap:10px"><span style="font-size:12px;color:{T2};width:80px">B站 P1</span><span class="row" style="gap:6px"><span class="tb-btn" style="background:rgba(255,255,255,.08);border-radius:999px">{ic("chevl", 12, 2.2)}</span><span style="font-size:14px;font-weight:700;color:{ACCENT};width:64px;text-align:center;font-variant-numeric:tabular-nums">−8.5s</span><span class="tb-btn" style="background:rgba(255,255,255,.08);border-radius:999px">{ic("chevr", 12, 2.2)}</span></span><span style="flex:1"></span><span style="font-size:11px;color:{T3}">884 條</span></div>
      <div style="height:1px;background:rgba(255,255,255,.08)"></div>
      <div class="row" style="gap:8px;flex-wrap:wrap"><span class="btn sec" style="height:26px;font-size:11px">{ic("sparkle", 11)}自動對齊（OP 偵測）</span><span class="btn sec" style="height:26px;font-size:11px">對齊到字幕軌</span><span class="btn sec" style="height:26px;font-size:11px">重設</span></div>
      <div style="font-size:11px;color:{T3};line-height:1.5">B站版本多了 8.5 秒片頭廣告，已自動以 OP 音訊指紋對齊；偏移會記在這一集（伺服器 per-episode）。步進 0.5s，按住 ⌥ 為 0.1s。</div>
    </div>"""
    inner = (f'<div style="position:absolute;left:0;top:0;width:{VW}px;height:{H}px">{video_area(VW, H, subtitle=False)}{osc(VW - 48, 24, 24, peek=False)}{pop}</div>{inspector("來源")}{window_top()}')
    return doc(wrap(inner, bg="#000"))


def ab_danmaku_heatmap() -> str:
    # seek bar with a danmaku-density heatmap and "high-energy" markers
    bars = ""
    import math
    for i in range(120):
        v = abs(math.sin(i / 7.0)) * 0.5 + abs(math.sin(i / 23.0 + 1)) * 0.5
        if 44 <= i <= 48 or 96 <= i <= 99:
            v = 1.0
        hgt = 4 + int(v * 22)
        bars += f'<span style="width:7px;height:{hgt}px;border-radius:2px;background:rgba(167,139,250,{0.18 + v * 0.55:.2f})"></span>'
    heat = f'<div style="position:absolute;left:16px;right:16px;bottom:100%;height:28px;display:flex;align-items:flex-end;gap:1px;padding:0 4px 4px;margin-bottom:2px">{bars}</div>'
    marks = "".join(f'<div style="position:absolute;left:{p}%;bottom:calc(100% + 34px);transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:2px"><span class="glass" style="border-radius:999px;padding:3px 8px;font-size:10px;font-weight:700;color:#fff;white-space:nowrap">{t}</span><span style="width:1px;height:8px;background:rgba(255,255,255,.4)"></span></div>' for p, t in [(38, "高能 · 03:02 · 312 條"), (81, "高能 · 19:10 · 540 條")])
    osc_html = osc(VW - 48, 24, 24, peek=False)
    osc_html = osc_html.replace('<div class="glass" style="position:absolute;left:24px;width:', f'<div class="glass" style="position:absolute;left:24px;width:', 1)
    osc_html = osc_html.replace(f'border-radius:16px;padding:14px 16px 10px">', f'border-radius:16px;padding:14px 16px 10px">{heat}{marks}', 1)
    pill = f'<div class="glass" style="position:absolute;left:24px;bottom:172px;border-radius:999px;padding:7px 12px;display:flex;align-items:center;gap:8px;font-size:12px;font-weight:600;color:#fff;z-index:5">{ic("fire", 14, 1.9, "#ff9f0a")}彈幕熱力圖 <span style="color:{T3};font-weight:500">· 顯示於 hover seek bar 時 · 可在設定關閉</span></div>'
    inner = (f'<div style="position:absolute;left:0;top:0;width:{VW}px;height:{H}px">{video_area(VW, H, subtitle=False)}{osc_html}{pill}</div>{inspector("彈幕")}{window_top()}')
    return doc(wrap(inner, bg="#000"))


def ab_danmaku_list_menu() -> str:
    w, h = 720, 480
    items = [("00:12", "前排", "DDP"), ("00:41", "這作畫是劇場版規格", "DDP"), ("01:05", "BGM 好有氣氛", "B站"), ("01:48", "Qifrey 老師真係靚仔", "DDP"), ("02:10", "魔法陣好複雜", "B站"), ("02:33", "哇好靚啊！", "DDP"), ("03:02", "可可加油！！", "DDP")]
    rows = "".join(f'<div class="row" style="gap:10px;padding:7px 10px;border-radius:6px;background:{"rgba(167,139,250,.2)" if i == 3 else "transparent"}"><span style="font-size:11px;color:{T3};width:36px;font-variant-numeric:tabular-nums">{t}</span><span style="font-size:12px;color:#fff;flex:1">{s}</span><span style="font-size:9px;font-weight:700;padding:2px 5px;border-radius:3px;background:rgba(255,255,255,.08);color:{T3}">{src}</span></div>' for i, (t, s, src) in enumerate(items))
    menu = (f'<div class="glass" style="position:absolute;left:300px;top:150px;width:230px;border-radius:10px;padding:5px 0;z-index:5">'
            + "".join(f'<div class="row" style="gap:8px;padding:5px 12px;font-size:13px;color:{"#ff453a" if "封鎖" in t else "#fff"}"><span style="flex:1">{t}</span>{"<span style=font-size:11px;color:" + T3 + ">" + k + "</span>" if k else ""}</div>' if t != "-" else '<div style="height:1px;background:rgba(255,255,255,.08);margin:4px 10px"></div>'
                      for t, k in [("跳到 01:48", "↩"), ("複製內容", "⌘C"), ("-", ""), ("在畫面上高亮 3 秒", ""), ("-", ""), ("封鎖關鍵字「Qifrey」", ""), ("封鎖此使用者", ""), ("檢舉（DandanPlay）", "")]) + '</div>')
    inner = (f'<div style="position:absolute;inset:0;background:{SURFACE}"><div style="position:absolute;left:20px;top:16px;width:340px"><div class="tabs">' + "".join(f'<span class="{"on" if t == "彈幕" else ""}">{t}</span>' for t in ["集數", "彈幕 17", "來源"]) + f'</div><div style="margin-top:12px;display:flex;flex-direction:column;gap:1px">{rows}</div></div>{menu}'
             f'<div style="position:absolute;left:400px;top:340px;width:300px;font-size:11px;color:{T3};line-height:1.6">列表跟隨播放位置自動捲動並高亮目前條目；點擊 seek；右鍵即時加入封鎖詞（同步 web）。<br>`⌘F` 在列表中搜尋；可依來源 / 模式過濾。</div></div>')
    return doc(f'<div style="width:{w}px;height:{h}px;position:relative;overflow:hidden;border-radius:12px;box-shadow:0 0 0 1px rgba(255,255,255,.12)">{inner}</div>')


def ab_danmaku_import_local() -> str:
    inner = f"""
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="border:1px dashed rgba(255,255,255,.18);border-radius:12px;padding:22px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px"><span style="color:{ACCENT}">{ic("danmaku", 26)}</span><div style="font-size:13px;font-weight:600;color:#fff">拖放彈幕檔到這裡</div><div style="font-size:11px;color:{T3}">支援 Bilibili XML、DandanPlay JSON、ASS（彈幕轉字幕）、Niconico XML</div></div>
      <div class="card" style="padding:10px 12px;display:flex;gap:10px;align-items:center"><span style="color:#30d158">{ic("check", 14, 2.5)}</span><div style="flex:1"><div class="mono" style="font-size:11px;color:#fff">尖帽子的魔法工房 01.xml</div><div style="font-size:11px;color:{T3}">Bilibili XML · 1,203 條 · 時長 23:58（與影片相差 +17s，建議偏移 −17s）</div></div>{toggle(True)}<span style="font-size:11px;color:{T2}">自動偏移</span></div>
      <div class="row" style="gap:12px"><span style="font-size:12px;color:{T2}">儲存到伺服器（此集）</span>{toggle(True)}<span style="flex:1"></span><span style="font-size:12px;color:{T2}">來源標籤</span><span class="field" style="height:28px;color:{T1};width:120px">本機</span></div>
    </div>"""
    return sheet(inner, 600, 380, "載入本機彈幕", "匯入後與 DandanPlay / Bilibili 彈幕合併顯示。", '<span class="btn sec">取消</span><span class="btn acc">載入</span>')


# ---------------------------------------------------------------- more player states
def ab_player_theater() -> str:
    inner = (f'<div style="position:absolute;inset:0">{video_area(W, H)}{osc(W - 48, 24, 24, peek=False)}'
             f'<div class="glass" style="position:absolute;right:24px;top:64px;border-radius:999px;padding:6px 10px;color:#fff;display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600">{ic("sidebar", 14)}側欄 <span class="kbd">T</span></div></div>{window_top()}')
    return doc(wrap(inner, bg="#000"))


def ab_player_osd() -> str:
    w, h = 1080, 620
    pills = [
        (ic("fwd10", 18) + "+10 秒", 40, 40), (ic("volume", 16) + "音量 65%" + '<span style="width:90px;height:4px;border-radius:2px;background:rgba(255,255,255,.2);position:relative;margin-left:6px"><span style="position:absolute;left:0;top:0;height:100%;width:65%;background:#fff;border-radius:2px"></span></span>', 220, 40),
        ("倍速 1.5×", 520, 40), ("字幕延遲 −0.3s", 650, 40), (ic("danmaku", 16) + "彈幕 關", 820, 40),
        ("A-B 循環 · A 09:02", 40, 110), ("A-B 循環 · 09:02 → 09:48", 260, 110), ("字幕：繁體中文（內嵌）", 520, 110), ("音軌：日本語", 760, 110),
        (ic("camera", 16) + "截圖已儲存 · 在 Finder 顯示", 40, 180), (ic("skip", 16) + "已跳過 OP", 340, 180), ("章節 · 02 本篇", 520, 180), (ic("sparkle", 16, 1.9, ACCENT) + "Anime4K · Balanced", 700, 180),
        (ic("info", 16) + "已從 09:02 繼續", 40, 250), (ic("wifi", 16) + "連線不穩 · 已降為 720p 轉碼", 260, 250), (ic("clock", 16) + "下一集 10 秒後播放", 600, 250),
    ]
    html = "".join(f'<div style="position:absolute;left:{x}px;top:{y}px">{glass_pill(t)}</div>' for t, x, y in pills)
    note = (f'<div style="position:absolute;left:40px;top:340px;width:900px;font-size:12px;color:{T2};line-height:1.7">OSD pill：畫面頂部置中出現，0.8s 後淡出（Reduce Motion 只 fade）；連續操作時原地更新數值不重新進場。含 icon 的 pill 用 SF Symbol，文字 12pt semibold，背景玻璃材質。<br>'
            f'下排是狀態類 OSD（停留較久、可點）：連線降級會給「重試直接串流」動作；下一集倒數 pill 點擊可取消。</div>'
            f'<div style="position:absolute;left:40px;top:430px;display:flex;gap:14px">'
            f'<div class="glass" style="border-radius:14px;padding:12px 14px;display:flex;align-items:center;gap:12px;width:360px"><div style="width:96px;height:54px;border-radius:6px;background:{anime_gradient("shot")};flex-shrink:0"></div><div style="flex:1"><div style="font-size:12px;font-weight:700;color:#fff">截圖已儲存</div><div style="font-size:11px;color:{T3}">尖帽子的魔法工房 EP1 09-02.png · ~/Pictures/milmil</div></div><span class="btn sec" style="height:26px;font-size:11px">複製</span></div>'
            f'<div class="glass" style="border-radius:14px;padding:12px 14px;display:flex;align-items:center;gap:12px;width:360px"><span style="color:#ff9f0a">{ic("wifi", 20)}</span><div style="flex:1"><div style="font-size:12px;font-weight:700;color:#fff">直接串流中斷</div><div style="font-size:11px;color:{T3}">已切換到 remux；seek 仍可用</div></div><span class="btn sec" style="height:26px;font-size:11px">重試直接</span></div></div>')
    inner = f'<div style="position:absolute;inset:0;background:{anime_gradient("osd")}"><div style="position:absolute;inset:0;background:rgba(0,0,0,.6)"></div>{html}{note}</div>'
    return doc(f'<div style="width:{w}px;height:{h}px;position:relative;overflow:hidden;border-radius:12px;box-shadow:0 0 0 1px rgba(255,255,255,.12)">{inner}</div>')


def ab_player_chapters() -> str:
    chapters = [("00:00", "OP", "segment", False), ("01:30", "本篇", "chapter", True), ("12:10", "Part B", "chapter", False), ("21:50", "ED", "segment", False), ("23:20", "預告", "chapter", False)]
    rows = "".join(f'<div class="row" style="gap:10px;padding:8px 10px;border-radius:8px;background:{"rgba(167,139,250,.16)" if on else "transparent"}"><span style="font-size:11px;color:{ACCENT if on else T3};font-variant-numeric:tabular-nums;width:40px;font-weight:600">{t}</span><span style="font-size:13px;color:#fff;flex:1">{n}</span><span class="chip" style="font-size:10px;padding:2px 6px;{"background:rgba(255,159,10,.18);color:#ffb340" if k == "segment" else ""}">{"OP/ED 區段" if k == "segment" else "MKV 章節"}</span></div>' for t, n, k, on in chapters)
    pop = (f'<div class="glass" style="position:absolute;left:{int(VW * 0.5)}px;bottom:132px;transform:translateX(-50%);width:380px;border-radius:14px;padding:12px 10px;display:flex;flex-direction:column;gap:4px;z-index:5">'
           f'<div class="row" style="justify-content:space-between;padding:0 6px 6px"><span style="font-size:13px;font-weight:700;color:#fff">章節與區段</span><span style="font-size:11px;color:{T3}">來源：MKV 章節 + 伺服器 segments</span></div>{rows}'
           f'<div class="row" style="gap:8px;padding:8px 6px 2px;font-size:11px;color:{T3}"><span class="kbd">⇧N</span>下一章 <span class="kbd">⇧P</span>上一章 <span style="flex:1"></span><span style="color:{ACCENT};font-weight:600">標記目前時間為 OP 結束</span></div></div>')
    inner = (f'<div style="position:absolute;left:0;top:0;width:{VW}px;height:{H}px">{video_area(VW, H, subtitle=False)}{osc(VW - 48, 24, 24, peek=False)}{pop}</div>{inspector("集數")}{window_top()}')
    return doc(wrap(inner, bg="#000"))


def ab_player_speed() -> str:
    presets = "".join(f'<span class="chip{" on" if s == "1.5×" else ""}" style="font-size:12px;padding:5px 12px">{s}</span>' for s in ["0.5×", "0.75×", "1.0×", "1.25×", "1.5×", "2.0×", "3.0×"])
    pop = (f'<div class="glass" style="position:absolute;left:{VW - 48 - 300 - 120}px;bottom:132px;width:320px;border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:12px;z-index:5">'
           f'<div class="row" style="justify-content:space-between"><span style="font-size:13px;font-weight:700;color:#fff">播放速度</span><span style="font-size:16px;font-weight:800;color:{ACCENT};font-variant-numeric:tabular-nums">1.50×</span></div>'
           f'<span class="slider"><i style="width:40%"></i><b style="left:40%"></b></span><div class="row" style="gap:6px;flex-wrap:wrap">{presets}</div>'
           f'<div class="row" style="gap:8px;font-size:12px;color:{T2}">{toggle(True)}變速不變調（scaletempo2）</div><div class="row" style="gap:8px;font-size:12px;color:{T2}">{toggle(True)}記住此作品的速度</div>'
           f'<div style="font-size:11px;color:{T3}">[ ] 步進 0.25 · Backspace 重設 · 長按 → 暫時 3×</div></div>')
    inner = (f'<div style="position:absolute;left:0;top:0;width:{VW}px;height:{H}px">{video_area(VW, H, subtitle=False)}{osc(VW - 48, 24, 24, peek=False)}{pop}</div>{inspector("集數")}{window_top()}')
    return doc(wrap(inner, bg="#000"))


def ab_player_techinfo() -> str:
    rows = [("檔案", "[Sakurato] Tongari Boushi no Atelier [01][AVC-8bit 1080p AAC][CHT].mp4"), ("來源", "本機路徑 /Volumes/anime/…（file://，未經伺服器）"), ("容器 / 視訊", "mp4 · H.264 High 8-bit · 1920×1080 · 23.976 fps"),
            ("解碼", "VideoToolbox（硬解）· vo libmpv GL · 丟幀 0 / 21,413"), ("音訊", "AAC 2.0 · 48 kHz · 輸出 MacBook Pro 揚聲器"), ("字幕", "sid 1 繁體中文（ASS，libass）· 副 sid 3 日本語（PGS）· 延遲 −0.3s"),
            ("快取", "前向 61.2s（48 MB）· 位元率 4.8 Mb/s"), ("彈幕", "顯示 901 / 載入 901（DDP 17 + B站 884）· 同屏 38 · 渲染 60 fps · 偏移 B站 −8.5s"), ("濾鏡", "Anime4K Balanced（3 passes）· interpolation off · HDR n/a"), ("進度", "上次上報 4s 前 · 09:02 / 23:41 · 同步佇列 0")]
    body = "".join(f'<div class="row" style="gap:14px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06);align-items:flex-start"><span style="font-size:11px;font-weight:700;color:{T3};width:80px;flex-shrink:0;padding-top:1px">{k}</span><span class="mono" style="font-size:11px;color:#fff;line-height:1.5">{v}</span></div>' for k, v in rows)
    panel = (f'<div class="glass" style="position:absolute;left:24px;top:72px;width:620px;border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:4px;z-index:5">'
             f'<div class="row" style="justify-content:space-between;margin-bottom:4px"><span style="font-size:13px;font-weight:700;color:#fff">技術資訊</span><span class="row" style="gap:8px"><span class="btn sec" style="height:24px;font-size:11px">複製</span><span class="kbd">I</span></span></div>{body}</div>')
    inner = (f'<div style="position:absolute;left:0;top:0;width:{VW}px;height:{H}px">{video_area(VW, H, subtitle=False)}{osc(VW - 48, 24, 24, peek=False)}{panel}</div>{inspector("集數")}{window_top()}')
    return doc(wrap(inner, bg="#000"))


def ab_player_abloop() -> str:
    o = osc(VW - 48, 24, 24, peek=False)
    o = o.replace('<div style="position:absolute;left:38%;top:-5px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>',
                  '<div style="position:absolute;left:38%;top:-5px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>'
                  f'<div style="position:absolute;left:38%;right:58%;top:-3px;height:10px;background:rgba(255,159,10,.35);border-radius:3px"></div>'
                  f'<div style="position:absolute;left:38%;top:-18px;transform:translateX(-50%);font-size:10px;font-weight:800;color:#ffb340">A</div><div style="position:absolute;left:42%;top:-18px;transform:translateX(-50%);font-size:10px;font-weight:800;color:#ffb340">B</div>')
    pill = glass_pill(f'{ic("refresh", 14, 1.9, "#ffb340")}A-B 循環 09:02 → 09:48 <span style="color:{T3};font-weight:500">· 第 3 次 · L 解除</span>')
    inner = (f'<div style="position:absolute;left:0;top:0;width:{VW}px;height:{H}px">{video_area(VW, H, subtitle=False)}{o}<div style="position:absolute;left:24px;bottom:140px;z-index:5">{pill}</div></div>{inspector("集數")}{window_top()}')
    return doc(wrap(inner, bg="#000"))


def ab_player_startup() -> str:
    wall = "".join(f'<div style="aspect-ratio:2/3;border-radius:4px;background:{anime_gradient(n + str(i))}"></div>' for i, n in enumerate((SHOWS * 6)[:84]))
    inner = (f'<div style="position:absolute;left:0;top:0;width:{VW}px;height:{H}px;overflow:hidden;background:#000">'
             f'<div style="position:absolute;left:-25%;right:-25%;top:-25%;bottom:-25%;transform:rotate(-14deg);display:grid;grid-template-columns:repeat(14, minmax(0, 1fr));gap:10px 6px;opacity:.55">{wall}</div>'
             f'<div style="position:absolute;inset:0;background:radial-gradient(ellipse 50% 50% at 50% 50%, rgba(0,0,0,.3), rgba(0,0,0,.85))"></div>'
             f'<div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center">'
             f'<div style="width:120px;height:170px;border-radius:8px;background:{anime_gradient("尖帽子的魔法工房")};box-shadow:0 20px 50px rgba(0,0,0,.6)"></div>'
             f'<div><div style="font-size:20px;font-weight:800;color:#fff">尖帽子的魔法工房</div><div style="font-size:13px;color:{T2};margin-top:4px">EP 1 · 魔法的開端</div></div>'
             f'<div class="row" style="gap:10px;font-size:12px;color:{T2}"><span style="width:14px;height:14px;border:2px solid {ACCENT};border-right-color:transparent;border-radius:50%"></span>開啟本機檔案 · 載入彈幕 901 條 · 字幕 3 軌</div>'
             f'<div class="row" style="gap:6px;font-size:11px;color:{T3}"><span class="chip" style="font-size:10px">mpv</span><span class="chip" style="font-size:10px">hwdec</span><span class="chip" style="font-size:10px">Anime4K</span><span class="chip" style="font-size:10px">DDP + B站</span></div></div></div>'
             f'{inspector("集數")}{window_top()}')
    return doc(wrap(inner, bg="#000"))


def ab_player_compact() -> str:
    w, h = 760, 460
    o = (f'<div class="glass" style="position:absolute;left:16px;right:16px;bottom:16px;border-radius:14px;padding:10px 12px 8px">'
         f'<div style="position:relative;height:4px;border-radius:2px;background:rgba(255,255,255,.16)"><div style="position:absolute;left:0;top:0;height:100%;width:38%;background:{ACCENT};border-radius:2px"></div><div style="position:absolute;left:38%;top:-5px;width:14px;height:14px;margin-left:-7px;border-radius:50%;background:#fff"></div></div>'
         f'<div class="row" style="gap:2px;margin-top:8px"><span style="width:30px;height:30px;display:flex;align-items:center;justify-content:center;color:#fff">{ic("back10", 20)}</span><span style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;color:#fff">{ic("pause", 22)}</span><span style="width:30px;height:30px;display:flex;align-items:center;justify-content:center;color:#fff">{ic("fwd10", 20)}</span>'
         f'<span style="font-size:11px;font-weight:600;color:rgba(255,255,255,.85);font-variant-numeric:tabular-nums;margin:0 6px;white-space:nowrap">09:02 / 23:41</span><span style="flex:1"></span>'
         f'<span class="row" style="gap:6px;padding:4px 8px;border-radius:999px;background:rgba(255,255,255,.14);color:#fff;font-size:11px;font-weight:600">{ic("danmaku", 14)}</span><span style="width:30px;height:30px;display:flex;align-items:center;justify-content:center;color:#fff">{ic("cc", 18)}</span><span style="width:30px;height:30px;display:flex;align-items:center;justify-content:center;color:#fff">{ic("more", 18)}</span><span style="width:30px;height:30px;display:flex;align-items:center;justify-content:center;color:#fff">{ic("fullscreen", 18)}</span></div></div>')
    note = f'<div style="position:absolute;left:16px;top:64px;font-size:11px;color:{T2};background:rgba(0,0,0,.5);padding:4px 8px;border-radius:6px">視窗 &lt; 900pt：OSC 依優先序收合（IINA 作法）——先藏上一集/下一集、音量滑桿、倍速、音軌，把次要動作收進 ⋯ 選單；彈幕輸入框改為按鈕。</div>'
    inner = f'<div style="position:absolute;inset:0">{video_area(w, h, scale=.55)}{o}{note}</div>{window_top()}'
    return doc(f'<div class="win" style="width:{w}px;height:{h}px;background-color:#000;background-image:none">{inner}</div>')


def ab_player_multiwindow() -> str:
    w, h = 1440, 900
    main_w, main_h = 900, 600
    # a shrunken main window + a player window overlapping, like a real desktop
    main = (f'<div style="position:absolute;left:40px;top:60px;width:{main_w}px;height:{main_h}px;border-radius:12px;overflow:hidden;box-shadow:0 0 0 1px rgba(255,255,255,.12), 0 30px 80px rgba(0,0,0,.6);background:{BG};transform-origin:top left">'
            f'<div style="position:absolute;left:0;top:0;width:1440px;height:900px;transform:scale({main_w / 1440:.3f});transform-origin:top left">{backdrop("黄泉使者", 0, 520)}{sidebar("首頁")}{toolbar("黄泉使者")}{window_top()}'
            f'<div style="position:absolute;left:260px;top:96px;display:flex;gap:28px">{poster("黄泉使者", 200, 290, caption=False)}<div style="padding-top:6px;display:flex;flex-direction:column;gap:10px"><div style="font-size:32px;font-weight:800;color:#fff">黄泉使者</div><div class="row" style="gap:8px"><span class="btn pri">{ic("play", 14)}繼續 EP3</span><span class="btn sec">在看</span></div></div></div></div></div>')
    pw, ph = 820, 520
    pv = int(pw)
    player = (f'<div style="position:absolute;left:560px;top:300px;width:{pw}px;height:{ph}px;border-radius:12px;overflow:hidden;box-shadow:0 0 0 1px rgba(255,255,255,.18), 0 40px 100px rgba(0,0,0,.75);background:#000">'
              f'{video_area(pv, ph, scale=.6)}{osc(pv - 32, 16, 16, peek=False, compact=True)}{window_top()}</div>')
    note = f'<div style="position:absolute;left:40px;top:700px;width:480px;font-size:12px;color:{T2};line-height:1.7">播放器是獨立視窗（WindowGroup），可邊看邊瀏覽；主視窗點「播放」時若播放器已開則重用並前置。播放器視窗記住大小與位置，鎖定影片比例（aspect lock），可放到第二螢幕全螢幕。</div>'
    inner = f'<div style="position:absolute;inset:0;background:{anime_gradient("desktop3")}"><div style="position:absolute;inset:0;background:rgba(0,0,0,.5)"></div>{main}{player}{note}</div>'
    return doc(f'<div style="width:{w}px;height:{h}px;position:relative;overflow:hidden;border-radius:10px">{inner}</div>')


# ---------------------------------------------------------------- registry
NEW3 = {
    "DanmakuSend": (ab_danmaku_send, 1440, 900),
    "DanmakuHeatmap": (ab_danmaku_heatmap, 1440, 900),
    "DanmakuOffset": (ab_danmaku_offset, 1440, 900),
    "DanmakuNoMatch": (ab_danmaku_nomatch, 1440, 900),
    "DanmakuMatch": (ab_danmaku_match, 800, 520),
    "DanmakuBlocklist": (ab_danmaku_blocklist, 760, 520),
    "DanmakuImportLocal": (ab_danmaku_import_local, 600, 380),
    "DanmakuListMenu": (ab_danmaku_list_menu, 720, 480),
    "PlayerTheater": (ab_player_theater, 1440, 900),
    "PlayerChapters": (ab_player_chapters, 1440, 900),
    "PlayerSpeed": (ab_player_speed, 1440, 900),
    "PlayerTechInfo": (ab_player_techinfo, 1440, 900),
    "PlayerABLoop": (ab_player_abloop, 1440, 900),
    "PlayerStartup": (ab_player_startup, 1440, 900),
    "PlayerOSD": (ab_player_osd, 1080, 620),
    "PlayerCompact": (ab_player_compact, 760, 460),
    "PlayerMultiWindow": (ab_player_multiwindow, 1440, 900),
}

ROWS3 = [
    ("page-browse", ["Login", "Main", "AnimeDetail"]),
    ("page-browse", ["Schedule", "Discover", "DiscoverCategory", "Search"]),
    ("page-browse", ["CommandPalette", "HoverCard", "ContextMenus", "TrailerSheet"]),
    ("page-browse", ["EmptyStates", "Skeleton"]),
    ("page-player", ["PlayerStartup", "Player", "PlayerTheater"]),
    ("page-player", ["PlayerSubtitles", "PlayerAudioVideo", "PlayerFullscreen"]),
    ("page-player", ["PlayerChapters", "PlayerSpeed", "PlayerTechInfo"]),
    ("page-player", ["PlayerABLoop", "PlayerHelp", "PlayerNextUp"]),
    ("page-player", ["PlayerOSD", "MiniPlayer", "PlayerCompact"]),
    ("page-player", ["PlayerBuffering", "PlayerError", "PlayerTranscoding", "PlayerContextMenu", "PlayerDropSubtitle"]),
    ("page-player", ["PlayerMultiWindow"]),
    ("page-danmaku", ["PlayerDanmaku", "DanmakuSend", "DanmakuHeatmap"]),
    ("page-danmaku", ["PlayerSources", "DanmakuOffset", "DanmakuNoMatch"]),
    ("page-danmaku", ["DanmakuMatch", "DanmakuBlocklist", "DanmakuImportLocal", "DanmakuListMenu"]),
    ("page-danmaku", ["SettingsDanmaku"]),
    ("page-manage", ["Collection", "History", "Libraries"]),
    ("page-manage", ["LibraryDetail", "LibraryRename", "LibraryDuplicates"]),
    ("page-manage", ["LibraryMissing", "LibraryAdd", "MatchSheet", "Notifications"]),
    ("page-manage", ["Downloads", "TorrentSearch", "SubscribeSheet"]),
    ("page-manage", ["RuleEditor", "AddLinkSheet"]),
    ("page-settings", ["SettingsGeneral", "SettingsServer", "SettingsPlayer"]),
    ("page-settings", ["SettingsSubtitles", "SettingsKeyboard", "SettingsIntegrations"]),
    ("page-settings", ["SettingsNotifications", "SettingsDownloads", "SettingsAccount"]),
    ("page-settings", ["SettingsAbout"]),
    ("page-onboard", ["ServerAdd", "TwoFactor", "SetupRedirect"]),
    ("page-onboard", ["ConnectionError", "MenuBarExtra", "SystemIntegration"]),
]

NOTES3 = dict(gen2.NOTES2)
NOTES3["page-player"] = [
    ("n-player", 0, -260, 420, "Player：開播前海報牆 → mpv 畫面 + Core Animation 彈幕層 + 玻璃 floating OSC（OP/ED 區段、縮圖 peek）。右側 inspector 六個 tab，T 收起 = theater（第三張）。第三、四列：章節/區段、倍速、技術資訊 (I)、A-B 循環、快捷鍵表、下一集。"),
    ("n-osd", 0, 3300, 420, "OSD 總表、Mini 浮窗、窄視窗 OSC 降級；狀態列：緩衝 / 錯誤 / 轉碼 fallback / 右鍵 / 拖放字幕；最後一張是主視窗 + 播放器雙視窗的桌面情境。"),
]
NOTES3["page-danmaku"] = [
    ("n-danmaku", 0, -260, 460, "彈幕系統（一級功能）：列表 + 設定 popover → 發送 popover（模式/顏色/字級/預覽，shape {time,mode,color,comment}）→ seek bar 密度熱力圖 + 高能時刻。第二列：Bilibili 來源匯入、每來源時間偏移（OP 指紋自動對齊）、未匹配狀態。第三列：DandanPlay 匹配對話框（hash + 檔名候選）、封鎖規則（關鍵字/正則/使用者，本集命中數）、本機 XML/JSON 載入、列表右鍵。最後是設定頁的彈幕分頁。"),
]


def main() -> None:
    boards_all = dict(gen.ARTBOARDS)
    boards_all["Main"] = (lambda: gen.doc(gen.ab_home(False)), 1440, 900)
    boards_all.update(gen2.NEW_ARTBOARDS)
    boards_all.update(NEW3)
    pages = [{"id": "page-browse", "name": "瀏覽"}, {"id": "page-player", "name": "播放器"}, {"id": "page-danmaku", "name": "彈幕"},
             {"id": "page-manage", "name": "管理"}, {"id": "page-settings", "name": "設定"}, {"id": "page-onboard", "name": "Onboarding + 系統"}]
    boards, y_by_page, used = [], {}, set()
    for page, names in ROWS3:
        y = y_by_page.get(page, 0)
        x, row_h = 0, 0
        for n in names:
            fn, w, h = boards_all[n]
            used.add(n)
            with open(os.path.join(OUT, f"{n}.dc.html"), "w", encoding="utf-8") as f:
                f.write(fn())
            boards.append({"file": f"{n}.dc.html", "x": x, "y": y, "w": w, "h": h, "page": page})
            x += w + 100
            row_h = max(row_h, h)
        y_by_page[page] = y + row_h + 160
    missing = set(boards_all) - used
    if missing:
        raise SystemExit(f"artboards not placed: {missing}")
    ann = [{"id": i, "x": x, "y": y, "w": w, "text": t, "page": p} for p, notes in NOTES3.items() for i, x, y, w, t in notes]
    canvas = {"artboards": boards, "pages": pages, "annotations": ann, "launch": {"view": "canvas", "page": "page-danmaku"}}
    with open(os.path.join(OUT, "canvas.json"), "w", encoding="utf-8") as f:
        json.dump(canvas, f, ensure_ascii=False, indent=2)
    with open(os.path.join(OUT, "artboards.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(b["file"] for b in boards) + "\n")
    print(f"wrote {len(boards)} artboards + canvas.json")


if __name__ == "__main__":
    main()
