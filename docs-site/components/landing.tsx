'use client';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { motion } from 'motion/react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  FolderLibraryIcon,
  PlayCircleIcon,
  SubtitleIcon,
  Download04Icon,
  DiscoverSquareIcon,
  Refresh01Icon,
} from '@hugeicons/core-free-icons';

const FEATURES = [
  { icon: FolderLibraryIcon, title: msg`landing.f1`, desc: msg`landing.d1` },
  { icon: PlayCircleIcon, title: msg`landing.f2`, desc: msg`landing.d2` },
  { icon: SubtitleIcon, title: msg`landing.f3`, desc: msg`landing.d3` },
  { icon: Download04Icon, title: msg`landing.f4`, desc: msg`landing.d4` },
  { icon: DiscoverSquareIcon, title: msg`landing.f5`, desc: msg`landing.d5` },
  { icon: Refresh01Icon, title: msg`landing.f6`, desc: msg`landing.d6` },
];

function BangumiLogo() {
  return (
    <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none">
      <rect width="32" height="32" rx="6" fill="#F09199" />
      <path d="M8 10h16v2H8zm0 5h16v2H8zm0 5h12v2H8z" fill="#fff" />
    </svg>
  );
}
function AniListLogo() {
  return (
    <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none">
      <rect width="32" height="32" rx="6" fill="#02A9FF" />
      <path d="M10 22V12l4 10h-4zm8-12l4 12h-4l-1-3h-2l3-9z" fill="#fff" />
    </svg>
  );
}
function DandanPlayLogo() {
  return (
    <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none">
      <rect width="32" height="32" rx="6" fill="#2B6CB0" />
      <text x="16" y="21" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="700">弹</text>
    </svg>
  );
}
function RcloneLogo() {
  return (
    <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none">
      <rect width="32" height="32" rx="6" fill="#3B82F6" />
      <path d="M16 8l8 12H8L16 8z" fill="#fff" opacity="0.9" />
      <path d="M16 14l4 6H12l4-6z" fill="#3B82F6" />
    </svg>
  );
}
function FFmpegLogo() {
  return (
    <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none">
      <rect width="32" height="32" rx="6" fill="#388E3C" />
      <text x="16" y="21" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="800" fontFamily="monospace">FF</text>
    </svg>
  );
}
function TMDBLogo() {
  return (
    <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none">
      <rect width="32" height="32" rx="6" fill="#01B4E4" />
      <text x="16" y="20" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="700" fontFamily="sans-serif">TMDB</text>
    </svg>
  );
}

const INTEGRATIONS = [
  { name: 'Bangumi', Logo: BangumiLogo },
  { name: 'AniList', Logo: AniListLogo },
  { name: 'DandanPlay', Logo: DandanPlayLogo },
  { name: 'rclone', Logo: RcloneLogo },
  { name: 'FFmpeg', Logo: FFmpegLogo },
  { name: 'TMDB', Logo: TMDBLogo },
];

