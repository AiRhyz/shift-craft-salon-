// 確定シフトの保存・読込（v1 はブラウザ localStorage、v2 で Supabase に置換）。
// 「シフト作成」で確定した Schedule を「シフト表」タブが表示する。

import type { Schedule } from "./types";

const KEY = "shift-craft-salon:confirmed-schedule:v1";

export interface ConfirmedSchedule {
  schedule: Schedule;
  confirmed_at: string; // ISO datetime
}

export function loadConfirmed(): ConfirmedSchedule | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ConfirmedSchedule) : null;
  } catch {
    return null;
  }
}

export function saveConfirmed(schedule: Schedule): ConfirmedSchedule {
  const entry: ConfirmedSchedule = {
    schedule,
    confirmed_at: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entry));
  } catch {
    // 保存失敗（容量・プライベートモード等）は無視
  }
  return entry;
}

export function clearConfirmed(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // 無視
  }
}
