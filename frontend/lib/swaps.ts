// シフト交換申請（要件 v2: 交換申請・承認フロー）。
// v1 実装はブラウザ保存。スタッフが /submit から申請し、管理者が /plan で承認する。

export interface SwapRequest {
  id: string;
  from_id: string; // 申請者(この日のシフトを代わってほしい人)
  to_id: string; // 交代相手
  date: string; // YYYY-MM-DD
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

const KEY = "shift-craft-salon:swaps:v1";

export function loadSwaps(): SwapRequest[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SwapRequest[]) : [];
  } catch {
    return [];
  }
}

export function saveSwaps(list: SwapRequest[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // 無視
  }
}

export function addSwap(from_id: string, to_id: string, date: string): SwapRequest {
  const req: SwapRequest = {
    id: `sw${Date.now()}`,
    from_id,
    to_id,
    date,
    status: "pending",
    created_at: new Date().toISOString(),
  };
  saveSwaps([...loadSwaps(), req]);
  return req;
}

export function setSwapStatus(
  id: string,
  status: SwapRequest["status"],
): SwapRequest[] {
  const list = loadSwaps().map((r) => (r.id === id ? { ...r, status } : r));
  saveSwaps(list);
  return list;
}
