# デプロイ手順

構成：**Vercel（frontend）＋ Cloud Run（solver）**。
solver 未デプロイでもフロント単体で動作する（同梱サンプル解を表示）。

```
┌──────────────┐   POST /api/solve    ┌──────────────────┐
│ Vercel        │ ───────────────────▶ │ Cloud Run         │
│ Next.js       │   (サーバー側proxy)   │ FastAPI + OR-Tools │
│ frontend/     │ ◀─────────────────── │ solver/           │
└──────────────┘   Schedule JSON      └──────────────────┘
```

## 1. Vercel（frontend）

### 初回設定 — Root Directory（重要）

このリポジトリはモノレポ構成のため、**Root Directory の設定が必須**。未設定だと 404 NOT_FOUND になる。

1. Vercel → プロジェクト → **Settings → Build and Deployment**
2. **Root Directory** に `frontend` を入力して Save
3. **Deployments** タブ → 最新デプロイの「…」→ **Redeploy**

Framework Preset は Next.js が自動検出される。Build/Install コマンドの上書きは不要。

### 環境変数

| 変数 | 値 | 備考 |
| :---- | :---- | :---- |
| `SOLVER_API_URL` | Cloud Run の URL | 未設定なら同梱サンプル解を表示（デモモード） |

設定後は Redeploy が必要。

## 2. Cloud Run（solver）

前提：[gcloud CLI](https://cloud.google.com/sdk/docs/install) をインストールし `gcloud auth login` 済み。GCPプロジェクトを1つ用意（課金有効化が必要だが、この規模なら無料枠内に収まる想定）。

```bash
cd solver
./deploy.sh <GCPプロジェクトID>            # 東京リージョン(asia-northeast1)
# ./deploy.sh <GCPプロジェクトID> us-central1  # リージョン指定する場合
```

スクリプトが行うこと：API有効化 → Dockerfile からソースデプロイ → URL表示。

デプロイ後の確認：

```bash
curl https://<サービスURL>/health          # {"status":"ok"}
curl -X POST https://<サービスURL>/solve \
  -H 'Content-Type: application/json' -d '{}' | head -c 300
```

### CORS の制限（推奨）

既定は全オリジン許可。フロントは Next.js API ルート経由（サーバー間通信）なので CORS は必須ではないが、ブラウザから直接叩かせない場合も含めて制限しておくのが安全：

```bash
gcloud run services update shift-craft-solver \
  --region asia-northeast1 \
  --set-env-vars ALLOWED_ORIGINS=https://shift-craft-salon.vercel.app
```

## 3. 接続確認

1. Vercel に `SOLVER_API_URL` を設定して Redeploy
2. サイトの「シフト作成」タブで条件を編集し「シフト生成」
3. 生成結果に amber の「solver 未接続」警告が**出なければ**実ソルバー接続済み
   - トップページのバナーも「solver API 接続中」表示になる

## 4. トラブルシューティング

| 症状 | 原因と対処 |
| :---- | :---- |
| サイトが 404 NOT_FOUND | Root Directory 未設定 → `frontend` を設定して Redeploy |
| サイトが 401/403 | Vercel Deployment Protection（既定有効）。自分はログインで閲覧可。公開するなら Settings → Deployment Protection で無効化 |
| 生成結果に「solver 未接続」警告 | `SOLVER_API_URL` 未設定 or Redeploy 忘れ or solver 停止 |
| 生成が入力エラー(422) | 入力スキーマ不一致。`solver/app/models.py` の `SolveRequest` を確認 |
| INFEASIBLE ばかり出る | 必要人数に対しスタッフ・出勤可能日が不足。公休日数・希望休・NGハードを緩める |
