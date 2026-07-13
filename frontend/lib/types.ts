// solver の出力（solver/poc/export_json.py）に対応する型。
// 本番は solver API のレスポンススキーマと一致させる。

export interface SchedulePattern {
  id: string;
  label: string;
  hours: number;
  is_late: boolean;
  start?: string | null;
  end?: string | null;
  break_min?: number;
}

export interface ScheduleDay {
  date: string; // ISO (YYYY-MM-DD)
  weekday: number; // 0=月 ... 6=日
  is_weekend: boolean;
  shortage?: number; // 不足人日（BEST_EFFORT 時）
  shortage_detail?: string[]; // 例: "アシスタント1名不足"
}

export interface ScheduleStaff {
  id: string;
  name: string;
  rank: "stylist" | "junior" | "assistant" | string;
  skills: string[];
  assignments: Record<string, string | null>; // date -> pattern id | null(休)
  total_hours: number;
  weekend_shifts: number;
}

export interface ScheduleMeta {
  source: string;
  status: string; // OPTIMAL | FEASIBLE | INFEASIBLE ...
  objective: number | null;
  solve_time_s: number;
  ng_soft_violations: number;
  caution_violations?: number;
  recommend_together: number;
  want_met: number;
  estimated_cost_yen?: number | null; // 概算人件費（時給設定時のみ）
  diagnosis?: string[] | null; // INFEASIBLE/BEST_EFFORT 時の原因診断
  shortage_total?: number; // 不足人日の合計（BEST_EFFORT 時）
  store_open?: string | null; // 営業時間（タイムライン表示用）
  store_close?: string | null;
}

export interface Schedule {
  meta: ScheduleMeta;
  patterns: SchedulePattern[];
  days: ScheduleDay[];
  staff: ScheduleStaff[];
}
