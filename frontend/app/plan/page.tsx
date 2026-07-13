"use client";

// シフト作成ページ（管理者向け）。
// 設定を編集 → 生成 → 結果（シフト表）を表示。設定は localStorage に自動保存。

import { ConfigEditor } from "@/components/ConfigEditor";
import { Nav } from "@/components/Nav";
import { ShiftGrid } from "@/components/ShiftGrid";
import { saveConfirmed } from "@/lib/confirmed";
import { buildCsv } from "@/lib/exportCsv";
import type { PlanConfig } from "@/lib/planConfig";
import {
  buildSolveRequest,
  defaultConfig,
  loadConfig,
  saveConfig,
} from "@/lib/planConfig";
import type { Schedule } from "@/lib/types";
import { recomputeAndValidate } from "@/lib/validate";
import { useEffect, useRef, useState } from "react";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PlanPage() {
  const [config, setConfig] = useState<PlanConfig>(defaultConfig);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [violations, setViolations] = useState<string[]>([]);
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
        body: JSON.stringify(buildSolveRequest(config)),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`入力エラー(${res.status}): ${detail.slice(0, 300)}`);
      }
      setSchedule((await res.json()) as Schedule);
      setViolations([]);
      setEditMode(false);
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
    setNotice(null);
  };

  // 手動調整: セルの勤務パターンを変更 → 集計・不足・違反を即時再計算
  const handleCellChange = (
    staffId: string,
    date: string,
    patternId: string | null,
  ) => {
    if (!schedule) return;
    const edited: Schedule = {
      ...schedule,
      staff: schedule.staff.map((s) =>
        s.id === staffId
          ? { ...s, assignments: { ...s.assignments, [date]: patternId } }
          : s,
      ),
    };
    const { schedule: recomputed, violations: v } = recomputeAndValidate(
      edited,
      config,
    );
    setSchedule(recomputed);
    setViolations(v);
  };

  // 生成結果を確定し「シフト表」タブに反映する
  const confirm = () => {
    if (!schedule) return;
    saveConfirmed(schedule);
    setNotice(
      "✓ 確定しました。「シフト表」タブにこのシフトが表示されます（この端末のブラウザ内保存。共有・通知機能は v2 で対応予定）",
    );
  };

  // Excel 出力。solver 未接続時は CSV にフォールバック
  const exportFile = async () => {
    if (!schedule) return;
    setNotice(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedule),
      });
      if (res.ok) {
        downloadBlob(await res.blob(), "shift.xlsx");
        return;
      }
    } catch {
      // フォールバックへ
    }
    const csv = buildCsv(schedule);
    downloadBlob(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
      "shift.csv",
    );
    setNotice(
      "solver 未接続のため CSV 形式で出力しました（Excel 出力は solver 接続後に利用できます）",
    );
  };

  const isSample = schedule?.meta.source.startsWith("bundled sample");
  const isBestEffort = schedule?.meta.status === "BEST_EFFORT";
  const infeasible =
    schedule &&
    !["OPTIMAL", "FEASIBLE", "BEST_EFFORT"].includes(schedule.meta.status);

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
      {notice && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {notice}
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
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
              <p className="font-semibold">
                解が見つかりませんでした（{schedule.meta.status}）
              </p>
              {schedule.meta.diagnosis?.length ? (
                <>
                  <p className="mt-1.5">
                    原因診断（これらの制約を緩めると解ける可能性があります）:
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {schedule.meta.diagnosis.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-1">
                  必要人数・希望休・公休日数・NGペア等の条件が矛盾していないか確認してください。
                </p>
              )}
            </div>
          ) : (
            <>
              {isBestEffort && (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                  <p className="font-semibold">
                    ⚠ 全条件は満たせなかったため、公休・希望休・連勤上限などスタッフの条件を優先し、
                    人員不足（合計 {schedule.meta.shortage_total ?? 0} 人日）を許容したシフトです
                  </p>
                  <p className="mt-1">
                    不足日はシフト表下部の「不足人数」行に赤字で表示しています。
                    ヘルプ要員の手配や必要人数の見直しをご検討ください。
                  </p>
                  {schedule.meta.diagnosis?.length ? (
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs">
                      {schedule.meta.diagnosis.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <span>
                  {isBestEffort ? "△ 不足許容で生成" : `✓ ${schedule.meta.status}`}
                </span>
                <span>求解 {schedule.meta.solve_time_s}s</span>
                <span>NGペア同時出勤 {schedule.meta.ng_soft_violations}回</span>
                <span>推奨ペア同時出勤 {schedule.meta.recommend_together}回</span>
                <span>希望充足 {schedule.meta.want_met}件</span>
                {schedule.meta.estimated_cost_yen != null && (
                  <span>
                    概算人件費 ¥
                    {schedule.meta.estimated_cost_yen.toLocaleString()}
                  </span>
                )}
                <span className="ml-auto flex gap-2">
                  {!isSample && (
                    <button
                      onClick={() => setEditMode(!editMode)}
                      className={`rounded-md border px-3 py-1 text-xs font-medium ${
                        editMode
                          ? "border-brand bg-brand text-white"
                          : "border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100"
                      }`}
                    >
                      {editMode ? "✎ 編集中(クリックで終了)" : "✎ 手動調整"}
                    </button>
                  )}
                  <button
                    onClick={exportFile}
                    className="rounded-md border border-emerald-300 bg-white px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    ⬇ Excel出力
                  </button>
                  {!isSample && (
                    <button
                      onClick={confirm}
                      className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-brand-dark"
                    >
                      この内容で確定
                    </button>
                  )}
                </span>
              </div>
              {editMode && (
                <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-700">
                  手動調整モード: セルをクリックして勤務パターンを変更できます。
                  変更すると集計・不足人数・制約違反を即時に再計算します。
                </div>
              )}
              {violations.length > 0 && (
                <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  <p className="font-semibold">⚠ 制約違反があります:</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                    {violations.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                </div>
              )}
              <ShiftGrid
                schedule={schedule}
                editable={editMode}
                onCellChange={handleCellChange}
              />
            </>
          )}
        </section>
      )}

      {/* 設定エディタ */}
      <ConfigEditor config={config} onChange={setConfig} />
    </main>
  );
}
