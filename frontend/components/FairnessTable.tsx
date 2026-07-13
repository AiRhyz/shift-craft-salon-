// 公平性スコアの可視化（要件 v2）。
// スタッフ別の出勤日数・労働時間・土日出勤・パターン別担当回数と、その偏り(range)を表示する。

import type { Schedule } from "@/lib/types";
import { RANK_LABEL } from "@/lib/schedule";

export function FairnessTable({ schedule }: { schedule: Schedule }) {
  const { staff, patterns, days } = schedule;

  const rows = staff.map((s) => {
    const counts: Record<string, number> = {};
    let workDays = 0;
    for (const d of days) {
      const pid = s.assignments[d.date];
      if (!pid) continue;
      workDays += 1;
      counts[pid] = (counts[pid] ?? 0) + 1;
    }
    return { s, workDays, counts };
  });

  const range = (vals: number[]) =>
    vals.length ? Math.max(...vals) - Math.min(...vals) : 0;

  const cols = [
    { key: "work", label: "出勤日数", val: (r: (typeof rows)[number]) => r.workDays },
    { key: "hours", label: "労働時間", val: (r: (typeof rows)[number]) => r.s.total_hours },
    { key: "weekend", label: "土日出勤", val: (r: (typeof rows)[number]) => r.s.weekend_shifts },
    ...patterns.map((p) => ({
      key: p.id,
      label: p.label.split(" ")[0],
      val: (r: (typeof rows)[number]) => r.counts[p.id] ?? 0,
    })),
  ];

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left font-medium">スタッフ</th>
            {cols.map((c) => (
              <th key={c.key} className="px-3 py-2 text-right font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.s.id} className="border-t border-slate-100">
              <td className="px-3 py-2 whitespace-nowrap">
                <span className="font-medium text-slate-800">{r.s.name}</span>
                <span className="ml-1.5 text-[11px] text-slate-400">
                  {RANK_LABEL[r.s.rank] ?? r.s.rank}
                </span>
              </td>
              {cols.map((c) => (
                <td
                  key={c.key}
                  className="px-3 py-2 text-right tabular-nums text-slate-700"
                >
                  {c.key === "hours" ? `${c.val(r).toFixed(1)}h` : c.val(r)}
                </td>
              ))}
            </tr>
          ))}
          {/* 偏り(最大-最小)。大きい列は不公平のサイン */}
          <tr className="border-t-2 border-slate-200 bg-slate-50/70 text-xs">
            <td className="px-3 py-2 font-semibold text-slate-500">
              偏り（最大−最小）
            </td>
            {cols.map((c) => {
              const rg = range(rows.map((r) => c.val(r)));
              return (
                <td
                  key={c.key}
                  className={`px-3 py-2 text-right font-bold tabular-nums ${
                    rg >= 3
                      ? "text-rose-600"
                      : rg >= 2
                        ? "text-amber-600"
                        : "text-emerald-600"
                  }`}
                >
                  {c.key === "hours" ? rg.toFixed(1) : rg}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
