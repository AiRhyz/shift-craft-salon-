# solver

Python FastAPI ＋ Google OR-Tools（CP-SAT）による最適化API。シフト作成を「スタッフ×日付への勤務パターン割当問題」として定式化し、ハード制約を充足しつつソフト制約のスコアを最大化する解を返す。

## 役割

- 制約モデルの構築（ハード制約：必要人数・希望休・連勤上限・労働時間・責任者配置・法令／ソフト制約：公平性・相性・希望一致・人件費）
- 解の生成と、解不能時の原因特定・緩和サジェスト
- コンテナ化して Cloud Run 等で稼働

## 状態

制約仕様書 v0.1（[../docs/constraint-spec.md](../docs/constraint-spec.md)）を策定し、CP-SAT による実現性を PoC で確認済み。FastAPI 化は未着手。

### PoC（実現性検証）

`poc/` に、制約仕様書の H0–H6・S1/S4/S5/S6 を最小実装した検証コードがある。5名×14日を 0.02 秒未満で最適求解できることを確認済み。

```bash
pip install -r requirements.txt
python -m poc.run_poc
```

詳細は [poc/README.md](poc/README.md) を参照。要件全体は [../docs/requirements-v1.0.md](../docs/requirements-v1.0.md)、制約の定式化は [../docs/constraint-spec.md](../docs/constraint-spec.md) を参照。
