/* SessionReport.tsx — Analytics & Insights, two levels:
     1. Session overview — date+time picker, a hero session score, and one card per
        exercise performed (reps or time). Click a card to drill in.
     2. Exercise detail — the full per-exercise analytics (rings, insights, and the
        hand-rolled SVG charts incl. the rule×phase heatmap).
   Styled for a premium, glanceable analytics feel (Whoop / Apple Health). */
import { Fragment, useEffect, useState } from 'react'
import { Ico, Icon, Q } from '../../tokens'
import {
  fetchProgress, fetchSessionOverview, fetchExerciseReport,
  type ProgressData, type ProgressSession, type SessionOverview, type OverviewExercise, type SessionReport as Report,
} from '../storage'
import { Donut, FaultRanked, FormLine, Heatmap, QualityBar, RomBars, ScoreRing, SetBars, TrendLine, scoreColor } from './charts'

const PHASES = ['setup', 'descent', 'bottom', 'ascent']
const ISSUE_FALLBACK: Record<string, string> = {
  knee_valgus: 'Knee valgus', lateral_torso_lean: 'Lateral torso lean',
  bilateral_symmetry_shoulder: 'Shoulder symmetry',
  stance_width: 'Stance width', trunk_lean: 'Trunk lean', shallow_depth: 'Shallow depth',
}
const TAG_COLORS: Record<string, string> = {
  Strength: '#8C7BFF', HIIT: '#FF6B6B', Core: '#2DD4BF', Cardio: '#FF8A3D', Mobility: '#56C2FF', Power: '#FFD13D',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/* "2026-06-15" → "Jun 15" (compact axis / chip label). */
function shortDate(date?: string): string {
  if (!date) return ''
  const [, m, d] = date.split('-').map(Number)
  return Number.isFinite(m) ? `${MONTHS[(m - 1) % 12]} ${d}` : date
}
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—')
/* total seconds → "45" (sub: sec) or "1:23" (sub: min). */
function fmtTotalTime(s: number | null): string {
  if (s == null) return '—'
  if (s < 60) return `${Math.round(s)}`
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`
}
/* "2026-07-06" + "Monday" → "Mon · Jul 6, 2026" (day-group header). */
function prettyDayDate(date?: string, day?: string): string {
  if (!date) return day ?? ''
  const [y, m, d] = date.split('-').map(Number)
  const md = Number.isFinite(m) ? `${MONTHS[(m - 1) % 12]} ${d}, ${y}` : date
  return day ? `${day.slice(0, 3)} · ${md}` : md
}
/* "17:40:12" → "5:40 PM". */
function timeLabel(t?: string): string {
  if (!t) return ''
  const [hh, mm] = t.split(':').map(Number)
  const ap = hh >= 12 ? 'PM' : 'AM'
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${ap}`
}
function partOfDay(t?: string): string {
  const hh = t ? Number(t.split(':')[0]) : 12
  return hh < 12 ? 'Morning' : hh < 17 ? 'Afternoon' : 'Evening'
}
/* seconds → "3h 42m" / "42m" / "—" (cross-session total training time). */
function fmtDuration(s?: number | null): string {
  if (s == null) return '—'
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60)
  return h ? `${h}h ${m}m` : `${m}m`
}

/* Analytics & Insights — three levels: Trends (landing) → Session → Exercise. */
export function AnalyticsInsights({ userId }: { userId: string }) {
  const [openSession, setOpenSession] = useState<string | null>(null)
  if (openSession) return <SessionView userId={userId} sessionId={openSession} onBack={() => setOpenSession(null)} />
  return <Trends userId={userId} onOpen={setOpenSession} />
}