const POSTERS = [
  'https://cdn.myanimelist.net/images/anime/1015/138006l.jpg',
  'https://cdn.myanimelist.net/images/anime/1764/126627l.jpg',
  'https://cdn.myanimelist.net/images/anime/1908/135431l.jpg',
  'https://cdn.myanimelist.net/images/anime/1573/146863l.jpg',
  'https://cdn.myanimelist.net/images/anime/1206/124080l.jpg',
  'https://cdn.myanimelist.net/images/anime/1003/138846l.jpg',
  'https://cdn.myanimelist.net/images/anime/1299/110774l.jpg',
  'https://cdn.myanimelist.net/images/anime/1441/122795l.jpg',
  'https://cdn.myanimelist.net/images/anime/1170/124312l.jpg',
  'https://cdn.myanimelist.net/images/anime/1935/127974l.jpg',
  'https://cdn.myanimelist.net/images/anime/1286/99889l.jpg',
  'https://cdn.myanimelist.net/images/anime/1000/110531l.jpg',
  'https://cdn.myanimelist.net/images/anime/1048/135814l.jpg',
  'https://cdn.myanimelist.net/images/anime/1223/96541l.jpg',
  'https://cdn.myanimelist.net/images/anime/1384/128449l.jpg',
  'https://cdn.myanimelist.net/images/anime/1171/109222l.jpg',
  'https://cdn.myanimelist.net/images/anime/1244/138851l.jpg',
  'https://cdn.myanimelist.net/images/anime/1909/143607l.jpg',
  'https://cdn.myanimelist.net/images/anime/1426/117063l.jpg',
  'https://cdn.myanimelist.net/images/anime/1337/99013l.jpg',
  'https://cdn.myanimelist.net/images/anime/1100/122911l.jpg',
  'https://cdn.myanimelist.net/images/anime/1015/138006l.jpg',
  'https://cdn.myanimelist.net/images/anime/1764/126627l.jpg',
  'https://cdn.myanimelist.net/images/anime/1908/135431l.jpg',
];

