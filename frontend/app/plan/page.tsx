"use client";

// シフト作成ページ（管理者向け）。
// 設定を編集 → 生成 → 結果（シフト表）を表示。設定は localStorage に自動保存。

import { ConfigEditor } from "@/components/ConfigEditor";
import { DayTimeline } from "@/components/DayTimeline";
import { FairnessTable } from "@/components/FairnessTable";
import { Nav } from "@/components/Nav";
import { ShiftGrid } from "@/components/ShiftGrid";
import { loadConfirmed, saveConfirmed } from "@/lib/confirmed";
import type { SwapRequest } from "@/lib/swaps";
import { loadSwaps, setSwapStatus } from "@/lib/swaps";
import { buildCsv, buildPayrollCsv } from "@/lib/exportCsv";
import type { PlanConfig } from "@/lib/planConfig";
import {
  addStore,
  buildSolveRequest,
  defaultConfig,
  getActiveStoreId,
  getStoreConfig,
  listStores,
  loadConfig,
  saveConfig,
  switchStore,
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
  const [selDay, setSelDay] = useState<string | null>(null);
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [activeStore, setActiveStore] = useState("main");
  const hydrated = useRef(false);

  // 初回に localStorage から復元
  useEffect(() => {
    const saved = loadConfig();
    if (saved) setConfig(saved);
    setSwaps(loadSwaps());
    setStores(listStores());
    setActiveStore(getActiveStoreId());
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

  const changeStore = (id: string) => {
    if (id === "__add__") {
      const name = window.prompt("新しい店舗名を入力してください", "2号店");
      if (!name) return;
      const newId = addStore(name);
      setStores(listStores());
      setActiveStore(newId);
      setConfig(loadConfig() ?? defaultConfig());
      setSchedule(null);
      return;
    }
    switchStore(id);
    setActiveStore(id);
    setConfig(loadConfig() ?? defaultConfig());
    setSchedule(null);
    setViolations([]);
    setNotice(null);
  };

  const exportPayroll = () => {
    if (!schedule) return;
    const csv = buildPayrollCsv(schedule, config);
    downloadBlob(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
      "payroll.csv",
    );
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
  const confirm = async () => {
    if (!schedule) return;
    saveConfirmed(schedule);
    let msg =
      "✓ 確定しました。「シフト表」タブにこのシフトが表示されます";
    if (config.webhook_url) {
      try {
        const ym = config.start_date.slice(0, 7).replace("-", "年") + "月";
        const res = await fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: config.webhook_url,
            text: `【shift-craft】${ym}のシフトが確定しました`,
          }),
        });
        msg += res.ok ? "（通知を送信しました）" : "（通知の送信に失敗しました）";
      } catch {
        msg += "（通知の送信に失敗しました）";
      }
    }
    setNotice(msg);
  };

  // シフト交換の承認: 確定シフト上で2人の当日割当を入れ替える
  const approveSwap = (req: SwapRequest) => {
    const cur = loadConfirmed();
    if (!cur) {
      setNotice("先にシフトを確定してください（交換は確定シフトに適用されます）");
      return;
    }
    const sched = cur.schedule;
    const a = sched.staff.find((s) => s.id === req.from_id);
    const b = sched.staff.find((s) => s.id === req.to_id);
    if (!a || !b) return;
    const tmp = a.assignments[req.date] ?? null;
    a.assignments[req.date] = b.assignments[req.date] ?? null;
    b.assignments[req.date] = tmp;
    const { schedule: rec, violations: v } = recomputeAndValidate(sched, config);
    saveConfirmed(rec);
    setSwaps(setSwapStatus(req.id, "approved"));
    setNotice(
      v.length
        ? `交換を承認しました（⚠ 違反あり: ${v[0]} 他${v.length - 1}件。シフト表を確認してください）`
        : "交換を承認し、確定シフトに反映しました",
    );
  };

  const rejectSwap = (req: SwapRequest) => {
    setSwaps(setSwapStatus(req.id, "rejected"));
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
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">シフト作成</h1>
            <select
              value={activeStore}
              onChange={(e) => changeStore(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-700"
              title="店舗の切替・追加（多店舗管理）"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="__add__">＋ 店舗を追加...</option>
            </select>
          </div>
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
                  <button
                    onClick={exportPayroll}
                    title="給与計算ソフト取込用のCSV（氏名・出勤日数・労働時間・概算支給額）"
                    className="rounded-md border border-emerald-300 bg-white px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                  >
                    ⬇ 給与CSV
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
              <p className="text-xs text-slate-400">
                日付（列見出し）をクリックすると、その日の時間帯の重なりを表示します
              </p>
              <ShiftGrid
                schedule={schedule}
                editable={editMode}
                onCellChange={handleCellChange}
                onDayClick={(d) => setSelDay(selDay === d ? null : d)}
                selectedDate={selDay}
              />
              {selDay && (
                <DayTimeline
                  schedule={schedule}
                  date={selDay}
                  storeOpen={config.store_open}
                  storeClose={config.store_close}
                />
              )}
            </>
          )}
        </section>
      )}

      {/* 多店舗ヘルプ依頼（不足日があるとき、他店舗のヘルプ可スタッフを提示） */}
      {schedule && (schedule.meta.shortage_total ?? 0) > 0 && (
        <section className="mb-6 rounded-lg border border-violet-200 bg-violet-50/50 p-4">
          <h2 className="text-sm font-semibold text-slate-700">
            ヘルプ依頼リスト（人員不足日）
          </h2>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
            {schedule.days
              .filter((d) => (d.shortage ?? 0) > 0)
              .map((d) => (
                <li key={d.date}>
                  {d.date.slice(5).replace("-", "/")}：
                  {(d.shortage_detail ?? []).join("、")}
                </li>
              ))}
          </ul>
          {(() => {
            const helpers = stores
              .filter((s) => s.id !== activeStore)
              .flatMap((s) => {
                const c = getStoreConfig(s.id);
                return (c?.staff ?? [])
                  .filter((x) => x.help_ok)
                  .map((x) => `${x.name}（${s.name}）`);
              });
            return helpers.length > 0 ? (
              <p className="mt-2 text-sm text-slate-600">
                他店舗のヘルプ候補:{" "}
                <span className="font-medium">{helpers.join("、")}</span>
              </p>
            ) : (
              <p className="mt-2 text-xs text-slate-400">
                他店舗に「他店ヘルプ可」のスタッフが登録されると、ここに候補が表示されます（スタッフマスタで設定）
              </p>
            );
          })()}
        </section>
      )}

      {/* 公平性の可視化 */}
      {schedule && !infeasible && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">
            公平性チェック（スタッフ間の偏り）
          </h2>
          <FairnessTable schedule={schedule} />
        </section>
      )}

      {/* シフト交換申請の承認 */}
      {swaps.some((r) => r.status === "pending") && (
        <section className="mb-6 rounded-lg border border-sky-200 bg-sky-50/60 p-4">
          <h2 className="text-sm font-semibold text-slate-700">
            シフト交換申請（承認待ち）
          </h2>
          <div className="mt-2 space-y-2">
            {swaps
              .filter((r) => r.status === "pending")
              .map((r) => {
                const nameOf = (id: string) =>
                  config.staff.find((s) => s.id === id)?.name ?? id;
                return (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center gap-3 rounded-md bg-white px-3 py-2 text-sm shadow-sm"
                  >
                    <span>
                      {r.date.slice(5).replace("-", "/")}： {nameOf(r.from_id)} →{" "}
                      {nameOf(r.to_id)} に交代希望
                    </span>
                    <span className="ml-auto flex gap-2">
                      <button
                        onClick={() => approveSwap(r)}
                        className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-brand-dark"
                      >
                        承認して反映
                      </button>
                      <button
                        onClick={() => rejectSwap(r)}
                        className="rounded-md border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        却下
                      </button>
                    </span>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* 設定エディタ */}
      <ConfigEditor config={config} onChange={setConfig} />
    </main>
  );
}
