// シフト作成の入力設定（solver の SolveRequest と対応）と localStorage 永続化。
// v1 は店舗マスタDBの代わりにブラウザ保存。v2 で Supabase に置き換える。

export interface PatternConfig {
  id: string;
  label: string; // 例: "早番"
  start: string; // "09:00"
  end: string; // "18:00"
  break_min: number; // 休憩(分)
  is_late: boolean;
}

export interface StaffConfig {
  id: string;
  name: string;
  rank: "stylist" | "junior" | "assistant";
  skills: string[];
  max_hours_month: number;
  max_hours_week: number;
  off_days_required: number;
  hourly_wage: number; // 時給(円)
  avail_patterns: string[] | null; // null = 全パターン可
  unavailable_weekdays: number[]; // 勤務不可曜日 0=月..6=日
}

export interface DayRequirements {
  by_rank: Record<string, number>;
  by_skill: Record<string, number>;
}

export type PairKind = "ng_soft" | "ng_hard" | "caution" | "recommend";

export interface PlanConfig {
  start_date: string; // YYYY-MM-DD
  num_days: number;
  closed_weekdays: number[]; // 定休日
  holidays: string[]; // 臨時店休日 (YYYY-MM-DD)
  store_open: string; // 営業開始 "09:00"
  store_close: string; // 営業終了 "21:00"
  patterns: PatternConfig[];
  staff: StaffConfig[];
  requirements: DayRequirements & {
    weekday_overrides: Record<number, DayRequirements>;
  };
  off_requests: [string, string][]; // [staffId, date]
  want_requests: [string, string, string][]; // [staffId, date, patternId]
  pairs: Record<PairKind, [string, string][]>;
  pair_notes: Record<string, string>; // "kind:a:b" -> 理由メモ(管理者用、solver未送信)
  budget_yen: number | null;
  max_consecutive: number;
}

export const SKILLS: { id: string; label: string }[] = [
  { id: "cut", label: "カット" },
  { id: "color", label: "カラー" },
  { id: "perm", label: "パーマ" },
  { id: "shampoo", label: "シャンプー" },
  { id: "reception", label: "受付" },
  { id: "closer", label: "店締め(責任者)" },
];

export const RANKS: { id: StaffConfig["rank"]; label: string }[] = [
  { id: "stylist", label: "スタイリスト" },
  { id: "junior", label: "ジュニア" },
  { id: "assistant", label: "アシスタント" },
];

export const WEEKDAYS_JP = ["月", "火", "水", "木", "金", "土", "日"];

// ---------------------------------------------------------------- 時刻計算

export function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** 実働時間(h) = 終了 - 開始 - 休憩 */
export function patternHours(p: PatternConfig): number {
  const mins = toMin(p.end) - toMin(p.start) - (p.break_min || 0);
  return Math.max(0, Math.round((mins / 60) * 100) / 100);
}

/** 営業時間からはみ出していれば警告文を返す */
export function patternWarning(
  p: PatternConfig,
  open: string,
  close: string,
): string | null {
  if (toMin(p.end) <= toMin(p.start)) return "終了が開始より前です";
  if (patternHours(p) <= 0) return "実働が0時間以下です";
  if (toMin(p.start) < toMin(open) || toMin(p.end) > toMin(close)) {
    return `営業時間(${open}〜${close})の範囲外です`;
  }
  return null;
}

/** "YYYY-MM" の月の日数 */
export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

/** 設定を指定月（1日〜月末）に切り替える */
export function applyMonth(config: PlanConfig, ym: string): PlanConfig {
  return {
    ...config,
    start_date: `${ym}-01`,
    num_days: daysInMonth(ym),
  };
}

export const DEFAULT_PATTERNS: PatternConfig[] = [
  { id: "early", label: "早番", start: "09:00", end: "18:00", break_min: 60, is_late: false },
  { id: "late", label: "遅番", start: "12:00", end: "21:00", break_min: 60, is_late: true },
  { id: "full", label: "通し", start: "09:00", end: "21:00", break_min: 60, is_late: false },
  { id: "short", label: "時短", start: "10:00", end: "15:00", break_min: 0, is_late: false },
];

// ---------------------------------------------------------------- 既定値

