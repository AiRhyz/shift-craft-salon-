"use client";

// シフト作成ページ（管理者向け）。
// 設定を編集 → 生成 → 結果（シフト表）を表示。設定は localStorage に自動保存。

import { ConfigEditor } from "@/components/ConfigEditor";
import { Nav } from "@/components/Nav";
import { ShiftGrid } from "@/components/ShiftGrid";
import type { PlanConfig } from "@/lib/planConfig";
import { defaultConfig, loadConfig, saveConfig } from "@/lib/planConfig";
import type { Schedule } from "@/lib/types";
import { useEffect, useRef, useState } from "react";

export default function PlanPage() {
  const [config, setConfig] = useState<PlanConfig>(defaultConfig);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useRef(false);

  // 初回に localStorage から復元
  useEffect(() => {
    const saved = loadConfig();
    if (saved) setConfig(saved);
    hydrated.current = true;
  }, []);

  // 変更を自動保存（復元前は保存しない）
  useEffect(() => {
    if (hydrated.current) saveConfig(config);
  }, [config]);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/solve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`入力エラー(${res.status}): ${detail.slice(0, 300)}`);
      }
      setSchedule((await res.json()) as Schedule);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setConfig(defaultConfig());
    setSchedule(null);
    setError(null);
  };

  const isSample = schedule?.meta.source.startsWith("bundled sample");
  const infeasible =
    schedule && !["OPTIMAL", "FEASIBLE"].includes(schedule.meta.status);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Nav current="plan" />

      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">シフト作成</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            条件を設定して「シフト生成」を押すと、CP-SAT
            ソルバーが制約を満たす最適シフトを作成します
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={reset}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            初期値に戻す
          </button>
          <button
            onClick={generate}
            disabled={loading}
            className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark disabled:opacity-50"
          >
            {loading ? "生成中..." : "シフト生成"}
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* 生成結果 */}
      {schedule && (
        <section className="mb-6 space-y-3">
          {isSample && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
              solver 未接続のため、設定は反映されず同梱サンプル解を表示しています（
              {schedule.meta.source}）。Vercel の環境変数{" "}
              <code className="rounded bg-amber-100 px-1">SOLVER_API_URL</code>{" "}
              を設定すると実際に最適化されます。
            </div>
          )}
          {infeasible ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              解が見つかりませんでした（{schedule.meta.status}
              ）。必要人数・希望休・公休日数・NGペア等の条件が矛盾していないか確認してください。
              例：必要人数に対してスタッフ数や出勤可能日が不足している等。
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <span>✓ {schedule.meta.status}</span>
                <span>求解 {schedule.meta.solve_time_s}s</span>
                <span>NGペア同時出勤 {schedule.meta.ng_soft_violations}回</span>
                <span>推奨ペア同時出勤 {schedule.meta.recommend_together}回</span>
                <span>希望充足 {schedule.meta.want_met}件</span>
              </div>
              <ShiftGrid schedule={schedule} />
            </>
          )}
        </section>
      )}

      {/* 設定エディタ */}
      <ConfigEditor config={config} onChange={setConfig} />
    </main>
  );
}
