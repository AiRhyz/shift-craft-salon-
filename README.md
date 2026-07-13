# shift-craft-salon

美容室向けシフト自動作成ツール。制約ベースの最適化により、希望休・スキル配置・法令遵守・公平性・スタッフ間の相性を考慮したシフトを自動生成する。

> `shift-craft-*` シリーズの美容室（salon）版。将来的にクリニック・飲食など他業種展開を見据え、共通最適化エンジンは `shift-craft-core` として切り出す構成を想定。

## 特徴

- **制約ベース自動作成** — スタッフ×日付への勤務パターン割当問題として定式化し、Google OR-Tools（CP-SAT）で解く
- **ハード制約／ソフト制約の二層設計** — 必要人数・法定労働時間・連勤上限は絶対遵守、公平性や相性は重み付きスコアで最適化
- **相性マトリクス** — NGペア／注意ペア／推奨ペアを登録し、配置に反映（管理者限定・センシティブ情報として保護）
- **スマホ完結の希望収集** — スタッフはスマホから希望休・希望シフトを提出
- **手動調整＋違反警告** — 自動生成後にドラッグ調整、制約違反はその場で警告
- **帳票出力** — 月間シフト表のExcel／PDF、個人別労働時間・概算人件費の集計

## 技術スタック

| レイヤー | 技術 |
| :---- | :---- |
| フロントエンド | Next.js（App Router）／Vercel |
| 最適化API | Python FastAPI ＋ Google OR-Tools（CP-SAT） |
| DB／認証 | PostgreSQL（Supabase）／Supabase Auth |
| 帳票 | openpyxl（Excel） |

## リポジトリ構成

```
shift-craft-salon/
├── README.md
├── docs/
│   └── requirements-v1.0.md   要件定義書
├── frontend/                  Next.js（管理画面・スタッフUI）
└── solver/                    FastAPI + OR-Tools（最適化API）
```

## デプロイ（Vercel）

フロントエンド（`frontend/`）を Vercel にデプロイする。Python の solver は Vercel では動かないため、Cloud Run 等に置き、フロントから `SOLVER_API_URL` 経由で呼ぶ構成。

1. Vercel にリポジトリをインポート
2. **Root Directory** を `frontend` に設定（Next.js は自動検出）
3. （任意）環境変数 `SOLVER_API_URL` に solver の URL を設定
   - 未設定なら `frontend/lib/sample-schedule.json`（solver PoC の実解）を表示するため、solver 未デプロイでも動作する

詳細は [frontend/README.md](frontend/README.md) を参照。

## ドキュメント

- [要件定義書 v1.0](docs/requirements-v1.0.md)
- [制約仕様書 v0.1](docs/constraint-spec.md)

## リリース計画

| フェーズ | スコープ |
| :---- | :---- |
| v1（MVP） | マスタ管理／希望収集フォーム／自動作成／手動調整／Excel出力 |
| v2 | 時間単位割当、LINE通知、シフト交換申請、法令アラート強化、公平性の可視化 |
| v3 | 予約データ連動の需要予測配置、多店舗ヘルプ管理、勤怠・給与CSV連携 |

## ステータス

- ✅ 要件定義書 v1.0
- ✅ 制約仕様書 v0.1（ハード/ソフト制約の数式化）
- ✅ solver PoC（CP-SAT で 5名×14日を 0.02 秒未満で最適求解、実現性確認済み）
- ✅ frontend MVP（Next.js、シフト表表示、Vercel デプロイ済み）
- ✅ solver の FastAPI 化（`/solve`・`/health`・`/solve/demo`、Dockerfile で Cloud Run 対応）
- ⬜ solver の Cloud Run デプロイ＋フロントの `SOLVER_API_URL` 接続
- ⬜ マスタ管理・希望収集フォームの実装（現状は入力データ固定）
