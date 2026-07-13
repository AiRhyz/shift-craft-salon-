import { Nav } from "@/components/Nav";
import { ShiftGrid } from "@/components/ShiftGrid";
import { getSchedule } from "@/lib/schedule";

export const dynamic = "force-dynamic";

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-xl font-bold text-slate-800">{value}</div>
      {hint && <div className="text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

export default async function Home() {
  const schedule = await getSchedule();
  const { meta, staff, days } = schedule;
  const solverConnected = Boolean(process.env.SOLVER_API_URL);
  const weekendVals = staff.map((s) => s.weekend_shifts);
  const weekendRange =
    weekendVals.length > 0
      ? Math.max(...weekendVals) - Math.min(...weekendVals)
      : 0;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Nav current="home" />
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900">
            確定シフト
          </h1>
          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
            v1 MVP
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          美容室向けシフト自動作成ツール — 制約ベース最適化（CP-SAT）による勤務割当。
          条件の編集と生成は「シフト作成」タブから。
        </p>
      </header>

      {/* ソルバー接続状態 */}
      <div
        className={`mb-5 rounded-md border px-3 py-2 text-sm ${
          solverConnected
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-amber-200 bg-amber-50 text-amber-700"
        }`}
      >
        {solverConnected ? (
          <>solver API 接続中（SOLVER_API_URL）</>
        ) : (
          <>
            solver 未接続：同梱の PoC 実解（{meta.source}）を表示中。
            <code className="mx-1 rounded bg-amber-100 px-1">SOLVER_API_URL</code>
            を設定すると OR-Tools ソルバーに接続します。
          </>
        )}
      </div>

      {/* サマリ */}
      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="求解ステータス"
          value={meta.status}
          hint={`${meta.solve_time_s}s`}
        />
        <StatCard
          label="対象規模"
          value={`${staff.length}名 × ${days.length}日`}
        />
        <StatCard
          label="土日出勤の偏り"
          value={`range ${weekendRange}`}
          hint="小さいほど公平"
        />
        <StatCard
          label="NGペア同時出勤"
          value={`${meta.ng_soft_violations} 回`}
          hint="少ないほど良い"
        />
        <StatCard
          label="推奨ペア同時出勤"
          value={`${meta.recommend_together} 回`}
          hint="OJT等・多いほど良い"
        />
        <StatCard label="希望勤務の充足" value={`${meta.want_met} 件`} />
      </section>

      {/* シフト表 */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          シフト表（スタッフ × 日）
        </h2>
        <ShiftGrid schedule={schedule} />
      </section>

      {/* 個人別集計 */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">個人別集計</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">スタッフ</th>
                <th className="px-3 py-2 text-right font-medium">労働時間</th>
                <th className="px-3 py-2 text-right font-medium">土日出勤</th>
                <th className="px-3 py-2 text-left font-medium">スキル</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-800">
                    {s.name}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                    {s.total_hours.toFixed(1)}h
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                    {s.weekend_shifts} 回
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-400">
                    {s.skills.join(" / ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="border-t border-slate-200 pt-4 text-xs text-slate-400">
        制約仕様書 v0.1 準拠 ・ ハード制約 H0–H6 / ソフト制約 S1・S4・S5・S6 を
        solver PoC で実装
      </footer>
    </main>
  );
}
