// シフト作成の入力設定（solver の SolveRequest と一対一）と localStorage 永続化。
// v1 は店舗マスタDBの代わりにブラウザ保存。v2 で Supabase に置き換える。

import type { SchedulePattern } from "./types";

export interface StaffConfig {
  id: string;
  name: string;
  rank: "stylist" | "junior" | "assistant";
  skills: string[];
  max_hours_month: number;
  max_hours_week: number;
  off_days_required: number;
  avail_patterns: string[] | null; // null = 全パターン可
}

export interface PlanConfig {
  start_date: string; // YYYY-MM-DD
  num_days: number;
  closed_weekdays: number[]; // 定休日 0=月 .. 6=日
  patterns: SchedulePattern[];
  staff: StaffConfig[];
  requirements: {
    by_rank: Record<string, number>;
    by_skill: Record<string, number>;
  };
  off_requests: [string, string][]; // [staffId, YYYY-MM-DD]
  pairs: {
    ng_soft: [string, string][];
    ng_hard: [string, string][];
    recommend: [string, string][];
  };
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

export const DEFAULT_PATTERNS: SchedulePattern[] = [
  { id: "early", label: "早番 9:00-18:00", hours: 8.0, is_late: false },
  { id: "late", label: "遅番 12:00-21:00", hours: 8.0, is_late: true },
  { id: "full", label: "通し 9:00-21:00", hours: 11.0, is_late: false },
  { id: "short", label: "時短 10:00-15:00", hours: 5.0, is_late: false },
];

/** デモ（solver/app/demo.py）と等価の初期設定を返す。 */
export function defaultConfig(): PlanConfig {
  const start = "2026-08-01";
  const numDays = 14;

  // 田中(パート)は毎週水曜休み希望
  const offRequests: [string, string][] = [];
  const base = new Date(`${start}T00:00:00`);
  for (let i = 0; i < numDays; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    if (d.getDay() === 3) {
      // JS: 3 = 水曜
      offRequests.push(["s4", d.toISOString().slice(0, 10)]);
    }
  }
  offRequests.push(["s5", "2026-08-01"]);
  offRequests.push(["s3", "2026-08-07"]);

  return {
    start_date: start,
    num_days: numDays,
    closed_weekdays: [],
    patterns: DEFAULT_PATTERNS,
    staff: [
      {
        id: "s1", name: "佐藤(店長)", rank: "stylist",
        skills: ["cut", "color", "perm", "closer"],
        max_hours_month: 160, max_hours_week: 40, off_days_required: 4,
        avail_patterns: null,
      },
      {
        id: "s2", name: "鈴木", rank: "stylist",
        skills: ["cut", "color", "closer"],
        max_hours_month: 160, max_hours_week: 40, off_days_required: 4,
        avail_patterns: null,
      },
      {
        id: "s3", name: "高橋", rank: "junior",
        skills: ["cut", "color", "shampoo"],
        max_hours_month: 140, max_hours_week: 36, off_days_required: 5,
        avail_patterns: null,
      },
      {
        id: "s4", name: "田中(パート)", rank: "assistant",
        skills: ["shampoo", "reception"],
        max_hours_month: 80, max_hours_week: 24, off_days_required: 8,
        avail_patterns: ["early", "short"],
      },
      {
        id: "s5", name: "伊藤", rank: "assistant",
        skills: ["shampoo", "reception", "color"],
        max_hours_month: 150, max_hours_week: 40, off_days_required: 5,
        avail_patterns: null,
      },
    ],
    requirements: {
      by_rank: { stylist: 1, junior: 0, assistant: 1 },
      by_skill: { closer: 1, shampoo: 1 },
    },
    off_requests: offRequests,
    pairs: {
      ng_soft: [["s2", "s3"]],
      ng_hard: [],
      recommend: [["s1", "s5"]],
    },
    max_consecutive: 6,
  };
}

const STORAGE_KEY = "shift-craft-salon:plan-config:v1";

export function loadConfig(): PlanConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PlanConfig) : null;
  } catch {
    return null;
  }
}

export function saveConfig(config: PlanConfig): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // 保存失敗は無視（プライベートモード等）
  }
}
