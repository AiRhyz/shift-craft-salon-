// Excel 出力プロキシ。Schedule JSON を solver /export/xlsx に転送して xlsx を返す。
// solver 未接続時は 503 を返し、クライアント側で CSV フォールバックする。

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const apiUrl = process.env.SOLVER_API_URL;
  if (!apiUrl) {
    return Response.json(
      { error: "solver 未接続のため Excel 出力は利用できません" },
      { status: 503 },
    );
  }
  try {
    const body = await request.text();
    const res = await fetch(`${apiUrl.replace(/\/$/, "")}/export/xlsx`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
    });
    if (!res.ok) {
      return Response.json(
        { error: `solver エラー ${res.status}` },
        { status: 502 },
      );
    }
    return new Response(res.body, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="shift.xlsx"',
      },
    });
  } catch (err) {
    console.error("[api/export] solver 呼び出し失敗:", err);
    return Response.json({ error: "solver 接続失敗" }, { status: 502 });
  }
}
