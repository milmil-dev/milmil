import { msg } from "@lingui/core/macro"
import { useLingui } from "@lingui/react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { format, getDay } from "date-fns"
import { zhTW } from "date-fns/locale"
import { AnimatePresence, motion } from "motion/react"
import { useCallback, useEffect, useRef, useState } from "react"
import { PageTransition } from "../components/PageTransition"
import { Skeleton } from "../components/Skeleton"
import {
  type AnimeSummary,
  type CalendarDay,
  discoverApi,
  discoverKeys,
} from "../lib/api/discover"
import { translateGenre } from "../lib/genre-i18n"
import { animeGradient } from "../lib/gradient"
import { cn } from "../lib/utils"

const BANGUMI_WEEKDAYS = [
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
  "星期日",
]
const BANGUMI_WEEKDAYS_JP = [
  "月曜日",
  "火曜日",
  "水曜日",
  "木曜日",
  "金曜日",
  "土曜日",
  "日曜日",
]

function todayWeekdayCN(): string {
  const jsDay = getDay(new Date()) // 0=Sun
  return BANGUMI_WEEKDAYS[jsDay === 0 ? 6 : jsDay - 1] as string
}

function getWeekdayJapanese(bangumiWeekday: string): string {
  const idx = BANGUMI_WEEKDAYS.indexOf(bangumiWeekday)
  if (idx === -1) return ""
  return BANGUMI_WEEKDAYS_JP[idx] ?? ""
}

function getWeekdayFull(bangumiWeekday: string): string {
  const idx = BANGUMI_WEEKDAYS.indexOf(bangumiWeekday)
  if (idx === -1) return bangumiWeekday
  const now = new Date()
  const jsDay = getDay(now)
  const currentIdx = jsDay === 0 ? 6 : jsDay - 1
  const diff = idx - currentIdx
  const target = new Date(now)
  target.setDate(target.getDate() + diff)
  return format(target, "EEEE", { locale: zhTW })
}

function getDateForWeekday(bangumiWeekday: string): string {
  const idx = BANGUMI_WEEKDAYS.indexOf(bangumiWeekday)
  if (idx === -1) return ""
  const now = new Date()
  const jsDay = getDay(now)
  const currentIdx = jsDay === 0 ? 6 : jsDay - 1
  const diff = idx - currentIdx
  const target = new Date(now)
  target.setDate(target.getDate() + diff)
  return format(target, "M月d日")
}

function getWeekdayTabLabel(bangumiWeekday: string): string {
  const weekdayCn = bangumiWeekday.replace(/^星期/, "週")
  const weekdayJp = getWeekdayJapanese(bangumiWeekday)
  const weekdayJpShort = weekdayJp.charAt(0)
  const date = getDateForWeekday(bangumiWeekday)
  return `${weekdayCn} (${weekdayJpShort}) ${date}`
}

function getCurrentSeason(i18n: ReturnType<typeof useLingui>["i18n"]): string {
  const month = new Date().getMonth() + 1
  const year = new Date().getFullYear()
  if (month <= 3) return `${year} ${i18n._(msg`schedule.season.winter`)}`
  if (month <= 6) return `${year} ${i18n._(msg`schedule.season.spring`)}`
  if (month <= 9) return `${year} ${i18n._(msg`schedule.season.summer`)}`
  return `${year} ${i18n._(msg`schedule.season.fall`)}`
}

/* ── Anime row item ────────────────────────────────────────── */

