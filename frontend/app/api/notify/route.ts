// 確定通知の送信プロキシ（要件 v2: 通知連携）。
// - webhook: Slack / Discord の Incoming Webhook 等へ汎用 POST（text と content の両キーを含む）
// - LINE: 環境変数 LINE_CHANNEL_ACCESS_TOKEN と LINE_TO（userId/groupId）を設定すると
//   LINE Messaging API の push で送信する（docs/integrations.md 参照）

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const { url, text } = (await request.json().catch(() => ({}))) as {
    url?: string;
    text?: string;
  };
  if (!text) {
    return Response.json({ error: "text は必須です" }, { status: 400 });
  }

  const results: Record<string, string> = {};

  // 汎用 Webhook（Slack: text / Discord: content の両対応）
  if (url) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, content: text }),
        cache: "no-store",
      });
      results.webhook = res.ok ? "ok" : `error ${res.status}`;
    } catch {
      results.webhook = "接続失敗";
    }
  }

  // LINE Messaging API（環境変数設定時のみ）
  const lineToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const lineTo = process.env.LINE_TO;
  if (lineToken && lineTo) {
    try {
      const res = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lineToken}`,
        },
        body: JSON.stringify({
          to: lineTo,
          messages: [{ type: "text", text }],
        }),
        cache: "no-store",
      });
      results.line = res.ok ? "ok" : `error ${res.status}`;
    } catch {
      results.line = "接続失敗";
    }
  }

  if (Object.keys(results).length === 0) {
    return Response.json(
      { error: "送信先未設定（webhook_url か LINE 環境変数を設定してください）" },
      { status: 400 },
    );
  }
  return Response.json({ results });
}
