# solver

Python FastAPI ＋ Google OR-Tools（CP-SAT）による最適化API。シフト作成を「スタッフ×日付への勤務パターン割当問題」として定式化し、ハード制約を充足しつつソフト制約のスコアを最大化する解を返す。

## 役割

- 制約モデルの構築（ハード制約：必要人数・希望休・連勤上限・労働時間・責任者配置・法令／ソフト制約：公平性・相性・希望一致・人件費）
- 解の生成と、解不能時の原因特定・緩和サジェスト
- コンテナ化して Cloud Run 等で稼働

## 状態

制約仕様書 v0.1（[../docs/constraint-spec.md](../docs/constraint-spec.md)）に基づき、**FastAPI + OR-Tools の最適化API（`app/`）を実装済み**。`poc/` は実現性検証用に残置。

## API（`app/`）

FastAPI アプリ。制約仕様書の H0–H6・S1/S4/S5/S6 を入力駆動で実装。

### エンドポイント

| メソッド | パス | 用途 |
| :---- | :---- | :---- |
| GET | `/health` | ヘルスチェック（Cloud Run 用） |
| POST | `/solve` | シフト求解。ボディが空 or `staff`/`patterns` 未指定ならデモ既定で解く |
| GET | `/solve/demo` | デモ既定（5名×14日）を解いて返す |
| GET | `/docs` | 自動生成の OpenAPI ドキュメント |

レスポンスは frontend の `lib/types.ts`（`Schedule`）と一致。

### ローカル起動

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
# 動作確認
curl -X POST localhost:8080/solve -H 'Content-Type: application/json' -d '{}'
```

### Docker / Cloud Run

```bash
docker build -t shift-craft-solver .
docker run -p 8080:8080 shift-craft-solver
# Cloud Run へは gcloud run deploy 等でデプロイ。$PORT を尊重する。
```

デプロイ後、その URL を frontend の環境変数 `SOLVER_API_URL` に設定するとフロントが実ソルバーに接続する。CORS は `ALLOWED_ORIGINS`（カンマ区切り）で Vercel ドメインに限定すること。

### 入力スキーマ（POST /solve）

`app/models.py` の `SolveRequest`。主なフィールド：`start_date`/`num_days`、`patterns`、`staff`（rank・skills・上限時間・公休日数・`avail_patterns`）、`requirements`（`by_rank`/`by_skill`）、`off_requests`、`want_requests`、`pairs`（`ng_soft`/`ng_hard`/`recommend`）、`weights`、`max_consecutive`。

### PoC（実現性検証）

`poc/` に、制約仕様書の H0–H6・S1/S4/S5/S6 を最小実装した検証コードがある。5名×14日を 0.02 秒未満で最適求解できることを確認済み。

```bash
pip install -r requirements.txt
python -m poc.run_poc
```

詳細は [poc/README.md](poc/README.md) を参照。要件全体は [../docs/requirements-v1.0.md](../docs/requirements-v1.0.md)、制約の定式化は [../docs/constraint-spec.md](../docs/constraint-spec.md) を参照。