export function defaultConfig(): PlanConfig {
  // 1か月単位（1日〜月末）を既定とする
  const start = "2026-08-01";
  const numDays = daysInMonth("2026-08");

  const offRequests: [string, string][] = [];
  const base = new Date(`${start}T00:00:00`);
  for (let i = 0; i < numDays; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    if (d.getDay() === 3) offRequests.push(["s4", d.toISOString().slice(0, 10)]);
  }
  offRequests.push(["s5", "2026-08-01"]);
  offRequests.push(["s3", "2026-08-07"]);

  return {
    start_date: start,
    num_days: numDays,
    closed_weekdays: [],
    holidays: [],
    store_open: "09:00",
    store_close: "21:00",
    patterns: DEFAULT_PATTERNS,
    staff: [
      {
        id: "s1", name: "佐藤(店長)", rank: "stylist",
        skills: ["cut", "color", "perm", "closer"],
        max_hours_month: 160, max_hours_week: 40, off_days_required: 8,
        hourly_wage: 2000, avail_patterns: null, unavailable_weekdays: [],
      },
      {
        id: "s2", name: "鈴木", rank: "stylist",
        skills: ["cut", "color", "closer"],
        max_hours_month: 160, max_hours_week: 40, off_days_required: 8,
        hourly_wage: 1800, avail_patterns: null, unavailable_weekdays: [],
      },
      {
        id: "s3", name: "高橋", rank: "junior",
        skills: ["cut", "color", "shampoo"],
        max_hours_month: 140, max_hours_week: 36, off_days_required: 9,
        hourly_wage: 1400, avail_patterns: null, unavailable_weekdays: [],
      },
      {
        id: "s4", name: "田中(パート)", rank: "assistant",
        skills: ["shampoo", "reception"],
        max_hours_month: 80, max_hours_week: 24, off_days_required: 18,
        hourly_wage: 1150, avail_patterns: ["early", "short"],
        unavailable_weekdays: [],
      },
      {
        id: "s5", name: "伊藤", rank: "assistant",
        skills: ["shampoo", "reception", "color"],
        max_hours_month: 150, max_hours_week: 40, off_days_required: 9,
        hourly_wage: 1200, avail_patterns: null, unavailable_weekdays: [],
      },
    ],
    requirements: {
      by_rank: { stylist: 1, junior: 0, assistant: 1 },
      by_skill: { closer: 1, shampoo: 1 },
      weekday_overrides: {},
    },
    off_requests: offRequests,
    want_requests: [],
    pairs: {
      ng_soft: [["s2", "s3"]],
      ng_hard: [],
      caution: [],
      recommend: [["s1", "s5"]],
    },
    pair_notes: {},
    budget_yen: null,
    max_consecutive: 6,
  };
}

// ---------------------------------------------------------------- solver 送信

/** PlanConfig を solver の SolveRequest 形式に変換する。 */
export function buildSolveRequest(config: PlanConfig): Record<string, unknown> {
  return {
    start_date: config.start_date,
    num_days: config.num_days,
    closed_weekdays: config.closed_weekdays,
    holidays: config.holidays,
    patterns: config.patterns.map((p) => ({
      id: p.id,
      label: `${p.label} ${p.start}-${p.end}`,
      hours: patternHours(p),
      is_late: p.is_late,
      start: p.start,
      end: p.end,
      break_min: p.break_min,
    })),
    staff: config.staff,
    requirements: config.requirements,
    off_requests: config.off_requests,
    want_requests: config.want_requests,
    pairs: config.pairs,
    budget_yen: config.budget_yen,
    max_consecutive: config.max_consecutive,
  };
}

// ---------------------------------------------------------------- 永続化

const STORAGE_KEY = "shift-craft-salon:plan-config:v1";

export function loadConfig(): PlanConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw) as PlanConfig;
    // 旧バージョン保存データのマイグレーション
    // 期間は月単位（1日〜月末）に正規化
    if (cfg.start_date) {
      const ym = cfg.start_date.slice(0, 7);
      cfg.start_date = `${ym}-01`;
      cfg.num_days = daysInMonth(ym);
    }
    cfg.holidays = cfg.holidays ?? [];
    cfg.store_open = cfg.store_open ?? "09:00";
    cfg.store_close = cfg.store_close ?? "21:00";
    cfg.budget_yen = cfg.budget_yen ?? null;
    cfg.want_requests = cfg.want_requests ?? [];
    cfg.pair_notes = cfg.pair_notes ?? {};
    cfg.pairs = {
      ng_soft: cfg.pairs?.ng_soft ?? [],
      ng_hard: cfg.pairs?.ng_hard ?? [],
      caution: cfg.pairs?.caution ?? [],
      recommend: cfg.pairs?.recommend ?? [],
    };
    cfg.requirements = {
      by_rank: cfg.requirements?.by_rank ?? {},
      by_skill: cfg.requirements?.by_skill ?? {},
      weekday_overrides: cfg.requirements?.weekday_overrides ?? {},
    };
    cfg.staff = (cfg.staff ?? []).map((s) => ({
      ...s,
      hourly_wage: s.hourly_wage ?? 0,
      unavailable_weekdays: s.unavailable_weekdays ?? [],
    }));
    // 旧形式パターン（start/end 無し）は既定パターンへ差し替え
    cfg.patterns = (cfg.patterns ?? []).map((p) => {
      if ((p as PatternConfig).start) return p as PatternConfig;
      const def = DEFAULT_PATTERNS.find((dp) => dp.id === (p as { id: string }).id);
      return def ?? DEFAULT_PATTERNS[0];
    });
    if (cfg.patterns.length === 0) cfg.patterns = DEFAULT_PATTERNS;
    return cfg;
  } catch {
    return null;
  }
}

export function saveConfig(config: PlanConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // 保存失敗は無視
  }
}