export function LandingPage({ lang }: { lang: string }) {
  const { i18n } = useLingui();

  return (
    <div className="bg-[--mm-bg] text-white/90">
      {/* ═══ HERO ═══ */}
      <section className="relative min-h-screen overflow-hidden flex items-center justify-center">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -inset-[20%]" style={{ transform: 'rotate(-12deg) scale(1.3)' }}>
            <div className="grid grid-cols-6 gap-1.5 opacity-[0.35]">
              {POSTERS.map((src, i) => (
                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04, duration: 0.8 }} className="aspect-[3/4] overflow-hidden rounded-sm">
                  <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
                </motion.div>
              ))}
            </div>
          </div>
          <div className="absolute inset-0 bg-[--mm-bg]/50" />
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 30%, var(--mm-bg) 80%)' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-[--mm-accent]/[0.04] blur-[120px]" />
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }} className="relative z-10 text-center max-w-[720px] px-6">
          <h1 className="landing-title text-[80px] max-md:text-[48px] font-extrabold tracking-[-3px] leading-none mb-5 drop-shadow-[0_4px_24px_rgba(232,143,170,0.2)]">milmil</h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="text-xl text-white/65 mb-3.5 tracking-wide">
            {i18n._(msg`landing.tagline`)}
          </motion.p>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="text-[15px] text-white/[0.38] leading-[1.7] max-w-[520px] mx-auto mb-9">
            {i18n._(msg`landing.desc`)}
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="flex gap-3 justify-center flex-wrap">
            <a href={`/${lang}/docs`} className="inline-flex px-8 py-3.5 rounded-[10px] text-sm font-semibold bg-[--mm-accent] text-[--mm-bg] shadow-[0_4px_16px_rgba(232,143,170,0.25)] hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(232,143,170,0.35)] transition-all">
              {i18n._(msg`landing.getStarted`)}
            </a>
            <a href="https://github.com/milmil-dev/milmil" className="inline-flex px-7 py-3.5 rounded-[10px] text-sm font-medium bg-white/5 border border-white/10 text-white/75 hover:bg-white/10 hover:border-white/[0.18] transition-all">
              {i18n._(msg`landing.viewGithub`)}
            </a>
          </motion.div>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }} className="mt-7 inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-black/40 border border-white/[0.08] font-mono text-[13px] text-white/45 backdrop-blur-sm">
            <span className="text-[--mm-accent] font-semibold">$</span>
            <span className="text-white/70">docker compose up -d</span>
          </motion.div>
        </motion.div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section className="relative py-24 px-6 max-w-[1080px] mx-auto">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-px bg-gradient-to-r from-transparent via-[--mm-accent]/30 to-transparent" />
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
          <h2 className="text-4xl font-bold tracking-tight mb-3">{i18n._(msg`landing.featuresTitle`)}</h2>
          <p className="text-[15px] text-white/40 max-w-[480px] mx-auto">{i18n._(msg`landing.featuresDesc`)}</p>
        </motion.div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {FEATURES.map((f, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
              className="p-7 rounded-2xl bg-gradient-to-br from-white/[0.02] to-white/[0.01] border border-white/[0.06] transition-all duration-300 hover:bg-white/[0.04] hover:border-[--mm-accent]/15 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(0,0,0,0.3)]">
              <div className="w-11 h-11 rounded-xl bg-[--mm-accent]/[0.08] border border-[--mm-accent]/[0.12] flex items-center justify-center mb-5">
                <HugeiconsIcon icon={f.icon} size={20} strokeWidth={1.5} className="text-[--mm-accent]" />
              </div>
              <h3 className="text-base font-semibold text-[#f0f0f0] mb-2.5">{i18n._(f.title)}</h3>
              <p className="text-[13px] text-white/[0.38] leading-relaxed">{i18n._(f.desc)}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ═══ SCREENSHOTS ═══ */}
      <section className="relative py-20 px-6 max-w-[1100px] mx-auto">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
          <h2 className="text-4xl font-bold tracking-tight mb-3">{i18n._(msg`landing.screenshotsTitle`)}</h2>
          <p className="text-[15px] text-white/40">{i18n._(msg`landing.screenshotsDesc`)}</p>
        </motion.div>
        <div className="flex gap-6 max-md:flex-col">
          <SSFrame title={i18n._(msg`landing.home`)} caption={i18n._(msg`landing.homeCaption`)} delay={0}><MockHome /></SSFrame>
          <SSFrame title={i18n._(msg`landing.detail`)} caption={i18n._(msg`landing.detailCaption`)} delay={0.1}><MockDetail /></SSFrame>
          <SSFrame title={i18n._(msg`landing.player`)} caption={i18n._(msg`landing.playerCaption`)} delay={0.2}><MockPlayer /></SSFrame>
        </div>
      </section>

      {/* ═══ DEPLOY ═══ */}
      <section className="relative py-20 px-6 overflow-hidden bg-gradient-to-b from-[--mm-bg] via-[#0c0a12] to-[--mm-bg]">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full bg-[radial-gradient(ellipse,rgba(232,143,170,0.03)_0%,transparent_70%)] pointer-events-none" />
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="relative z-10 max-w-[680px] mx-auto text-center">
          <h2 className="text-[32px] font-bold mb-3">{i18n._(msg`landing.deployTitle`)}</h2>
          <p className="text-[15px] text-white/40 mb-10">{i18n._(msg`landing.deployDesc`)}</p>
          <div className="rounded-[14px] overflow-hidden text-left border border-white/[0.08] bg-[#111] shadow-[0_16px_48px_rgba(0,0,0,0.4)]">
            <div className="h-[38px] bg-[#1a1a1a] flex items-center px-3.5 gap-1.5 border-b border-white/5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" /><div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" /><div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
            </div>
            <div className="p-5 font-mono text-[13px] leading-8">
              <div><span className="text-[--mm-accent]">$</span> <span className="text-white/80">git clone https://github.com/milmil-dev/milmil</span></div>
              <div><span className="text-[--mm-accent]">$</span> <span className="text-white/80">cd milmil</span></div>
              <div><span className="text-[--mm-accent]">$</span> <span className="text-white/80">docker compose up -d</span></div>
              <div><span className="text-white/30">Creating milmil-postgres ... </span><span className="text-emerald-400">done</span></div>
              <div><span className="text-white/30">Creating milmil-redis    ... </span><span className="text-emerald-400">done</span></div>
              <div><span className="text-white/30">Creating milmil-api      ... </span><span className="text-emerald-400">done</span></div>
              <div><span className="text-white/30">Creating milmil-web      ... </span><span className="text-emerald-400">done</span></div>
              <div className="mt-2"><span className="text-emerald-400">✓</span> <span className="text-white/30">Open http://localhost:3000</span></div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ═══ INTEGRATIONS ═══ */}
      <section className="relative py-20 px-6 max-w-[900px] mx-auto">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-12">
          <h2 className="text-[32px] font-bold mb-3">{i18n._(msg`landing.integrationsTitle`)}</h2>
          <p className="text-[15px] text-white/40">{i18n._(msg`landing.integrationsDesc`)}</p>
        </motion.div>
        <div className="flex justify-center items-center gap-12 flex-wrap">
          {INTEGRATIONS.map((int, i) => (
            <motion.div key={int.name} initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
              className="flex flex-col items-center gap-2.5 opacity-60 hover:opacity-100 transition-opacity">
              <div className="w-14 h-14 rounded-[14px] bg-white/[0.04] border border-white/[0.06] flex items-center justify-center overflow-hidden p-2.5">
                <int.Logo />
              </div>
              <span className="text-[11px] text-white/35 font-medium">{int.name}</span>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="relative py-24 px-6 text-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] rounded-full bg-[radial-gradient(ellipse,rgba(232,143,170,0.03)_0%,transparent_70%)] pointer-events-none" />
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <h2 className="text-4xl font-bold mb-3.5">{i18n._(msg`landing.ctaTitle`)}</h2>
          <p className="text-[15px] text-white/40 max-w-[420px] mx-auto mb-8">{i18n._(msg`landing.ctaDesc`)}</p>
          <div className="flex gap-3 justify-center">
            <a href={`/${lang}/docs/getting-started/installation`} className="inline-flex px-8 py-3.5 rounded-[10px] text-sm font-semibold bg-[--mm-accent] text-[--mm-bg] shadow-[0_4px_16px_rgba(232,143,170,0.25)] hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(232,143,170,0.35)] transition-all">
              {i18n._(msg`landing.readDocs`)}
            </a>
            <a href="https://github.com/milmil-dev/milmil" className="inline-flex px-7 py-3.5 rounded-[10px] text-sm font-medium bg-white/5 border border-white/10 text-white/75 hover:bg-white/10 hover:border-white/[0.18] transition-all">
              {i18n._(msg`landing.viewGithub`)}
            </a>
          </div>
        </motion.div>
      </section>

      <footer className="px-6 py-8 text-center border-t border-white/5">
        <div className="flex justify-center gap-6 mb-3">
          <a href={`/${lang}/docs`} className="text-xs text-white/35 no-underline hover:text-white/60 transition-colors">Docs</a>
          <a href="https://github.com/milmil-dev/milmil" className="text-xs text-white/35 no-underline hover:text-white/60 transition-colors">GitHub</a>
        </div>
        <p className="text-xs text-white/20">milmil — Self-hosted Anime Media Server</p>
      </footer>
    </div>
  );
}

function SSFrame({ title, caption, children, delay }: { title: string; caption: string; children: React.ReactNode; delay: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay }} className="flex-1">
      <div className="rounded-xl overflow-hidden border border-white/[0.08] bg-[#111] shadow-[0_16px_48px_rgba(0,0,0,0.4)] transition-all hover:-translate-y-1 hover:shadow-[0_24px_64px_rgba(0,0,0,0.5)]">
        <div className="h-8 bg-[#1a1a1a] flex items-center px-2.5 gap-[5px] border-b border-white/5">
          <div className="w-2 h-2 rounded-full bg-[#ff5f57]" /><div className="w-2 h-2 rounded-full bg-[#febc2e]" /><div className="w-2 h-2 rounded-full bg-[#28c840]" />
        </div>
        <div className="h-[280px] overflow-hidden">{children}</div>
      </div>
      <div className="mt-3.5"><h3 className="text-sm font-semibold mb-1">{title}</h3><p className="text-xs text-white/35 leading-normal">{caption}</p></div>
    </motion.div>
  );
}

function MockHome() {
  return (
    <div className="flex h-full bg-gradient-to-br from-[#0f0f18] to-[#161624]">
      <div className="w-12 bg-white/[0.015] border-r border-white/5 flex flex-col items-center pt-2.5 gap-2.5">
        <div className="w-[22px] h-[22px] rounded-[5px] bg-[--mm-accent]/20 border border-[--mm-accent]/25" />
        {[1, 2, 3, 4].map((j) => <div key={j} className="w-[22px] h-[22px] rounded-[5px] bg-white/5" />)}
      </div>
      <div className="flex-1 p-3.5">
        <div className="h-[120px] rounded-lg bg-gradient-to-br from-[--mm-accent]/[0.12] to-blue-500/[0.08] mb-3 flex items-end p-3.5">
          <span className="text-[11px] text-white/40 font-semibold">Trending</span>
        </div>
        <div className="text-[10px] text-white/30 mb-2 font-semibold tracking-wider">CONTINUE WATCHING</div>
        <div className="flex gap-2">{[1, 2, 3].map((j) => <div key={j} className="flex-1 h-[70px] rounded-md bg-white/[0.025] border border-white/[0.04]" />)}</div>
      </div>
    </div>
  );
}

function MockDetail() {
  return (
    <div className="h-full bg-gradient-to-br from-[#0f0f18] to-[#161624] p-3.5">
      <div className="flex gap-3.5 mb-3.5">
        <div className="w-20 h-28 rounded-md bg-gradient-to-br from-[--mm-accent]/15 to-pink-500/10 shrink-0" />
        <div>
          <div className="text-sm font-bold text-white/80 mb-1.5">Anime Title</div>
          <div className="text-[10px] text-white/30 mb-2">♡ 8.5 · 24 eps · 2024</div>
          <div className="flex gap-1">{['Action', 'Fantasy', 'Drama'].map((g) => <span key={g} className="px-2 py-0.5 rounded bg-white/5 text-[9px] text-white/40">{g}</span>)}</div>
        </div>
      </div>
      <div className="text-[10px] text-white/30 mb-2 font-semibold tracking-wider">EPISODES</div>
      {['The Beginning', 'New World', 'Rising', 'Clash'].map((ep, i) => (
        <div key={ep} className="flex items-center gap-2 py-1.5 border-b border-white/[0.03]">
          <div className="w-12 h-7 rounded bg-white/[0.04] shrink-0" />
          <span className="text-[10px] text-white/35">Episode {i + 1} — {ep}</span>
        </div>
      ))}
    </div>
  );
}

function MockPlayer() {
  return (
    <div className="h-full bg-black relative flex items-center justify-center">
      <div className="absolute inset-0 bg-gradient-to-br from-[rgba(20,10,30,0.6)] to-[rgba(10,10,20,0.4)]" />
      <div className="w-12 h-12 rounded-full bg-white/15 flex items-center justify-center z-10 text-base text-white pl-[3px]">▶</div>
      <span className="absolute z-10 top-[30%] left-[20%] text-[11px] text-white/60">すごい！</span>
      <span className="absolute z-10 top-[45%] left-[55%] text-[11px] text-white/60">哈哈哈哈</span>
      <span className="absolute z-10 top-[25%] left-[65%] text-[11px] text-white/60">www</span>
      <span className="absolute z-10 top-[55%] left-[30%] text-[11px] text-white/60">lol</span>
      <div className="absolute bottom-0 inset-x-0 z-10 px-3.5 py-2.5 bg-gradient-to-t from-black/80 to-transparent flex items-center gap-2">
        <span className="text-[9px] text-white/40">12:34</span>
        <div className="flex-1 h-[3px] rounded-sm bg-white/15 overflow-hidden"><div className="w-[35%] h-full rounded-sm bg-[--mm-accent]" /></div>
        <span className="text-[9px] text-white/40">35:20</span>
      </div>
    </div>
  );
}
