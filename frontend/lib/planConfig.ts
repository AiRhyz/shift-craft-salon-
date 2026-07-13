// シフト作成の入力設定（solver の SolveRequest と対応）と localStorage 永続化。
// v1 は店舗マスタDBの代わりにブラウザ保存。v2 で Supabase に置き換える。

export interface PatternConfig {
  id: string;
  label: string; // 例: "早番"
  start: string; // "09:00"
  end: string; // "18:00"
  break_min: number; // 休憩(分)
  balance: boolean; // 回数を平準化（担当回数の偏りを最小化）
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
  help_ok?: boolean; // 他店舗へのヘルプ勤務可（多店舗管理用）
}

export interface DemandForecast {
  wd_day: number; // 平日日中の1時間あたり予約数
  wd_eve: number; // 平日夕方(17時以降)の1時間あたり予約数
  we: number; // 土日の1時間あたり予約数
  cap: number; // スタイリスト1人が1時間に対応できる件数
}

export interface DayRequirements {
  by_rank: Record<string, number>;
  by_skill: Record<string, number>;
}

export interface TimeBand {
  start: string; // "18:00"
  end: string; // "21:00"
  min_staff: number;
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
    coverage_min: number; // 営業時間中の最低在店人数(0=チェックしない)
    time_bands: TimeBand[]; // 時間帯別の追加下限(例: 18-21時は2名)
  };
  webhook_url: string; // 確定通知の送信先(Slack/Discord Webhook等。空=通知しない)
  demand: DemandForecast | null; // 需要予測(予約見込み)。必要人数の提案に使用
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
  const h = patternHours(p);
  if (h > 8 && (p.break_min || 0) < 60) {
    return "実働8時間超は休憩60分以上が必要です（労基法34条）";
  }
  if (h > 6 && (p.break_min || 0) < 45) {
    return "実働6時間超は休憩45分以上が必要です（労基法34条）";
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
  { id: "early", label: "早番", start: "09:00", end: "18:00", break_min: 60, balance: false },
  { id: "late", label: "遅番", start: "12:00", end: "21:00", break_min: 60, balance: true },
  { id: "full", label: "通し", start: "09:00", end: "21:00", break_min: 60, balance: false },
  { id: "short", label: "時短", start: "10:00", end: "15:00", break_min: 0, balance: false },
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
      coverage_min: 1,
      time_bands: [],
    },
    webhook_url: "",
    demand: null,
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
    store_open: config.store_open,
    store_close: config.store_close,
    patterns: config.patterns.map((p) => ({
      id: p.id,
      label: `${p.label} ${p.start}-${p.end}`,
      hours: patternHours(p),
      is_late: p.balance, // 後方互換用（旧APIの遅番フラグ）
      balance: p.balance,
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

// ---------------------------------------------------------------- 永続化（多店舗対応）

const STORAGE_KEY = "shift-craft-salon:plan-config:v1"; // 旧: 単一店舗
const STORES_KEY = "shift-craft-salon:stores:v1";

interface StoresState {
  active: string;
  stores: Record<string, { name: string; config: PlanConfig }>;
}

function loadStoresRaw(): StoresState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORES_KEY);
    if (raw) return JSON.parse(raw) as StoresState;
    // 旧単一店舗データからの移行
    const legacy = window.localStorage.getItem(STORAGE_KEY);
    if (legacy) {
      const st: StoresState = {
        active: "main",
        stores: { main: { name: "本店", config: JSON.parse(legacy) } },
      };
      window.localStorage.setItem(STORES_KEY, JSON.stringify(st));
      return st;
    }
    return null;
  } catch {
    return null;
  }
}

function saveStoresRaw(st: StoresState): void {
  try {
    window.localStorage.setItem(STORES_KEY, JSON.stringify(st));
  } catch {
    // 無視
  }
}

export function getActiveStoreId(): string {
  return loadStoresRaw()?.active ?? "main";
}

export function listStores(): { id: string; name: string }[] {
  const st = loadStoresRaw();
  if (!st) return [{ id: "main", name: "本店" }];
  return Object.entries(st.stores).map(([id, s]) => ({ id, name: s.name }));
}

export function getStoreConfig(id: string): PlanConfig | null {
  const st = loadStoresRaw();
  return st?.stores[id]?.config ?? null;
}

export function addStore(name: string): string {
  const st = loadStoresRaw() ?? {
    active: "main",
    stores: { main: { name: "本店", config: defaultConfig() } },
  };
  const id = `st${Date.now() % 1000000}`;
  st.stores[id] = { name, config: defaultConfig() };
  st.active = id;
  saveStoresRaw(st);
  return id;
}

export function switchStore(id: string): void {
  const st = loadStoresRaw();
  if (st && st.stores[id]) {
    st.active = id;
    saveStoresRaw(st);
  }
}

export function loadConfig(): PlanConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const st = loadStoresRaw();
    if (!st) return null;
    const cfg = st.stores[st.active]?.config;
    if (!cfg) return null;
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
      coverage_min: cfg.requirements?.coverage_min ?? 1,
      time_bands: cfg.requirements?.time_bands ?? [],
    };
    cfg.webhook_url = cfg.webhook_url ?? "";
    cfg.demand = cfg.demand ?? null;
    cfg.staff = (cfg.staff ?? []).map((s) => ({
      ...s,
      hourly_wage: s.hourly_wage ?? 0,
      unavailable_weekdays: s.unavailable_weekdays ?? [],
    }));
    // 旧形式パターン（start/end 無し）は既定パターンへ差し替え
    cfg.patterns = (cfg.patterns ?? []).map((raw) => {
      const p = raw as PatternConfig & { is_late?: boolean };
      if (!p.start) {
        const def = DEFAULT_PATTERNS.find((dp) => dp.id === p.id);
        return def ?? DEFAULT_PATTERNS[0];
      }
      // 旧フィールド is_late からの移行
      return { ...p, balance: p.balance ?? p.is_late ?? false };
    });
    if (cfg.patterns.length === 0) cfg.patterns = DEFAULT_PATTERNS;
    cfg.staff = cfg.staff.map((s) => ({ ...s, help_ok: s.help_ok ?? false }));
    return cfg;
  } catch {
    return null;
  }
}

export function saveConfig(config: PlanConfig): void {
  if (typeof window === "undefined") return;
  const st = loadStoresRaw() ?? {
    active: "main",
    stores: { main: { name: "本店", config } },
  };
  st.stores[st.active] = { name: st.stores[st.active]?.name ?? "本店", config };
  saveStoresRaw(st);
}
