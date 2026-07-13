import type { Schedule } from "@/lib/types";
import { RANK_LABEL, WEEKDAY_JP } from "@/lib/schedule";

// 勤務パターン id -> 短縮ラベルと色
const PATTERN_STYLE: Record<string, { label: string; cls: string }> = {
  early: { label: "早", cls: "bg-sky-100 text-sky-800" },
  late: { label: "遅", cls: "bg-indigo-100 text-indigo-800" },
  full: { label: "通", cls: "bg-amber-100 text-amber-800" },
  short: { label: "時", cls: "bg-emerald-100 text-emerald-800" },
};

export function ShiftGrid({ schedule }: { schedule: Schedule }) {
  const { days, staff, patterns } = schedule;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-600">
                スタッフ
              </th>
              {days.map((d) => {
                const day = Number(d.date.slice(8, 10));
                return (
                  <th
                    key={d.date}
                    className={`px-2 py-2 text-center font-medium ${
                      d.is_weekend ? "bg-rose-50 text-rose-600" : "text-slate-500"
                    }`}
                  >
                    <div>{day}</div>
                    <div className="text-[10px]">{WEEKDAY_JP[d.weekday]}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="sticky left-0 z-10 bg-white px-3 py-2 whitespace-nowrap">
                  <div className="font-medium text-slate-800">{s.name}</div>
                  <div className="text-[11px] text-slate-400">
                    {RANK_LABEL[s.rank] ?? s.rank}
                  </div>
                </td>
                {days.map((d) => {
                  const p = s.assignments[d.date];
                  const style = p ? PATTERN_STYLE[p] : null;
                  return (
                    <td key={d.date} className="px-1 py-1 text-center">
                      {style ? (
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold ${style.cls}`}
                          title={
                            patterns.find((pp) => pp.id === p)?.label ?? p ?? ""
                          }
                        >
                          {style.label}
                        </span>
                      ) : (
                        <span className="text-slate-300">・</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        {patterns.map((p) => {
          const style = PATTERN_STYLE[p.id];
          return (
            <span key={p.id} className="inline-flex items-center gap-1.5">
              <span
                className={`inline-flex h-5 w-5 items-center justify-center rounded ${
                  style?.cls ?? "bg-slate-100"
                } text-[10px] font-semibold`}
              >
                {style?.label ?? "?"}
              </span>
              {p.label}
            </span>
          );
        })}
        <span className="inline-flex items-center gap-1.5">
          <span className="text-slate-300">・</span>休
        </span>
      </div>
    </div>
  );
}
