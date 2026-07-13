// 1日の時間帯タイムライン。各スタッフの勤務帯を横棒で重ね、
// 時間帯ごとの在店人数と無人帯（赤）を可視化する。

import type { Schedule, SchedulePattern } from "@/lib/types";
import { WEEKDAY_JP } from "@/lib/schedule";
import { PALETTE_SOLID } from "./ShiftGrid";

function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function fmt(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

/** パターンの時間帯。start/end フィールドが無い旧データはラベルから抽出 */
function spanOf(p: SchedulePattern): [number, number] | null {
  if (p.start && p.end) return [toMin(p.start), toMin(p.end)];
  const m = p.label.match(/(\d{1,2}:\d{2})\s*[-〜~]\s*(\d{1,2}:\d{2})/);
  if (m) return [toMin(m[1]), toMin(m[2])];
  return null;
}

export function DayTimeline({
  schedule,
  date,
  storeOpen,
  storeClose,
}: {
  schedule: Schedule;
  date: string;
  storeOpen?: string;
  storeClose?: string;
}) {
  const day = schedule.days.find((d) => d.date === date);
  if (!day) return null;

  const patIdx = new Map(schedule.patterns.map((p, i) => [p.id, i]));
  const spans = new Map(
    schedule.patterns
      .map((p) => [p.id, spanOf(p)] as const)
      .filter(([, s]) => s !== null),
  ) as Map<string, [number, number]>;

  // その日の勤務者
  const working = schedule.staff
    .map((s) => {
      const pid = s.assignments[date];
      if (!pid) return null;
      const span = spans.get(pid);
      if (!span) return null;
      const pat = schedule.patterns.find((p) => p.id === pid)!;
      return { staff: s, pat, span };
    })
    .filter(Boolean) as {
    staff: Schedule["staff"][number];
    pat: SchedulePattern;
    span: [number, number];
  }[];

  // 表示レンジ: 営業時間と勤務帯を包含
  const allStarts = working.map((w) => w.span[0]);
  const allEnds = working.map((w) => w.span[1]);
  const open = storeOpen ? toMin(storeOpen) : Math.min(540, ...allStarts);
  const close = storeClose ? toMin(storeClose) : Math.max(1260, ...allEnds);
  const lo = Math.min(open, ...(allStarts.length ? allStarts : [open]));
  const hi = Math.max(close, ...(allEnds.length ? allEnds : [close]));
  const range = Math.max(1, hi - lo);
  const pct = (t: number) => ((t - lo) / range) * 100;

  // 在店人数の区間（境界: 営業開始/終了＋各勤務帯の開始/終了）
  const pts = Array.from(
    new Set([open, close, ...working.flatMap((w) => w.span)]),
  )
    .filter((t) => t >= open && t <= close)
    .sort((a, b) => a - b);
  const intervals: { a: number; b: number; n: number }[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    if (b <= a) continue;
    const n = working.filter((w) => w.span[0] <= a && w.span[1] >= b).length;
    intervals.push({ a, b, n });
  }

  // 時刻目盛り（2時間おき）
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / 120) * 120; t <= hi; t += 120) ticks.push(t);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-700">
        {Number(date.slice(5, 7))}/{Number(date.slice(8, 10))}（
        {WEEKDAY_JP[day.weekday]}）の時間帯
        <span className="ml-2 text-xs font-normal text-slate-400">
          営業 {fmt(open)}〜{fmt(close)}
        </span>
      </h3>

      {working.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">この日の出勤者はいません</p>
      ) : (
        <div className="mt-3 space-y-1.5">
          {/* 目盛り */}
          <div className="relative ml-24 h-4 text-[10px] text-slate-400">
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute -translate-x-1/2"
                style={{ left: `${pct(t)}%` }}
              >
                {fmt(t)}
              </span>
            ))}
          </div>

          {/* スタッフ別バー */}
          {working.map(({ staff, pat, span }) => (
            <div key={staff.id} className="flex items-center gap-2">
              <div className="w-22 min-w-22 shrink-0 truncate text-right text-xs text-slate-600" style={{ width: "5.5rem" }}>
                {staff.name}
              </div>
              <div className="relative h-6 flex-1 rounded bg-slate-100">
                {/* 営業時間外の網掛け */}
                {lo < open && (
                  <div
                    className="absolute inset-y-0 left-0 rounded-l bg-slate-200/70"
                    style={{ width: `${pct(open)}%` }}
                  />
                )}
                {hi > close && (
                  <div
                    className="absolute inset-y-0 right-0 rounded-r bg-slate-200/70"
                    style={{ width: `${100 - pct(close)}%` }}
                  />
                )}
                <div
                  className={`absolute inset-y-0.5 flex items-center justify-center overflow-hidden rounded px-1 text-[10px] font-semibold text-white ${
                    PALETTE_SOLID[
                      (patIdx.get(pat.id) ?? 0) % PALETTE_SOLID.length
                    ]
                  }`}
                  style={{
                    left: `${pct(span[0])}%`,
                    width: `${pct(span[1]) - pct(span[0])}%`,
                  }}
                  title={`${pat.label}（${fmt(span[0])}〜${fmt(span[1])}）`}
                >
                  {pat.label.split(" ")[0]} {fmt(span[0])}-{fmt(span[1])}
                </div>
              </div>
            </div>
          ))}

          {/* 在店人数 */}
          <div className="flex items-center gap-2 pt-1">
            <div className="shrink-0 text-right text-xs font-semibold text-slate-600" style={{ width: "5.5rem" }}>
              在店人数
            </div>
            <div className="relative h-6 flex-1 overflow-hidden rounded">
              {intervals.map(({ a, b, n }, i) => (
                <div
                  key={i}
                  className={`absolute inset-y-0 flex items-center justify-center text-[10px] font-bold ${
                    n === 0
                      ? "bg-rose-500 text-white"
                      : n === 1
                        ? "bg-emerald-200 text-emerald-900"
                        : "bg-emerald-400 text-white"
                  }`}
                  style={{
                    left: `${pct(a)}%`,
                    width: `${pct(b) - pct(a)}%`,
                  }}
                  title={`${fmt(a)}〜${fmt(b)}: ${n}名`}
                >
                  {n === 0 ? "無人!" : `${n}名`}
                </div>
              ))}
            </div>
          </div>

          {intervals.some((iv) => iv.n === 0) && (
            <p className="pt-1 text-xs font-medium text-rose-600">
              ⚠ 営業時間内に無人の時間帯があります。「営業中の最低在店人数」を1以上にして再生成するか、手動調整で埋めてください
            </p>
          )}
        </div>
      )}
    </div>
  );
}