function ScheduleAnimeItem({
  anime,
  index,
  locale,
  variant = "row",
}: {
  anime: AnimeSummary
  index: number
  locale: string
  variant?: "row" | "card"
}) {
  const hasCover = anime.cover_image?.startsWith("http")
  const [showCard, setShowCard] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [cardSide, setCardSide] = useState<"right" | "left">("right")
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null)
  const itemRef = useRef<HTMLDivElement>(null)

  // Fetch full detail when hovered (prefetch on hover, show on delay)
  const { data: detail } = useQuery({
    queryKey: discoverKeys.detail(anime.bangumi_id),
    queryFn: () => discoverApi.detail(anime.bangumi_id),
    enabled: hovered && anime.bangumi_id > 0,
    staleTime: 5 * 60 * 1000,
  })

  const handleEnter = useCallback(() => {
    setHovered(true)
    // Detect available space — card is 400px + 16px margin
    if (itemRef.current) {
      const rect = itemRef.current.getBoundingClientRect()
      const spaceRight = window.innerWidth - rect.right
      setCardSide(spaceRight >= 530 ? "right" : "left")
    }
    timerRef.current = setTimeout(() => setShowCard(true), 400)
  }, [])

  const handleLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setShowCard(false)
    setHovered(false)
  }, [])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <motion.div
      ref={itemRef}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.025, duration: 0.3 }}
      className="relative"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      <Link
        to={`/anime/${anime.bangumi_id}` as string}
        className={cn(
          "group rounded-lg transition-colors",
          variant === "row"
            ? "flex items-center gap-3.5 py-3 px-2.5 -mx-2.5 hover:bg-white/[0.04]"
            : "block p-1.5 -m-1.5 hover:bg-white/[0.03]",
        )}
      >
        {/* Cover */}
        <div
          className={cn(
            "relative rounded overflow-hidden",
            variant === "row"
              ? "shrink-0 w-[80px] h-[112px]"
              : "w-full aspect-[4/5]",
          )}
          style={
            hasCover ? undefined : { background: animeGradient(anime.title) }
          }
        >
          {hasCover && (
            <img
              src={anime.cover_image}
              alt=""
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          )}
          {/* Next episode badge — top left */}
          {anime.next_episode && anime.next_episode > 0 && (
            <span
              className="absolute top-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-mm-accent tabular-nums backdrop-blur-md"
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
            >
              EP {anime.next_episode}
            </span>
          )}
          {/* Rating badge — top right, glass */}
          {anime.score > 0 && (
            <span
              className="absolute top-1 right-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white tabular-nums backdrop-blur-md"
              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
            >
              ♡ {anime.score.toFixed(1)}
            </span>
          )}
        </div>

        {/* Info */}
        <div className={cn("min-w-0", variant === "row" ? "flex-1" : "mt-1.5")}>
          <p
            className={cn(
              "leading-snug text-mm-text-primary font-medium group-hover:text-white transition-colors",
              variant === "row"
                ? "text-[13px] truncate"
                : "text-[14px] line-clamp-2",
            )}
          >
            {anime.title}
          </p>
          {variant === "row" &&
            anime.title_original &&
            anime.title_original !== anime.title && (
              <p className="text-[11px] text-mm-text-muted truncate mt-0.5">
                {anime.title_original}
              </p>
            )}
          {variant === "row" && (
            <div className="flex items-center gap-2 mt-1">
              {anime.score > 0 && (
                <span className="text-[11px] font-semibold text-mm-accent tabular-nums">
                  {anime.score.toFixed(1)}
                </span>
              )}
              {anime.episode_count > 0 && (
                <span className="text-[10px] text-mm-text-muted">
                  {anime.episode_count} ep
                </span>
              )}
            </div>
          )}
          {variant === "card" && anime.episode_count > 0 && (
            <span className="text-[10px] text-mm-text-muted mt-0.5 block">
              {anime.episode_count} ep
            </span>
          )}
        </div>

        {/* Arrow hint — row only */}
        {variant === "row" && (
          <span className="text-mm-text-muted text-[11px] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            →
          </span>
        )}
      </Link>

      {/* Hover card — mini hero banner style */}
      {showCard &&
        (() => {
          const info = detail || anime
          const bannerSrc =
            detail?.banner_image || anime.banner_image || anime.cover_image
          const hasBanner = !!(detail?.banner_image || anime.banner_image)
          const tags = detail?.tags || []
          const genres = anime.genres || []
          const displayTags = tags.length > 0 ? tags : genres
          const synopsis = detail?.synopsis || anime.description

          return (
            <div
              className={cn(
                "absolute top-1/2 -translate-y-1/2 z-50 w-[506px] pointer-events-none hidden lg:block",
                cardSide === "right" ? "left-full ml-4" : "right-full mr-4",
              )}
            >
              <motion.div
                initial={{
                  opacity: 0,
                  x: cardSide === "right" ? -10 : 10,
                  scale: 0.97,
                }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="relative rounded-lg overflow-hidden border border-white/[0.08] shadow-2xl"
              >
                {/* Full-bleed background image */}
                <div className="absolute inset-0">
                  {bannerSrc?.startsWith("http") ? (
                    <img
                      src={bannerSrc}
                      alt=""
                      className="w-full h-full object-cover"
                      style={
                        !hasBanner
                          ? {
                              filter:
                                "blur(20px) saturate(1.2) brightness(0.5)",
                              transform: "scale(1.4)",
                            }
                          : { filter: "blur(2px) brightness(0.45)" }
                      }
                    />
                  ) : (
                    <div
                      className="w-full h-full"
                      style={{ background: animeGradient(anime.title) }}
                    />
                  )}
                  <div className="absolute inset-0 bg-black/40" />
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.8) 100%)",
                    }}
                  />
                </div>

                {/* Content — poster + info */}
                <div className="relative z-[1] flex items-start gap-4 p-4">
                  {/* Poster */}
                  <div
                    className="shrink-0 w-[150px] h-[210px] rounded overflow-hidden shadow-lg ring-1 ring-white/10"
                    style={
                      hasCover
                        ? undefined
                        : { background: animeGradient(anime.title) }
                    }
                  >
                    {hasCover && (
                      <img
                        src={anime.cover_image}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 pt-0.5 space-y-1.5">
                    {/* Title */}
                    <p className="text-[15px] font-bold text-white leading-snug line-clamp-2">
                      {info.title}
                    </p>
                    {info.title_original &&
                      info.title_original !== info.title && (
                        <p className="text-[11px] text-white/40 truncate">
                          {info.title_original}
                        </p>
                      )}

                    {/* Tags / Genres */}
                    {displayTags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {displayTags.slice(0, 5).map((t) => (
                          <span
                            key={t}
                            className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-mm-accent/10 text-mm-accent/80"
                          >
                            {translateGenre(t, locale)}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Score + meta */}
                    <div className="flex items-center gap-2.5 flex-wrap">
                      {info.score > 0 && (
                        <span className="text-[13px] font-bold text-mm-accent">
                          ♡ {info.score.toFixed(1)}
                        </span>
                      )}
                      {info.episode_count > 0 && (
                        <span className="text-[11px] text-white/50">
                          {info.episode_count} ep
                        </span>
                      )}
                      {info.air_date && (
                        <span className="text-[11px] text-white/40">
                          {new Date(info.air_date).getFullYear()}
                        </span>
                      )}
                      {detail?.rating && detail.rating.total > 0 && (
                        <span className="text-[11px] text-white/40">
                          {detail.rating.total} ratings
                        </span>
                      )}
                    </div>

                    {/* Synopsis */}
                    {synopsis && (
                      <p className="text-[11px] text-white/50 leading-relaxed line-clamp-4">
                        {synopsis.replace(/<[^>]+>/g, "")}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          )
        })()}
    </motion.div>
  )
}

/* ── Skeleton loader ───────────────────────────────────────── */

function ScheduleSkeleton() {
  return (
    <div className="space-y-6">
      {/* Tab bar skeleton */}
      <div className="flex gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-16 rounded-lg" />
        ))}
      </div>
      {/* Items skeleton */}
      <div className="space-y-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-2.5">
            <Skeleton className="w-[42px] h-[58px] rounded" />
            <div className="flex-1 space-y-2">
              <Skeleton
                className="h-3.5"
                style={{ width: `${55 + (i % 3) * 15}%` }}
              />
              <Skeleton className="h-2.5 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Main page ─────────────────────────────────────────────── */

export function SchedulePage() {
  const { i18n } = useLingui()
  const tabsRef = useRef<HTMLDivElement>(null)
  const {
    data: calendar,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: discoverKeys.calendar(),
    queryFn: discoverApi.calendar,
  })

  const today = todayWeekdayCN()
  const [activeDay, setActiveDay] = useState<string | "all">(today)

  // Reorder: today first
  const sortedCalendar = (() => {
    if (!calendar) return []
    const todayIdx = BANGUMI_WEEKDAYS.indexOf(today)
    const reordered = [
      ...BANGUMI_WEEKDAYS.slice(todayIdx),
      ...BANGUMI_WEEKDAYS.slice(0, todayIdx),
    ]
    return reordered
      .map((wd) => calendar.find((d) => d.weekday === wd))
      .filter((d): d is CalendarDay => d !== undefined)
  })()

  // Scroll active tab into view on mount
  useEffect(() => {
    if (!tabsRef.current) return
    const activeBtn = tabsRef.current.querySelector('[data-active="true"]')
    if (activeBtn) {
      activeBtn.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      })
    }
  }, [sortedCalendar.length])

  // Total anime count for the week
  const totalCount = sortedCalendar.reduce((sum, d) => sum + d.items.length, 0)

  return (
    <PageTransition>
      <div className="min-h-screen px-4 md:px-6 pt-6 pb-16">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-1 h-7 rounded-full bg-gradient-to-b from-mm-accent to-mm-accent/30" />
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">
                  {getCurrentSeason(i18n)}
                </h1>
                {!isLoading && totalCount > 0 && (
                  <p className="text-[13px] text-mm-accent/50 mt-0.5">
                    {totalCount} {i18n._(msg`schedule.totalShows`)}
                  </p>
                )}
              </div>
            </div>
          </div>
        </motion.div>

        {isLoading && <ScheduleSkeleton />}

        {isError && (
          <div className="text-center py-16">
            <p className="text-sm mb-3 text-mm-text-secondary">
              {i18n._(msg`schedule.loadFailed`)}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="text-sm font-medium text-mm-accent cursor-pointer"
            >
              {i18n._(msg`common.retry`)}
            </button>
          </div>
        )}

        {!isLoading && !isError && sortedCalendar.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            {/* Weekday tabs — underline style */}
            <div
              ref={tabsRef}
              className="flex items-end gap-0 overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-none border-b border-white/[0.06] mb-5"
            >
              {/* 全部 tab */}
              <button
                type="button"
                data-active={activeDay === "all"}
                onClick={() => setActiveDay("all")}
                className={cn(
                  "relative shrink-0 px-4 pb-2.5 pt-2 text-[13px] font-semibold cursor-pointer transition-colors duration-200",
                  activeDay === "all"
                    ? "text-mm-accent"
                    : "text-mm-text-tertiary hover:text-mm-text-secondary",
                )}
              >
                {i18n._(msg`schedule.all`)}
                {activeDay === "all" && (
                  <motion.div
                    layoutId="schedule-underline"
                    className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full bg-mm-accent"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
              </button>

              <div className="w-px h-4 bg-white/[0.06] mx-0.5 mb-2 shrink-0" />

              {sortedCalendar.map((day) => {
                const isToday = day.weekday === today
                const isActive = day.weekday === activeDay
                return (
                  <button
                    key={day.weekday}
                    type="button"
                    data-active={isActive}
                    onClick={() => setActiveDay(day.weekday)}
                    className={cn(
                      "relative shrink-0 flex items-center gap-1.5 px-3 pb-2.5 pt-2 cursor-pointer transition-colors duration-200",
                      isActive
                        ? "text-mm-accent"
                        : "text-white/90 hover:text-white",
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="schedule-underline"
                        className="absolute bottom-0 left-1 right-1 h-[2px] rounded-full bg-mm-accent"
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 38,
                        }}
                      />
                    )}
                    <span
                      className={cn(
                        "text-[13px] font-bold whitespace-nowrap",
                        isActive ? "text-mm-accent" : "text-white/80",
                      )}
                    >
                      {day.weekday.replace(/^星期/, "週")} (
                      {getWeekdayJapanese(day.weekday).slice(0, 1)})
                      <span className="ml-1 text-[10px] font-medium text-white/40">
                        {getDateForWeekday(day.weekday)}
                      </span>
                    </span>
                    {isToday && !isActive && (
                      <div className="w-1 h-1 rounded-full bg-mm-accent shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>

            {/* Content — smooth crossfade on tab change */}
            <AnimatePresence mode="wait">
              {activeDay !== "all" ? (
                (() => {
                  const activeCalendar = sortedCalendar.find(
                    (d) => d.weekday === activeDay,
                  )
                  if (!activeCalendar) return null
                  return (
                    <motion.div
                      key={activeDay}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <div className="flex flex-col gap-1 mb-3">
                        <div className="flex items-center gap-2">
                          <h2 className="text-[18px] font-bold text-white">
                            {getWeekdayJapanese(activeCalendar.weekday)}
                          </h2>
                          <span className="text-[11px] font-semibold text-mm-accent tabular-nums bg-mm-accent/15 rounded-full px-2 py-0.5">
                            {activeCalendar.items.length}
                          </span>
                          {activeCalendar.weekday === today && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-mm-accent bg-mm-accent/15 px-2 py-0.5 rounded-full">
                              {i18n._(msg`schedule.today`)}
                            </span>
                          )}
                        </div>
                        <p className="text-[13px] text-mm-text-muted">
                          {getWeekdayFull(activeCalendar.weekday)} (
                          {getDateForWeekday(activeCalendar.weekday)})
                        </p>
                      </div>
                      {activeCalendar.items.length > 0 ? (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-5 gap-y-6">
                          {activeCalendar.items.map((anime, i) => (
                            <ScheduleAnimeItem
                              key={anime.bangumi_id}
                              anime={anime}
                              index={i}
                              locale={i18n.locale}
                              variant="card"
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="py-12 text-center">
                          <p className="text-[13px] text-mm-text-muted">
                            {i18n._(msg`schedule.noShows`)}
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )
                })()
              ) : (
                <motion.div
                  key="all"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-8"
                >
                  {sortedCalendar.map((day) => (
                    <div key={day.weekday}>
                      <div className="flex flex-col gap-1 mb-3">
                        <div className="flex items-center gap-2">
                          <h2 className="text-[18px] font-bold text-white">
                            {getWeekdayJapanese(day.weekday)}
                          </h2>
                          <span className="text-[18px] font-bold text-mm-accent tabular-nums">
                            {day.items.length}
                          </span>
                          {day.weekday === today && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-mm-accent bg-mm-accent/15 px-2 py-0.5 rounded-full">
                              {i18n._(msg`schedule.today`)}
                            </span>
                          )}
                        </div>
                        <p className="text-[13px] text-mm-text-muted">
                          {getWeekdayFull(day.weekday)} (
                          {getDateForWeekday(day.weekday)})
                        </p>
                      </div>
                      {day.items.length > 0 ? (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-x-5 gap-y-6">
                          {day.items.map((anime, i) => (
                            <ScheduleAnimeItem
                              key={anime.bangumi_id}
                              anime={anime}
                              index={i}
                              locale={i18n.locale}
                              variant="card"
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="text-[12px] text-mm-text-muted py-4">—</p>
                      )}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </PageTransition>
  )
}
