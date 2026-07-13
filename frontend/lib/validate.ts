// 手動調整後のシフトを再計算・検証する（要件 3.4: 違反の即時警告）。
// solver と同じルール（必要人数・希望休・連勤・労働時間・勤務可否）をクライアント側で判定。

import type { PlanConfig, DayRequirements } from "./planConfig";
import { RANKS, SKILLS, WEEKDAYS_JP, patternHours } from "./planConfig";
import type { Schedule } from "./types";

const RANK_JP: Record<string, string> = Object.fromEntries(
  RANKS.map((r) => [r.id, r.label]),
);
const SKILL_JP: Record<string, string> = Object.fromEntries(
  SKILLS.map((s) => [s.id, s.label]),
);

function fmtDate(iso: string): string {
  return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
}

function reqForWeekday(config: PlanConfig, wd: number): DayRequirements {
  return config.requirements.weekday_overrides[wd] ?? config.requirements;
}

/**
 * 手動調整後のシフトを検証し、(1)集計と不足行を再計算した Schedule、
 * (2)違反メッセージ一覧 を返す。
 */
export function recomputeAndValidate(
  schedule: Schedule,
  config: PlanConfig,
): { schedule: Schedule; violations: string[] } {
  const violations: string[] = [];
  const hoursOf: Record<string, number> = {};
  for (const p of config.patterns) hoursOf[p.id] = patternHours(p);
  // solver 由来のパターン（設定に無いID）は schedule 側の hours を使う
  for (const p of schedule.patterns) hoursOf[p.id] = hoursOf[p.id] ?? p.hours;

  const staffCfg = new Map(config.staff.map((s) => [s.id, s]));
  const closed = new Set(config.closed_weekdays);
  const holidays = new Set(config.holidays ?? []);
  const isClosedDay = (date: string, weekday: number) =>
    closed.has(weekday) || holidays.has(date);
  const offSet = new Set(config.off_requests.map(([sid, d]) => `${sid}:${d}`));

  // ---------- スタッフ単位の検証と集計 ----------
  const newStaff = schedule.staff.map((s) => {
    const cfg = staffCfg.get(s.id);
    let total = 0;
    let weekend = 0;
    let streak = 0;
    let maxStreak = 0;
    const weekHours: Record<string, number> = {}; // 月曜起点の週キー -> h
    let assignedDays = 0;

    for (const day of schedule.days) {
      const pid = s.assignments[day.date];
      if (!pid) {
        streak = 0;
        continue;
      }
      const h = hoursOf[pid] ?? 0;
      total += h;
      assignedDays += 1;
      if (day.is_weekend) weekend += 1;
      streak += 1;
      maxStreak = Math.max(maxStreak, streak);

      // 週キー: その週の月曜日
      const dt = new Date(`${day.date}T00:00:00`);
      const mondayOffset = (dt.getDay() + 6) % 7;
      dt.setDate(dt.getDate() - mondayOffset);
      const wkKey = dt.toISOString().slice(0, 10);
      weekHours[wkKey] = (weekHours[wkKey] ?? 0) + h;

      // 個別違反チェック
      if (isClosedDay(day.date, day.weekday)) {
        violations.push(
          `${fmtDate(day.date)}: 定休日・臨時店休日に ${s.name} が割り当てられています`,
        );
      }
      if (offSet.has(`${s.id}:${day.date}`)) {
        violations.push(`${fmtDate(day.date)}: ${s.name} の希望休に出勤が入っています`);
      }
      if (cfg) {
        if (cfg.unavailable_weekdays.includes(day.weekday)) {
          violations.push(
            `${fmtDate(day.date)}: ${s.name} は${WEEKDAYS_JP[day.weekday]}曜が勤務不可です`,
          );
        }
        if (cfg.avail_patterns !== null && !cfg.avail_patterns.includes(pid)) {
          violations.push(
            `${fmtDate(day.date)}: ${s.name} に勤務不可のパターンが割り当てられています`,
          );
        }
      }
    }

    if (cfg) {
      if (maxStreak > config.max_consecutive) {
        violations.push(
          `${s.name}: ${maxStreak}連勤（上限${config.max_consecutive}連勤を超過）`,
        );
      }
      if (total > cfg.max_hours_month) {
        violations.push(
          `${s.name}: 期間内労働 ${total.toFixed(1)}h が月上限 ${cfg.max_hours_month}h を超過`,
        );
      }
      for (const [wk, h] of Object.entries(weekHours)) {
        if (h > cfg.max_hours_week) {
          violations.push(
            `${s.name}: ${fmtDate(wk)}週の労働 ${h.toFixed(1)}h が週上限 ${cfg.max_hours_week}h を超過`,
          );
        }
      }
      const openDays = schedule.days.filter(
        (d) => !isClosedDay(d.date, d.weekday),
      ).length;
      const maxWork = Math.max(0, openDays - cfg.off_days_required);
      if (assignedDays > maxWork) {
        violations.push(
          `${s.name}: 出勤 ${assignedDays}日（公休${cfg.off_days_required}日を確保すると上限${maxWork}日）`,
        );
      }
    }

    return {
      ...s,
      total_hours: Math.round(total * 10) / 10,
      weekend_shifts: weekend,
    };
  });

  // ---------- 日別の不足再計算（役職=合算、スキル=最大） ----------
  const newDays = schedule.days.map((day) => {
    if (isClosedDay(day.date, day.weekday))
      return { ...day, shortage: 0, shortage_detail: [] };
    const req = reqForWeekday(config, day.weekday);
    const detail: string[] = [];
    let rankSum = 0;
    let skillMax = 0;

    for (const [rank, need] of Object.entries(req.by_rank)) {
      if (need <= 0) continue;
      const have = newStaff.filter(
        (s) => staffCfg.get(s.id)?.rank === rank && s.assignments[day.date],
      ).length;
      if (have < need) {
        const short = need - have;
        rankSum += short;
        detail.push(`${RANK_JP[rank] ?? rank}${short}名不足`);
      }
    }
    for (const [skill, need] of Object.entries(req.by_skill)) {
      if (need <= 0) continue;
      const have = newStaff.filter(
        (s) =>
          (staffCfg.get(s.id)?.skills ?? []).includes(skill) &&
          s.assignments[day.date],
      ).length;
      if (have < need) {
        const short = need - have;
        skillMax = Math.max(skillMax, short);
        detail.push(`${SKILL_JP[skill] ?? skill}要員${short}名不足`);
      }
    }
    return {
      ...day,
      shortage: Math.max(rankSum, skillMax),
      shortage_detail: detail,
    };
  });

  // ---------- 人件費 ----------
  let cost = 0;
  let hasWage = false;
  for (const s of newStaff) {
    const wage = staffCfg.get(s.id)?.hourly_wage ?? 0;
    if (wage > 0) hasWage = true;
    cost += s.total_hours * wage;
  }
  if (config.budget_yen != null && cost > config.budget_yen) {
    violations.push(
      `概算人件費 ¥${Math.round(cost).toLocaleString()} が予算 ¥${config.budget_yen.toLocaleString()} を超過`,
    );
  }

  const shortageTotal = newDays.reduce((a, d) => a + (d.shortage ?? 0), 0);
  return {
    schedule: {
      ...schedule,
      staff: newStaff,
      days: newDays,
      meta: {
        ...schedule.meta,
        estimated_cost_yen: hasWage ? Math.round(cost) : null,
        shortage_total: shortageTotal,
      },
    },
    violations,
  };
}
