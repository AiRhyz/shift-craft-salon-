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

// 勤怠・給与CSV（給与計算ソフト取込用。要件 v3）
import type { PlanConfig } from "./planConfig";
import { RANK_LABEL } from "./schedule";

export function buildPayrollCsv(schedule: Schedule, config: PlanConfig): string {
  const wageOf = new Map(config.staff.map((s) => [s.id, s.hourly_wage]));
  const rows: string[][] = [];
  rows.push([
    "氏名", "役職", "出勤日数", "労働時間(h)", "土日出勤", "時給(円)", "概算支給額(円)",
  ]);
  let total = 0;
  for (const s of schedule.staff) {
    const workDays = Object.values(s.assignments).filter(Boolean).length;
    const wage = wageOf.get(s.id) ?? 0;
    const pay = Math.round(s.total_hours * wage);
    total += pay;
    rows.push([
      s.name,
      RANK_LABEL[s.rank] ?? s.rank,
      String(workDays),
      s.total_hours.toFixed(1),
      String(s.weekend_shifts),
      String(wage),
      String(pay),
    ]);
  }
  rows.push([]);
  rows.push(["合計", "", "", "", "", "", String(total)]);
  return rows
    .map((r) => r.map((c) => `"${c.replaceAll('"', '""')}"`).join(","))
    .join("\r\n");
}