/* ─────────────────────────  Level 0 · cross-session trends  ───────────────────────── */
function Trends({ userId, onOpen }: { userId: string; onOpen: (sessionId: string) => void }) {
  const [data, setData] = useState<ProgressData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchProgress(userId)
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setData(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [userId])

  if (loading) return <div className="an2-msg">Loading…</div>
  if (!data || data.totals.sessions === 0) {
    return (
      <div className="an2-empty">
        <h2 className="an2-empty__title">No sessions yet</h2>
        <p className="an2-empty__sub">Finish a Solo workout and your progress will start building here.</p>
      </div>
    )
  }

  const scored = data.sessions.filter((s) => s.score != null)
  const lineData = scored.map((s) => ({ label: shortDate(s.date), value: s.score as number }))
  const scores = scored.map((s) => s.score as number)
  const win = scores.slice(-4)                       // short-window trend for the hero chip
  const trendDelta = win.length >= 2 ? win[win.length - 1] - win[0] : 0
  const trendUp = trendDelta >= 0
  const history = [...data.sessions].reverse()       // newest first

  // group history by day → one header per date + its sessions (newest first within the day)
  const byDay: { date: string; day: string; items: ProgressSession[] }[] = []
  for (const s of history) {
    const last = byDay[byDay.length - 1]
    if (last && last.date === s.date) last.items.push(s)
    else byDay.push({ date: s.date, day: s.day, items: [s] })
  }

  return (
    <div className="an2">
      <div className="an2-head">
        <span className="an2-kicker">Analytics &amp; Insights</span>
        <h1 className="an2-title">Your progress</h1>
        <p className="an2-sub">How your form is trending across every session.</p>
      </div>

      {/* hero — the answer first: avg form + the trend */}
      <div className="an2-hero">
        <div className="an2-hero__l">
          <span className="an2-hero__cap">Avg form · all sessions</span>
          <span className="an2-hero__num" style={{ color: data.avg_form == null ? 'var(--v2-faint)' : scoreColor(data.avg_form) }}>
            {data.avg_form == null ? '—' : data.avg_form}
          </span>
          <span className="an2-hero__sub">out of 100 · {data.totals.sessions} session{data.totals.sessions === 1 ? '' : 's'} tracked</span>
          {scored.length >= 2 && (
            <span className={`an2-trendchip ${trendUp ? 'up' : 'down'}`}>
              {trendUp ? '▲' : '▼'} Trending {trendUp ? 'up' : 'down'} · {trendDelta >= 0 ? '+' : ''}{trendDelta} over last {win.length}
            </span>
          )}
        </div>
        <div className="an2-hero__r">
          <div className="an2-hero__rh"><b>Form score over time</b><span>target 80</span></div>
          {scored.length ? <TrendLine data={lineData} height={180} /> : <Empty text="Complete another tracked session to see your trend." />}
        </div>
      </div>

      {/* KPIs */}
      <div className="an2-kpis">
        <Kpi label="Streak" value={`${data.streak_days}`} sub={data.streak_days === 1 ? 'day' : 'days'} />
        <Kpi label="Last session" value={data.latest_score == null ? '—' : `${data.latest_score}`}
          color={data.latest_score == null ? undefined : scoreColor(data.latest_score)} delta={data.delta} />
        <Kpi label="Best" value={data.best == null ? '—' : `${data.best.score}`}
          sub={data.best ? shortDate(data.best.date) : ''} color={data.best == null ? undefined : scoreColor(data.best.score)} />
        <Kpi label="Workouts" value={`${data.totals.sessions}`} sub={`${data.this_week} this week`} />
        <Kpi label="Total time" value={fmtDuration(data.total_time_s)} sub={data.total_time_s == null ? undefined : 'trained'} />
      </div>

      {/* coaching takeaway */}
      {data.insights.length > 0 && (
        <>
          <div className="an2-sec">What to work on</div>
          <div className="an2-coach"><ul>{data.insights.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
        </>
      )}

      {/* session history — grouped by day, NO exercise names */}
      <div className="an2-sec">Session history</div>
      {byDay.map((g) => (
        <div className="an2-daygroup" key={g.date}>
          <div className="an2-dayhdr">
            {prettyDayDate(g.date, g.day)}
            {g.items.length > 1 && <span className="an2-daycount">{g.items.length} sessions</span>}
          </div>
          <div className="an2-hist">
            {g.items.map((s, i) => (
              <SessionRow key={s.session_id} s={s} onOpen={onOpen} seq={g.items.length > 1 ? g.items.length - i : undefined} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Kpi(
  { label, value, sub, color, delta }:
  { label: string; value: string; sub?: string; color?: string; delta?: number | null },
) {
  const deltaEl = delta != null
    ? <span className={delta >= 0 ? 'up' : 'down'}>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} vs prev</span>
    : null
  return (
    <div className="an2-kpi">
      <span className="an2-kpi__l">{label}</span>
      <span className="an2-kpi__v" style={{ color }}>{value}</span>
      {(deltaEl || sub) && <span className="an2-kpi__s">{deltaEl ?? sub}</span>}
    </div>
  )
}

function SessionRow({ s, onOpen, seq }: { s: ProgressSession; onOpen: (id: string) => void; seq?: number }) {
  return (
    <button type="button" className="an2-hrow" onClick={() => onOpen(s.session_id)}>
      <span className="an2-hrow__score">
        {s.score == null ? <span className="an2-dash">—</span> : <ScoreRing value={s.score} size={46} stroke={5} />}
      </span>
      <span className="an2-hrow__id">
        <b>{timeLabel(s.start_time)}</b>
        <span>{partOfDay(s.start_time)}{seq ? ` · Session ${seq}` : ''}</span>
      </span>
      <span className="an2-hrow__m">{s.reps} rep{s.reps === 1 ? '' : 's'}</span>
      <span className="an2-hrow__chev"><Ico size={18} d="M9 6l6 6-6 6" /></span>
    </button>
  )
}

/* ─────────────────────────  Level 1 · one session (overview)  ───────────────────────── */
function SessionView({ userId, sessionId, onBack }: { userId: string; sessionId: string; onBack: () => void }) {
  const [overview, setOverview] = useState<SessionOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [drill, setDrill] = useState<OverviewExercise | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setDrill(null)
    fetchSessionOverview(userId, sessionId)
      .then((o) => { if (!cancelled) setOverview(o) })
      .catch(() => { if (!cancelled) setOverview(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [userId, sessionId])

  if (drill) return <ExerciseDetail userId={userId} sessionId={sessionId} ex={drill} onBack={() => setDrill(null)} />

  return (
    <div className="an2">
      <div className="an2-detailhead">
        <button type="button" className="an2-back" onClick={onBack}><Ico size={15} d="M15 18l-6-6 6-6" /> Back to history</button>
        <h1 className="an2-title" style={{ fontSize: 26 }}>Session</h1>
        {overview && <p className="an2-sub">{prettyDayDate(overview.date, overview.day)} · {timeLabel(overview.start_time)} · {cap(overview.skill_level)}</p>}
      </div>
      {loading || !overview
        ? <div className="an2-msg">{loading ? 'Loading session…' : 'Could not load this session.'}</div>
        : <Overview overview={overview} onOpen={setDrill} />}
    </div>
  )
}

/* "How this session went" — DERIVED on the frontend from the overview (no backend field).
   Up to 4 bullets: overall verdict, best/weakest spread, shallow reps, completion. */
function deriveSessionInsights(o: SessionOverview): string[] {
  const out: string[] = []
  const scored = o.exercises.filter((e) => e.has_data && e.avg_form_score != null)
  const s = o.session_score

  if (s != null) {
    if (s >= 80) out.push(`Strong session — ${s} average form, clean technique across the board.`)
    else if (s >= 65) out.push(`Solid session — ${s} average form. A few reps to tighten up.`)
    else out.push(`Room to grow — ${s} average form. Focus on the fundamentals next time.`)
  }

  if (scored.length >= 2) {
    const sorted = [...scored].sort((a, b) => (b.avg_form_score as number) - (a.avg_form_score as number))
    const best = sorted[0], worst = sorted[sorted.length - 1]
    if ((best.avg_form_score as number) - (worst.avg_form_score as number) >= 5) {
      out.push(`Your best work was ${best.name} (${best.avg_form_score}); ${worst.name} (${worst.avg_form_score}) needs the most attention.`)
    } else {
      out.push('Consistent quality — every exercise finished within a few points of each other.')
    }
  }

  const shallow = o.exercises.reduce((n, e) => n + (e.shallow_reps ?? 0), 0)
  if (shallow > 0) out.push(`${shallow} shallow rep${shallow === 1 ? '' : 's'} this session — aim for full depth on every rep.`)

  const repEx = o.exercises.filter((e) => e.measure === 'reps' && e.planned.total)
  const done = repEx.reduce((n, e) => n + (e.actual?.reps_completed ?? 0), 0)
  const planned = repEx.reduce((n, e) => n + (e.planned.total ?? 0), 0)
  if (planned > 0 && done < planned) out.push(`You completed ${done} of ${planned} planned reps.`)

  return out.slice(0, 4)
}

/* ─────────────────────────  Level 1 · session overview  ───────────────────────── */
function Overview({ overview, onOpen }: { overview: SessionOverview; onOpen: (ex: OverviewExercise) => void }) {
  const exs = overview.exercises
  const insights = deriveSessionInsights(overview)
  return (
    <>
      <div className="an2-shero">
        <ScoreRing value={overview.session_score} size={116} sublabel="Avg Form" />
        <div className="an2-chips">
          <SChip value={String(overview.exercise_count)} label="Exercises" />
          <SChip value={fmtDuration(overview.total_time_s)} label="Total time" />
        </div>
      </div>

      {insights.length > 0 && (
        <>
          <div className="an2-sec">How this session went</div>
          <div className="an2-coach"><ul>{insights.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
        </>
      )}

      <div className="an2-sec">Exercises performed</div>
      <div className="an2-hist">
        {exs.map((ex) => <ExerciseCard key={ex.exercise_id} ex={ex} onOpen={onOpen} />)}
      </div>
    </>
  )
}

function SChip({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div className="an2-chip">
      <b style={{ color }}>{value}</b>
      <s>{label}</s>
    </div>
  )
}

function ExerciseCard({ ex, onOpen }: { ex: OverviewExercise; onOpen: (ex: OverviewExercise) => void }) {
  const tagColor = (ex.training_tag && TAG_COLORS[ex.training_tag]) || '#8C7BFF'
  const isTime = ex.measure === 'time'
  const q = ex.quality ?? { good: 0, borderline: 0, poor: 0 }
  // headline metric: reps done / planned, or the planned hold for timed work
  const metric = isTime ? `${ex.planned.duration_seconds ?? 0}s` : `${ex.actual?.reps_completed ?? 0}`
  const metricSub = isTime
    ? `${ex.planned.sets || 1} set${(ex.planned.sets || 1) > 1 ? 's' : ''}`
    : `of ${ex.planned.total || '—'} reps`

  return (
    <button type="button" className="an2-exrow" onClick={() => onOpen(ex)} disabled={!ex.has_data}>
      <span className="an2-exrow__icon" style={{ background: `${tagColor}1f`, borderColor: `${tagColor}55`, color: tagColor }}>
        {Icon.dumbbell({ size: 22, stroke: tagColor })}
      </span>
      <span className="an2-exrow__id">
        <b>{ex.name}</b>
        <span className="an2-exrow__tags">
          {ex.training_tag && <span className="an2-tag" style={{ color: tagColor, background: `${tagColor}1f`, borderColor: `${tagColor}55` }}>{ex.training_tag}</span>}
          {ex.body_part && <span className="an2-tag">{ex.body_part}</span>}
        </span>
      </span>
      {!isTime && ex.has_data
        ? <span className="an2-qbar"><QualityBar good={q.good} borderline={q.borderline} poor={q.poor} /></span>
        : <span className="an2-exrow__nodata">{isTime ? 'Timed hold' : 'No data'}</span>}
      <span className="an2-exrow__met"><b>{metric}</b><s>{metricSub}</s></span>
      <span className="an2-exrow__score">
        {ex.avg_form_score == null ? <span className="an2-dash">—</span> : <ScoreRing value={ex.avg_form_score} size={46} stroke={5} />}
      </span>
      <span className="an2-exrow__chev" aria-hidden>{ex.has_data ? <Ico size={18} d="M9 6l6 6-6 6" /> : null}</span>
    </button>
  )
}

/* ─────────────────────────  Level 2 · exercise detail  ───────────────────────── */
function ExerciseDetail(
  { userId, sessionId, ex, onBack }:
  { userId: string; sessionId: string; ex: OverviewExercise; onBack: () => void },
) {
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchExerciseReport(userId, sessionId, ex.exercise_id)
      .then((r) => { if (!cancelled) setReport(r) })
      .catch(() => { if (!cancelled) setReport(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [userId, sessionId, ex.exercise_id])

  const issueName = (rule: string) =>
    (report?.measure === 'reps'
      ? report.by_rule.find((x) => x.rule === rule)?.issue_name
      : null) ?? ISSUE_FALLBACK[rule] ?? rule
  const tagColor = (ex.training_tag && TAG_COLORS[ex.training_tag]) || '#8C7BFF'

  return (
    <div className="rp">
      <div className="an2-detailhead">
        <button type="button" className="an2-back" onClick={onBack}><Ico size={15} d="M15 18l-6-6 6-6" /> Back to session</button>
        <h1 className="an2-title" style={{ fontSize: 26 }}>
          {ex.name}
          {ex.training_tag && <span className="an2-tag" style={{ color: tagColor, background: `${tagColor}1f`, borderColor: `${tagColor}55`, marginLeft: 10, fontSize: 11, verticalAlign: 'middle' }}>{ex.training_tag}</span>}
        </h1>
        {report && <p className="an2-sub">{prettyDayDate(report.date, report.day)} · {timeLabel(report.start_time)} · {cap(report.skill_level)}</p>}
      </div>

      {loading ? <div className="an2-msg">Loading report…</div>
        : !report ? <div className="an2-msg">Could not load this exercise.</div>
        : report.measure === 'time'
          ? <TimedDetailBody report={report} />
          : <DetailBody report={report} issueName={issueName} />}
    </div>
  )
}

function TimedDetailBody({ report }: { report: Extract<Report, { measure: 'time' }> }) {
  return (
    <>
      <div className="rpd-hero">
        <ScoreRing value={report.summary.avg_form_score} size={134} sublabel="Form" />
        <div className="rpd-hero__stats">
          <HeroStat label="Timed sets" value={String(report.actual.sets_completed)} sub={`of ${report.planned.sets}`} />
          <HeroStat label="Total time" value={fmtTotalTime(report.summary.total_time_s)} sub="active" />
          <HeroStat label="Counted lifts" value={String(report.summary.counted_lifts)} sub={`${report.summary.full_lifts} full`} />
          <HeroStat label="Shallow lifts" value={String(report.summary.shallow_lifts)} sub="lifts" color={report.summary.shallow_lifts ? Q.amber : undefined} />
          <HeroStat label="Invalid cycles" value={String(report.summary.invalid_lifts)} sub="not counted" />
        </div>
      </div>
      <div className="rpd-section">Timed set summary</div>
      <div className="rp-insights">
        <ul className="rp-insights__list">
          {report.insights.map((text, index) => <li key={index}>{text}</li>)}
        </ul>
      </div>
    </>
  )
}

function DetailBody({ report, issueName }: { report: Extract<Report, { measure: 'reps' }>; issueName: (r: string) => string }) {
  // Set selector: null = All sets. Selecting a set re-scopes the charts below (NOT the hero
  // ring/stats or the overall insights — those stay session/exercise level).
  const [selectedSet, setSelectedSet] = useState<number | null>(null)
  // Heatmap rep drill-down: null = the scoped average; a rep number = that rep's template×phase.
  const [heatRep, setHeatRep] = useState<number | null>(null)
  useEffect(() => { setHeatRep(null) }, [selectedSet]) // reset when the set scope changes
  const setData = report.per_set.map((s) => ({ set: s.set, score: s.avg_score, reps: s.reps, time_s: s.time_s }))
  const hasSets = setData.length > 1
  const toggleSet = (s: number) => setSelectedSet((cur) => (cur === s ? null : s))
  const suffix = selectedSet == null ? '' : ` · Set ${selectedSet}`

  // ── scoped slice (drives every chart below the selector) ──
  const reps = selectedSet == null ? report.per_rep : report.per_rep.filter((r) => r.set === selectedSet)
  const total = reps.length
  const lineData = reps.map((r) => ({ rep: r.rep, score: r.score, set: r.set, time_s: r.time_s }))
  const romData = reps.filter((r) => r.rom != null).map((r) => ({ rep: r.rep, set: r.set, rom: r.rom as number }))
  const good = reps.filter((r) => r.score >= 80).length
  const mid = reps.filter((r) => r.score >= 65 && r.score < 80).length
  const poor = reps.filter((r) => r.score < 65).length
  const quality = [
    { label: 'Clean (≥80)', value: good, color: Q.green },
    { label: 'Borderline (65–79)', value: mid, color: Q.amber },
    { label: 'Needs work (<65)', value: poor, color: Q.red },
  ].filter((d) => d.value > 0)

  // per-set fault breakdown comes from the backend's `sets[]`; All sets → the top-level fields
  const setEntry = selectedSet == null ? null : (report.sets?.find((s) => s.set === selectedSet) ?? null)
  const byRule = setEntry ? setEntry.by_rule : report.by_rule
  const rulePhase = setEntry ? setEntry.rule_phase : report.rule_phase
  const coaching = setEntry ? setEntry.coaching : report.coaching  // ≤2 recurring-issue bullets, scoped
  // single-hue cyan bars — this is a magnitude ranking (share of points lost), not categories
  const faults = byRule.map((r) => ({
    issue_name: r.issue_name, penalty_share: r.penalty_share, flagged_reps: r.flagged_reps,
    avg_score: r.avg_score, color: '#22D3EE',
  }))
  // heatmap source: the scoped AVERAGE (Avg), or a single rep's template × phase scores.
  const heatRepEntry = heatRep == null ? null : reps.find((r) => r.rep === heatRep)
  const heatSource = heatRepEntry ? heatRepEntry.rule_phase : rulePhase
  const heatRows = Object.keys(heatSource)
  // Best rep = the max form SCORE (tie-proof). Point at the rep(s) that reached it: one → "rep N",
  // several → "×N reps" (a count, so many ties never overflow).
  const bestScore = report.summary.best
  const bestReps = bestScore == null ? [] : report.per_rep.filter((r) => r.score === bestScore)
  const bestRepSub = bestScore == null ? undefined : bestReps.length === 1 ? `rep ${bestReps[0].rep}` : `×${bestReps.length} reps`

  // weakest rule × phase pointer comes from the scoped average (the Avg-view heatmap hint)
  let weakest: { rule: string; phase: string; score: number } | null = null
  for (const rule of Object.keys(rulePhase)) {
    for (const ph of PHASES) {
      const v = rulePhase[rule]?.[ph]
      if (v != null && (weakest == null || v < weakest.score)) weakest = { rule, phase: ph, score: v }
    }
  }

  return (
    <>
      {/* hero — whole exercise, untouched by the set selector */}
      <div className="rpd-hero">
        <ScoreRing value={report.summary.avg_form_score} size={134} sublabel="Form" />
        <div className="rpd-hero__stats">
          <HeroStat label="Reps done" value={String(report.actual.reps_completed)} sub={`of ${report.planned.total || '—'}`} />
          <HeroStat label="Total time" value={fmtTotalTime(report.summary.total_time_s)} sub={report.summary.total_time_s != null && report.summary.total_time_s >= 60 ? 'min' : 'sec'} />
          <HeroStat label="Sets" value={String(report.actual.sets_completed)} sub={`of ${report.planned.sets || '—'}`} />
          <HeroStat label="Best rep score" value={bestScore == null ? '—' : String(bestScore)} sub={bestRepSub}
            color={bestScore == null ? undefined : scoreColor(bestScore)} />
          <HeroStat label="Shallow reps" value={String(report.summary.shallow_reps)} sub={report.summary.shallow_reps === 1 ? 'rep' : 'reps'}
            color={report.summary.shallow_reps > 0 ? Q.amber : undefined} />
          <HeroStat label="Avg rep time" value={report.summary.avg_rep_time_s == null ? '—' : `${report.summary.avg_rep_time_s}`} sub="sec" />
        </div>
      </div>

      {/* high-level exercise summary — section header (out of the box), box keeps the gradient */}
      <div className="rpd-section">What to work on next session</div>
      <div className="rp-insights">
        <ul className="rp-insights__list">
          {report.insights.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      </div>

      {/* the four set/rep charts — section header, each chart its own box */}
      <div className="rpd-section">Rep-by-rep breakdown{suffix}</div>

      {/* SET SELECTOR — average per set drives the set scope for the charts below it */}
      <DCard
        title="Average per set"
        hint={hasSets ? 'Tap a set to focus the charts below on it; tap it again or “All sets” to reset.' : undefined}
        action={hasSets && selectedSet != null
          ? <button type="button" className="rpd-scope" onClick={() => setSelectedSet(null)}>↺ All sets</button>
          : (hasSets ? <span className="rpd-scope rpd-scope--muted">All sets</span> : undefined)}
      >
        <SetBars data={setData} selected={selectedSet} onSelect={hasSets ? toggleSet : undefined} />
      </DCard>

      {/* form-per-rep + rep quality — scoped to the selected set */}
      <div className="rpd-2col">
        <DCard title={`Form score per rep${suffix}`} hint="Aim to keep every dot in the green zone (80+). A dip mid-set often means fatigue.">
          {total ? <FormLine data={lineData} /> : <Empty text="No reps in this set." />}
        </DCard>
        <DCard title={`Rep quality${suffix}`} hint="How your reps split between clean, borderline and needs-work.">
          <Donut data={quality} centerNum={total} centerLabel="reps" />
        </DCard>
      </div>

      {/* depth (ROM) reached per rep — scoped to the selected set */}
      <DCard
        title={`Depth reached per rep${suffix}`}
        hint="Each rep's peak depth — 100% = hips level with knees. Bars below the dashed target line are shallow reps."
        tip={
          <>
            How deep each rep went, as a percent of <b>hips level with knees (100%)</b> — the peak depth that rep reached.
            <ul>
              <li><b>Green</b> bars reached the depth target (counted as a full rep).</li>
              <li><b>Amber</b> bars fell short of the dashed <b>target line</b> — those are your shallow reps.</li>
              <li>Bars can exceed 100% on below-parallel (deep) reps.</li>
            </ul>
            This is the depth signal behind the shallow-depth fault — it has no phase breakdown, so it lives here rather than in the phase heatmap.
          </>
        }
      >
        {romData.length ? <RomBars data={romData} target={report.depth_target} /> : <Empty text="No depth data for these reps." />}
      </DCard>

      {/* fault analysis — scoped to the selected set */}
      <div className="rpd-section">Where to focus{suffix}</div>

      <div className="rpd-2col">
        {/* fault ranking: each fault's share of the points lost */}
        <DCard
          title="Fault Breakdown"
          hint="Each fault's share of the points lost — with how many reps it hit and its average score."
          tip={
            <>
              Your form score starts at 100; this card splits the <b>points you lost</b> by which fault caused them.
              <ul>
                <li><b>% / bar</b> — that fault's share of all points lost (bars sum to 100%). Multiply your point gap by it — e.g. a 45-point gap (score 55) × 38% ≈ <b>17 points</b> from that fault.</li>
                <li><b>N reps</b> — how many reps it was flagged in (how widespread).</li>
                <li><b>avg</b> — that fault's own average score 0–100 (how clean it was, and how much room is left there).</li>
              </ul>
              Ranked by points lost, <b>not</b> frequency: a high-severity fault in fewer reps can outrank a minor one in more. Fix the top bar first — it's your biggest, fastest recovery.
            </>
          }
        >
          <FaultRanked data={faults} />
        </DCard>

        {/* recurring issues + how to fix them (the ≤2 coaching bullets) */}
        <DCard title="Coaching Advice" hint={`Issues flagged in two or more reps${selectedSet ? ' in this set' : ''} — and how to fix them.`}>
          {coaching.length ? (
            <div className="rpd-ctable">
              <div className="rpd-ctable__h">Issue</div>
              <div className="rpd-ctable__h">Reps</div>
              <div className="rpd-ctable__h">Advice</div>
              {coaching.map((c, i) => (
                <Fragment key={i}>
                  <div className="rpd-ctable__issue">{c.issue_name}</div>
                  <div className="rpd-ctable__reps">{c.reps.join(', ')}</div>
                  <div className="rpd-ctable__advice">{c.fix}</div>
                </Fragment>
              ))}
            </div>
          ) : (
            <p className="rpd-advice__text">No issue was flagged in two or more reps{selectedSet ? ' in this set' : ''} — nothing to single out. 💪</p>
          )}
        </DCard>
      </div>

      {/* rule × movement-phase scores (with the per-rep drill-down) */}
      <DCard
        title="Faults by Phase"
        hint={heatRep != null
          ? `Rep ${heatRep} — each cell is that rep's form score for that part of the movement.`
          : weakest
            ? `Weakest: ${issueName(weakest.rule)} during the ${weakest.phase} — focus there next time.`
            : 'Each cell scores a part of the movement (higher is better).'}
        tip={
          <>
            A grid of form scores: each <b>row is a fault</b>, each <b>column is a phase</b> of the rep (Setup → Descent → Bottom → Ascent).
            <ul>
              <li><b>0–100</b> — how clean that fault was during that phase. <b>100</b> = it never showed up there; lower = it was flagged for more of that phase (and more severely). <b>Higher is better.</b></li>
              <li><b>Colour</b> — green is clean, shading to red as the score drops, so problem spots stand out at a glance.</li>
              <li><b>“—”</b> — that fault isn't checked in that phase, so there's nothing to score (e.g. stance width is judged only at Setup; depth has no phase row at all).</li>
            </ul>
            Showing the scoped <b>average</b> by default — use the rep selector above to drill into a single rep's grid.
          </>
        }
        footerRight={<DepthChip reps={reps} heatRep={heatRep} />}
      >
        <HeatRepSelector reps={reps} value={heatRep} onChange={setHeatRep} />
        {heatRows.length
          ? <Heatmap rows={heatRows} cols={PHASES} rowLabel={issueName}
              value={(row, col) => heatSource[row]?.[col] ?? null} />
          : <Empty text={heatRep != null ? 'No tracked faults on this rep — clean. 💪' : 'No phase faults — clean movement. 💪'} />}
      </DCard>
    </>
  )
}

function HeroStat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rpd-stat">
      <span className="rpd-stat__label">{label}</span>
      <span className="rpd-stat__row">
        <span className="rpd-stat__value" style={{ color }}>{value}</span>
        {sub && <span className="rpd-stat__sub">{sub}</span>}
      </span>
    </div>
  )
}

/* Squat depth status chip beside the phase heatmap. Depth is a per-rep PEAK property (a rep is
   shallow ⟺ it never reached the bottom phase), so it has no phase breakdown — it's shown as a
   chip rather than a heatmap row. Reflects the current scope: a single rep when drilled in, else
   the scoped reps' shallow tally. */
function DepthChip({ reps, heatRep }: { reps: { rep: number; shallow: boolean }[]; heatRep: number | null }) {
  if (heatRep != null) {
    const entry = reps.find((r) => r.rep === heatRep)
    if (!entry) return null
    return entry.shallow
      ? <div className="rpd-depth rpd-depth--warn"><span className="rpd-depth__dot" />Shallow — hips didn’t reach knee level</div>
      : <div className="rpd-depth rpd-depth--ok"><span className="rpd-depth__dot" />Reached depth ✓</div>
  }
  const shallow = reps.filter((r) => r.shallow)
  if (shallow.length === 0) {
    return <div className="rpd-depth rpd-depth--ok"><span className="rpd-depth__dot" />All reps reached depth ✓</div>
  }
  const n = shallow.length
  return (
    <div className="rpd-depth rpd-depth--warn">
      <span className="rpd-depth__dot" />{n} shallow rep{n === 1 ? '' : 's'} (rep {shallow.map((r) => r.rep).join(', ')})
    </div>
  )
}

/* Heatmap drill-down: "Avg" + a chip per rep in scope. Hidden when there's only one rep. */
function HeatRepSelector(
  { reps, value, onChange }:
  { reps: { rep: number }[]; value: number | null; onChange: (v: number | null) => void },
) {
  if (reps.length <= 1) return null
  return (
    <div className="rpd-reps">
      <button type="button" className={`rpd-repchip${value == null ? ' is-active' : ''}`} onClick={() => onChange(null)}>Avg</button>
      {reps.map((r) => (
        <button key={r.rep} type="button" className={`rpd-repchip${value === r.rep ? ' is-active' : ''}`} onClick={() => onChange(r.rep)}>{r.rep}</button>
      ))}
    </div>
  )
}

/* Hover/focus info bubble: an "i" affordance next to a card title that reveals a richer
   explanation than the one-line hint. Keyboard-accessible (focus reveals the popover). */
function InfoTip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rpd-info" tabIndex={0} role="button" aria-label="What does this chart mean?">
      <span className="rpd-info__icon" aria-hidden="true">i</span>
      <span className="rpd-info__pop" role="tooltip">{children}</span>
    </span>
  )
}

function DCard({ title, hint, tip, action, footerRight, flat, children }: { title: string; hint?: string; tip?: React.ReactNode; action?: React.ReactNode; footerRight?: React.ReactNode; flat?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rpd-card${flat ? ' rpd-card--flat' : ''}`}>
      <div className="rpd-card__head">
        <span className="rpd-card__titlewrap">
          <span className="rpd-card__title">{title}</span>
          {tip != null && <InfoTip>{tip}</InfoTip>}
        </span>
        {action}
      </div>
      {hint && <div className="rpd-card__hint">{hint}</div>}
      <div className="rpd-card__body">{children}</div>
      {footerRight && <div className="rpd-card__foot">{footerRight}</div>}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <div style={{ fontFamily: 'var(--ui)', fontSize: 13, color: 'var(--ink-faint)', padding: '18px 4px' }}>{text}</div>
}
