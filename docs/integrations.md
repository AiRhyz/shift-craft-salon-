# 外部連携ガイド（通知・データベース）

## 1. 確定通知（Slack / Discord / LINE）

シフト確定時に通知を送れます。

### Slack / Discord（設定画面だけで完結・推奨）

1. **Slack**: ワークスペースで「Incoming Webhook」アプリを追加し、Webhook URL を発行
   **Discord**: サーバー設定 → 連携サービス → ウェブフック → URL をコピー
2. アプリの「シフト作成」タブ → **通知設定** に URL を貼り付け
3. 「この内容で確定」を押すと `【shift-craft】2026年8月のシフトが確定しました` が届く

### LINE（LINE公式アカウントが必要）

LINE は Webhook 方式が使えないため、Messaging API を使います。

1. [LINE Developers](https://developers.line.biz/) でチャネル（Messaging API）を作成
2. **チャネルアクセストークン（長期）** を発行
3. 送信先の userId または groupId を取得（Bot をグループに招待し webhook で確認）
4. Vercel → Settings → Environment Variables に設定して Redeploy:

| 変数 | 値 |
| :---- | :---- |
| `LINE_CHANNEL_ACCESS_TOKEN` | チャネルアクセストークン |
| `LINE_TO` | 送信先の userId / groupId |

設定すると、確定時に Webhook と併せて LINE にも push 送信されます（`/api/notify` が送信）。

## 2. Supabase 永続化（複数端末・スタッフのスマホ対応）

現在のデータ保存はブラウザ内（localStorage）のため、**同じ端末・ブラウザでのみ共有**されます。
スタッフが各自のスマホから希望提出・シフト閲覧するには Supabase（無料枠あり）への移行が必要です。

### 手順（準備）

1. https://supabase.com でプロジェクト作成
2. SQL Editor で `supabase/schema.sql` を実行（テーブル作成）
3. Vercel の環境変数に設定:

| 変数 | 値 |
| :---- | :---- |
| `NEXT_PUBLIC_SUPABASE_URL` | プロジェクト URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public キー |

### 状態

スキーマ（`supabase/schema.sql`）とテーブル設計は用意済み。
アプリ側のストレージ切替（localStorage → Supabase）は次バージョンで実装予定です。
現時点の運用は「店舗の共有端末 or 店長の端末で全員分を入力」を想定してください。
