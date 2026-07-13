"use client";

// 「シフト表」タブ = 確定シフトの閲覧ページ。
// 「シフト作成」で確定されたシフト（localStorage）を表示し、
// 未確定の間はデモ解（solver or 同梱サンプル）を表示する。

import { Nav } from "@/components/Nav";
import { ShiftGrid } from "@/components/ShiftGrid";
import type { ConfirmedSchedule } from "@/lib/confirmed";
import { clearConfirmed, loadConfirmed } from "@/lib/confirmed";
import type { Schedule } from "@/lib/types";
import { APP_VERSION } from "@/lib/version";
import { useEffect, useState } from "react";

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

export default function Home() {
  const [confirmed, setConfirmed] = useState<ConfirmedSchedule | null>(null);
  const [demo, setDemo] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = loadConfirmed();
    if (saved) {
      setConfirmed(saved);
      setLoading(false);
      return;
    }
    // 未確定ならデモ解を取得（solver 接続時は実解、未接続はサンプル）
    fetch("/api/solve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then((r) => r.json())
      .then((d) => setDemo(d as Schedule))
      .catch(() => setDemo(null))
      .finally(() => setLoading(false));
  }, []);

  const unconfirm = () => {
    clearConfirmed();
    setConfirmed(null);
    setLoading(true);
    fetch("/api/solve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
      .then((r) => r.json())
      .then((d) => setDemo(d as Schedule))
      .catch(() => setDemo(null))
      .finally(() => setLoading(false));
  };

  const schedule = confirmed?.schedule ?? demo;
  const confirmedAt = confirmed
    ? new Date(confirmed.confirmed_at).toLocaleString("ja-JP", {
        year: "numeric", month: "numeric", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Nav current="home" />
      <header className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900">確定シフト</h1>
          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
            v{APP_VERSION}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          美容室向けシフト自動作成ツール — 確定済みシフトの閲覧ページ。
          条件の編集と生成は「シフト作成」タブから。
        </p>
      </header>

      {loading ? (
        <p className="py-16 text-center text-sm text-slate-400">読み込み中...</p>
      ) : !schedule ? (
        <p className="py-16 text-center text-sm text-slate-400">
          シフトを取得できませんでした。「シフト作成」タブから生成してください。
        </p>
      ) : (
        <>
          {confirmed ? (
            <div className="no-print mb-5 flex flex-wrap items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <span>✓ {confirmedAt} に確定されたシフトです</span>
              <span className="ml-auto flex gap-2">
                <button
                  onClick={() => window.print()}
                  className="rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs text-emerald-700 hover:bg-emerald-100"
                >
                  🖨 印刷 / PDF保存
                </button>
                <button
                  onClick={unconfirm}
                  className="rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs text-emerald-700 hover:bg-emerald-100"
                >
                  確定を取り消す
                </button>
              </span>
            </div>
          ) : (
            <div className="mb-5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              確定済みのシフトはまだありません（以下はデモ表示です）。
              「シフト作成」タブで生成し、「この内容で確定」を押すとここに反映されます。
            </div>
          )}

          <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              label="対象規模"
              value={`${schedule.staff.length}名 × ${schedule.days.length}日`}
            />
            <StatCard
              label="ステータス"
              value={
                schedule.meta.status === "BEST_EFFORT"
                  ? "不足許容"
                  : schedule.meta.status
              }
              hint={
                (schedule.meta.shortage_total ?? 0) > 0
                  ? `不足 ${schedule.meta.shortage_total} 人日`
                  : undefined
              }
            />
            <StatCard
              label="NGペア同時出勤"
              value={`${schedule.meta.ng_soft_violations} 回`}
            />
            <StatCard
              label="推奨ペア同時出勤"
              value={`${schedule.meta.recommend_together} 回`}
            />
            <StatCard
              label="概算人件費"
              value={
                schedule.meta.estimated_cost_yen != null
                  ? `¥${schedule.meta.estimated_cost_yen.toLocaleString()}`
                  : "—"
              }
            />
          </section>

          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              シフト表（スタッフ × 日）
            </h2>
            <ShiftGrid schedule={schedule} />
          </section>

          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              個人別集計
            </h2>
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
                  {schedule.staff.map((s) => (
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
        </>
      )}

      <footer className="border-t border-slate-200 pt-4 text-xs text-slate-400">
        制約仕様書 v0.1 準拠 ・ ハード制約 H0–H7 / ソフト制約 S1–S7 ・
        解不能時は原因診断＋不足許容シフトを自動生成
      </footer>
    </main>
  );
}
