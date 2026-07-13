import sample from "./sample-schedule.json";
import type { Schedule } from "./types";

/**
 * シフト（解）を取得する。
 *
 * - SOLVER_API_URL が設定されていれば solver（FastAPI + OR-Tools）を呼ぶ。
 * - 未設定なら、同梱の PoC 実解（sample-schedule.json）を返す。
 *   これにより Vercel 単体デプロイでも実際のシフト表を表示できる。
 */
export async function getSchedule(): Promise<Schedule> {
  const apiUrl = process.env.SOLVER_API_URL;
  if (apiUrl) {
    const res = await fetch(`${apiUrl.replace(/\/$/, "")}/solve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}), // v1: マスタ/希望データを送る
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`solver API error: ${res.status}`);
    }
    return (await res.json()) as Schedule;
  }
  return sample as Schedule;
}

export const RANK_LABEL: Record<string, string> = {
  stylist: "スタイリスト",
  junior: "ジュニア",
  assistant: "アシスタント",
};

export const WEEKDAY_JP = ["月", "火", "水", "木", "金", "土", "日"];
