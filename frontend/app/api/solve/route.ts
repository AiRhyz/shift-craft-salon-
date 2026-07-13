// solver へのサーバーサイドプロキシ。
// - SOLVER_API_URL があれば solver /solve に転送（CORS・URL秘匿のためサーバー経由）
// - 未設定/障害時は同梱の PoC 実解にフォールバックし、meta.source で明示する

import sample from "@/lib/sample-schedule.json";
import type { Schedule } from "@/lib/types";

export const dynamic = "force-dynamic";

function sampleFallback(reason: string): Schedule {
  const s = sample as Schedule;
  return {
    ...s,
    meta: { ...s.meta, source: `bundled sample (${reason})` },
  };
}

export async function POST(request: Request): Promise<Response> {
  const apiUrl = process.env.SOLVER_API_URL;
  const body = await request.json().catch(() => ({}));

  if (!apiUrl) {
    return Response.json(sampleFallback("solver未接続"));
  }

  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, "")}/solve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      // 入力不正(422)はそのまま返してUIで表示する
      if (res.status === 422) {
        return new Response(detail, {
          status: 422,
          headers: { "Content-Type": "application/json" },
        });
      }
      console.error(`[api/solve] solver error ${res.status}: ${detail}`);
      return Response.json(sampleFallback(`solverエラー ${res.status}`));
    }
    return Response.json(await res.json());
  } catch (err) {
    console.error("[api/solve] solver 呼び出し失敗:", err);
    return Response.json(sampleFallback("solver接続失敗"));
  }
}
