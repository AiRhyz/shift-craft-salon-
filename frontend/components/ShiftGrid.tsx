import type { Schedule } from "@/lib/types";
import { RANK_LABEL, WEEKDAY_JP } from "@/lib/schedule";

// パターン数が可変になったため、色は並び順でパレットから割当てる
export const PALETTE_SOLID = [
  "bg-sky-500", "bg-indigo-500", "bg-amber-500", "bg-emerald-500",
  "bg-purple-500", "bg-pink-500", "bg-teal-500", "bg-lime-500",
];

const PALETTE = [
  "bg-sky-100 text-sky-800",
  "bg-indigo-100 text-indigo-800",
  "bg-amber-100 text-amber-800",
  "bg-emerald-100 text-emerald-800",
  "bg-purple-100 text-purple-800",
  "bg-pink-100 text-pink-800",
  "bg-teal-100 text-teal-800",
  "bg-lime-100 text-lime-800",
];

function shortLabel(label: string): string {
  return label ? label[0] : "?";
}

export function ShiftGrid({
  schedule,
  editable = false,
  onCellChange,
  onDayClick,
  selectedDate,
}: {
  schedule: Schedule;
  editable?: boolean;
  onCellChange?: (staffId: string, date: string, patternId: string | null) => void;
  onDayClick?: (date: string) => void;
  selectedDate?: string | null;
}) {
  const { days, staff, patterns } = schedule;
  const hasShortage = days.some((d) => (d.shortage ?? 0) > 0);
  const styleOf = new Map(
    patterns.map((p, i) => [p.id, PALETTE[i % PALETTE.length]]),
  );

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
                const selected = selectedDate === d.date;
                return (
                  <th
                    key={d.date}
                    onClick={onDayClick ? () => onDayClick(d.date) : undefined}
                    title={onDayClick ? "クリックで時間帯表示" : undefined}
                    className={`px-2 py-2 text-center font-medium ${
                      d.is_weekend ? "bg-rose-50 text-rose-600" : "text-slate-500"
                    } ${onDayClick ? "cursor-pointer hover:bg-brand/10" : ""} ${
                      selected ? "bg-brand/15 ring-2 ring-inset ring-brand" : ""
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
                  const pat = p ? patterns.find((pp) => pp.id === p) : null;
                  if (editable && onCellChange) {
                    return (
                      <td key={d.date} className="px-0.5 py-1 text-center">
                        <select
                          value={p ?? ""}
                          onChange={(e) =>
                            onCellChange(s.id, d.date, e.target.value || null)
                          }
                          title={pat?.label ?? "休"}
                          className={`h-7 w-9 cursor-pointer appearance-none rounded-md border-0 text-center text-xs font-semibold focus:ring-2 focus:ring-brand ${
                            p
                              ? (styleOf.get(p) ?? "bg-slate-100")
                              : "bg-white text-slate-300"
                          }`}
                        >
                          <option value="">・</option>
                          {patterns.map((pp) => (
                            <option key={pp.id} value={pp.id}>
                              {shortLabel(pp.label)}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  }
                  return (
                    <td key={d.date} className="px-1 py-1 text-center">
                      {p ? (
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold ${
                            styleOf.get(p) ?? "bg-slate-100"
                          }`}
                          title={pat?.label ?? p}
                        >
                          {shortLabel(pat?.label ?? p)}
                        </span>
                      ) : (
                        <span className="text-slate-300">・</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {hasShortage && (
              <tr className="border-t-2 border-rose-200 bg-rose-50/60">
                <td className="sticky left-0 z-10 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                  不足人数
                </td>
                {days.map((d) => {
                  const n = d.shortage ?? 0;
                  return (
                    <td key={d.date} className="px-1 py-1 text-center">
                      {n > 0 ? (
                        <span
                          className="text-sm font-bold text-rose-600"
                          title={(d.shortage_detail ?? []).join(" / ")}
                        >
                          -{n}
                        </span>
                      ) : (
                        <span className="text-slate-200">0</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {hasShortage && (
        <div className="text-xs text-rose-500">
          「不足人数」行の赤字はその日に必要人数へ届かない人数です（数字にカーソルを当てると内訳を表示）
        </div>
      )}

      {/* 凡例 */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        {patterns.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1.5">
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded ${
                styleOf.get(p.id) ?? "bg-slate-100"
              } text-[10px] font-semibold`}
            >
              {shortLabel(p.label)}
            </span>
            {p.label}（{p.hours}h）
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="text-slate-300">・</span>休
        </span>
      </div>
    </div>
  );
}
