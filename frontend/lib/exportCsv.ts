// solver 未接続時の CSV フォールバック出力（Excel で開ける UTF-8 BOM 付き）。
import type { Schedule } from "./types";
import { WEEKDAY_JP } from "./schedule";

export function buildCsv(schedule: Schedule): string {
  const short = (label: string) => (label ? label[0] : "?");
  const labelOf = new Map(schedule.patterns.map((p) => [p.id, short(p.label)]));

  const rows: string[][] = [];
  rows.push(["スタッフ", ...schedule.days.map((d) => d.date.slice(5))]);
  rows.push(["", ...schedule.days.map((d) => WEEKDAY_JP[d.weekday])]);
  for (const s of schedule.staff) {
    rows.push([
      s.name,
      ...schedule.days.map((d) => {
        const p = s.assignments[d.date];
        return p ? (labelOf.get(p) ?? "?") : "休";
      }),
    ]);
  }
  rows.push([]);
  rows.push(["スタッフ", "労働時間(h)", "土日出勤"]);
  for (const s of schedule.staff) {
    rows.push([s.name, String(s.total_hours), String(s.weekend_shifts)]);
  }

  return rows
    .map((r) => r.map((c) => `"${c.replaceAll('"', '""')}"`).join(","))
    .join("\r\n");
}
