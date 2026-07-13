# frontend

Next.js（App Router / TypeScript / Tailwind CSS）による管理画面・スタッフ向けUI。**Vercel にデプロイする。**

## 役割

- 管理者：マスタ管理、相性マトリクス管理、自動作成の実行、手動調整、確定・公開
- スタッフ：希望休・希望シフトの提出、確定シフトの閲覧

## 現状（v1 MVP）

- シフト表（スタッフ × 日）ビュー、個人別集計、求解サマリを表示
- solver 接続点を実装済み：`SOLVER_API_URL` があれば OR-Tools ソルバー（`/solve`）を呼び、
  未設定なら同梱の **PoC 実解**（`lib/sample-schedule.json`）を表示。
  → solver 未デプロイでも Vercel 単体で実際のシフト表が動く。

## ローカル開発

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

## ビルド

```bash
npm run build
```

## Vercel へのデプロイ

このアプリはリポジトリの `frontend/` サブディレクトリにある。Vercel 側で:

1. リポジトリをインポート
2. **Root Directory** を `frontend` に設定（Framework は Next.js が自動検出）
3. （任意）環境変数 `SOLVER_API_URL` に solver（Cloud Run 等）の URL を設定
   - 未設定なら同梱サンプルを表示するため、まずは無設定でデプロイ可能

## 環境変数

| 変数 | 用途 |
| :---- | :---- |
| `SOLVER_API_URL` | solver（FastAPI + OR-Tools）のベースURL。未設定時は同梱 PoC 実解を表示 |

`.env.example` を参照。

## 構成

```
frontend/
├── app/
│   ├── layout.tsx
│   ├── page.tsx            シフト表・サマリ・集計
│   └── globals.css
├── components/
│   └── ShiftGrid.tsx       スタッフ×日のシフトグリッド
├── lib/
│   ├── schedule.ts         solver 取得（API or 同梱サンプル）
│   ├── types.ts            solver 出力の型
│   └── sample-schedule.json  solver/poc の実解を同梱
└── ...
```

要件全体は [../docs/requirements-v1.0.md](../docs/requirements-v1.0.md)、制約は [../docs/constraint-spec.md](../docs/constraint-spec.md) を参照。
