# 制約仕様書 v0.1

作成日：2026-07-13　作成：AiRhyz（ドメイン設計）　ステータス：ドラフト
対象：[要件定義書 v1.0](requirements-v1.0.md) 3.3 自動作成エンジンの数式化

本書は、シフト自動作成を CP-SAT（制約充足＋最適化）で解くための、集合・変数・ハード制約・ソフト制約・目的関数の定義を与える。solver 実装（`solver/`）はこの仕様に一対一で対応させる。

---

## 1. モデル概要

シフト作成を **「スタッフ × 日付 × 勤務パターン」への割当問題** として定式化する。
v1 は日単位（勤務パターン割当）とし、時間単位割当は v2 で拡張する。

- 決定：各スタッフを各日に「休み」または「いずれかの勤務パターン」に割り当てる
- 目的：全ハード制約を満たす解の中で、ソフト制約の重み付き合計スコアを最大化する

---

## 2. 集合・添字

| 記号 | 意味 |
| :---- | :---- |
| $s \in S$ | スタッフ（$\lvert S \rvert$ = 5〜15 を想定） |
| $d \in D$ | 対象期間の各日（例：当月 1〜31 日） |
| $p \in P$ | 勤務パターン（早番・遅番・通し・時短 等）。休みは擬似パターン $p_0$ として扱わず、後述の $x$ の「非割当」で表現 |
| $r \in R$ | 役職ランク（スタイリスト／ジュニア／アシスタント） |
| $k \in K$ | スキル（カット・カラー・パーマ・シャンプー・受付・店締め 等） |
| $w \in W$ | 週（$D$ を ISO 週などで分割した集合） |
| $D^{sun} \subseteq D$ | 土日祝の集合 |
| $P^{late} \subseteq P$ | 遅番に該当する勤務パターン |

### パラメータ

| 記号 | 意味 |
| :---- | :---- |
| $h_p$ | 勤務パターン $p$ の実労働時間（休憩控除後、単位：時間） |
| $\text{rank}(s)$ | スタッフ $s$ の役職ランク |
| $\text{skill}(s,k) \in \{0,1\}$ | スタッフ $s$ がスキル $k$ を持つか |
| $\text{avail}(s,d,p) \in \{0,1\}$ | $s$ が $d$ に $p$ で勤務可能か（勤務可能曜日・時間帯から導出） |
| $\text{req}(d,r)$ | $d$ に必要な役職 $r$ の最低人数 |
| $\text{reqSkill}(d,k)$ | $d$ に必要なスキル $k$ 保有者の最低人数 |
| $\text{closer}(s) \in \{0,1\}$ | $s$ が店締め可能な責任者か（スキル「店締め」に対応） |
| $L^{max}_s$ | $s$ の月間上限労働時間 |
| $L^{max,w}_s$ | $s$ の週間上限労働時間 |
| $O_s$ | $s$ の月間公休日数（＝ 出勤日数の上限：$\lvert D_{\text{営業}} \rvert - O_s$ が上限出勤日数） |
| $C^{max}$ | 連勤上限（既定 6） |
| $\text{off}(s,d) \in \{0,1\}$ | $s$ が $d$ に希望休を出したか |
| $\text{want}(s,d,p) \in \{0,1\}$ | $s$ が $d$ に $p$ を希望勤務として出したか |
| $\text{wage}_s$ | $s$ の時給（月給者は時給換算） |
| $B$ | 月間人件費予算（任意。未設定なら人件費項の重みを 0 にする） |
| $\text{pair}(s,s') \in \{\text{NG}, \text{注意}, \text{推奨}, -\}$ | ペア区分 |
| $\text{hardNG}(s,s') \in \{0,1\}$ | NG ペアをハード化する指定 |

---

## 3. 決定変数

$$
x_{s,d,p} \in \{0,1\} \quad :\; \text{スタッフ } s \text{ を日 } d \text{ に勤務パターン } p \text{ で割り当てるなら } 1
$$

補助変数（線形化のため導入）：

- 出勤フラグ　$y_{s,d} = \sum_{p \in P} x_{s,d,p} \in \{0,1\}$
- 同時出勤フラグ　$z_{s,s',d}$：$s$ と $s'$ が同じ日 $d$ に共に出勤（ペア制約用）
- 遅番フラグ　$\ell_{s,d} = \sum_{p \in P^{late}} x_{s,d,p}$

---

## 4. ハード制約（絶対遵守）

| # | 名称 | 定式化 |
| :--- | :--- | :--- |
| H0 | 1日1パターン | $\sum_{p} x_{s,d,p} \le 1 \quad \forall s,d$ |
| H0' | 勤務可能性 | $x_{s,d,p} \le \text{avail}(s,d,p) \quad \forall s,d,p$ |
| H1 | 役職別必要人数 | $\sum_{s:\text{rank}(s)=r} y_{s,d} \ge \text{req}(d,r) \quad \forall d,r$ |
| H1' | スキル別必要人数 | $\sum_{s:\text{skill}(s,k)=1} y_{s,d} \ge \text{reqSkill}(d,k) \quad \forall d,k$ |
| H2 | 希望休の反映 | $y_{s,d} = 0 \quad \forall (s,d)\;\text{s.t.}\;\text{off}(s,d)=1$ |
| H3 | 連勤上限 | 任意の連続 $C^{max}+1$ 日窓で $\sum_{d \in \text{window}} y_{s,d} \le C^{max}$ |
| H4a | 週間上限労働時間 | $\sum_{d \in w}\sum_p h_p\, x_{s,d,p} \le L^{max,w}_s \quad \forall s,w$ |
| H4b | 月間上限労働時間 | $\sum_{d}\sum_p h_p\, x_{s,d,p} \le L^{max}_s \quad \forall s$ |
| H4c | 月間公休日数 | $\sum_{d \in D_{\text{営業}}} y_{s,d} \le \lvert D_{\text{営業}} \rvert - O_s \quad \forall s$ |
| H5 | 責任者配置 | $\sum_{s:\text{closer}(s)=1} y_{s,d} \ge 1 \quad \forall d \in D_{\text{営業}}$ |
| H6 | NGペア（ハード化分） | $y_{s,d} + y_{s',d} \le 1 \quad \forall d,\ \forall (s,s')\;\text{s.t.}\;\text{hardNG}(s,s')=1$ |
| H7 | 法定労働・休憩 | 各 $p$ の $h_p$ は休憩控除済み。$L^{max,w}_s \le 40$h（法定）を既定上限とし、H4a に内包 |

> **連勤上限 H3 の窓**：期間端の扱いは、前月末の連勤状況を初期値 `carryover_streak` として与えることで跨ぎを厳密化できる（v0.1 では期間内のみ。前月跨ぎは v1 実装時に対応）。

---

## 5. ソフト制約（重み付きスコア）

各ソフト制約を「加点／減点項」として目的関数に線形結合する。重みは店舗ごとに調整可能（既定値は下表）。

| # | 名称 | 方向 | 既定重み | 定式化（目的関数への寄与） |
| :--- | :--- | :--- | :--- | :--- |
| S1 | 土日祝出勤の平準化 | 最小化 | $w_1 = 8$ | $\max_s a_s - \min_s a_s$ を最小化（$a_s=\sum_{d\in D^{sun}} y_{s,d}$）。線形化は $\text{range}^{sun}$ 変数で表現 |
| S2 | 遅番の平準化 | 最小化 | $w_2 = 5$ | $\text{range}^{late} = \max_s b_s - \min_s b_s$（$b_s=\sum_d \ell_{s,d}$） |
| S3 | 指名スタイリストの繁忙帯配置 | 最大化 | $w_3 = 6$ | $\sum_{s,d}\text{popular}(s)\cdot\text{busy}(d)\cdot y_{s,d}$ |
| S4 | OJT・推奨ペア同時出勤 | 最大化 | $w_4 = 4$ | $\sum_{d}\sum_{(s,s')\in\text{推奨}} z_{s,s',d}$ |
| S5 | NG・注意ペア同時出勤回避 | 最小化 | $w_5^{NG}=10,\ w_5^{注意}=4$ | $\sum_{d}\sum_{(s,s')\in\text{NG}(soft)} z_{s,s',d}$（区分ごとに重み） |
| S5' | ペア緩和（2名体制帯のみ回避） | 最小化 | $w_{5'}=7$ | 出勤人数が2名以下の日 $d$ に限り $z_{s,s',d}$ を減点（$\text{thin}(d)$ フラグ） |
| S6 | 希望勤務パターン一致 | 最大化 | $w_6 = 3$ | $\sum_{s,d,p}\text{want}(s,d,p)\cdot x_{s,d,p}$ |
| S7 | 人件費の予算内収束 | 最小化 | $w_7 = 2$ | 予算超過分 $\max(0,\ \text{cost}-B)$ を減点（$\text{cost}=\sum_{s,d,p}\text{wage}_s h_p x_{s,d,p}$） |

### 同時出勤フラグ $z$ の線形化

$z_{s,s',d}$ は $y_{s,d} \wedge y_{s',d}$ の AND。CP-SAT では次の3式、または `AddMultiplicationEquality` / `AddBoolAnd` で表現：

$$
z_{s,s',d} \le y_{s,d}, \quad z_{s,s',d} \le y_{s',d}, \quad z_{s,s',d} \ge y_{s,d} + y_{s',d} - 1
$$

（加点対象＝下界のみ、減点対象＝上界のみ効かせれば足りるが、汎用のため両側を張る。）

---

## 6. 目的関数

最大化する総合スコア：

$$
\begin{aligned}
\max \quad
&\; w_3 \cdot \text{（S3 加点）} + w_4 \cdot \text{（S4 加点）} + w_6 \cdot \text{（S6 加点）} \\
&- w_1 \cdot \text{range}^{sun} - w_2 \cdot \text{range}^{late} \\
&- w_5^{NG}\!\sum \! z^{NG} - w_5^{注意}\!\sum \! z^{注意} - w_{5'}\!\sum \! z^{thin} \\
&- w_7 \cdot \text{overBudget}
\end{aligned}
$$

CP-SAT は整数目的のみ扱うため、全項を整数重みで結合し `model.Maximize(...)` に渡す。

---

## 7. 解不能時のハンドリング

ハード制約で解が存在しない（`INFEASIBLE`）場合、原因を切り分けて管理者に提示する。方針：

1. **仮説ソルブ**：主要ハード制約（H1 必要人数・H5 責任者・H2 希望休・H6 ハードNG）を一時的にソフト化（違反にペナルティ変数を割当）して再ソルブし、違反が集中する制約・日を特定する。
2. **原因提示**：`必要人数を満たせない日`／`責任者不在の日`／`ハードNG過多`／`希望休集中日` を列挙。
3. **緩和サジェスト**：該当するハード制約のソフト化、NGペアのハード→ソフト変更、必要人数の一時緩和 等を候補提示。

---

## 8. 重み調整とチューニング

- 重みは店舗設定として保持し、店長の採点フィードバックで段階調整（要件 8-3）。
- スケール差の大きい項（人件費 vs 人数）は正規化してから重みを掛ける。v0.1 の既定重みは PoC 検証後に再調整する。

---

## 9. solver 実装との対応

| 本書 | 実装（`solver/`） |
| :--- | :--- |
| 集合・パラメータ | 入力データモデル（Pydantic）／PoC はダミー生成 |
| 決定変数 $x,y,z,\ell$ | `model.NewBoolVar` 群 |
| H0–H7 | `add_hard_constraints()` |
| S1–S7 | `add_soft_terms()` → 目的項リスト |
| 目的関数 | `model.Maximize(sum(terms))` |
| 解不能ハンドリング | `diagnose_infeasible()`（v1 実装、PoC は状態表示のみ） |

PoC（`solver/poc/`）は本仕様のうち H0–H6・S1/S5/S6 を最小実装し、5名×14日規模で数秒以内に解けることを確認する。
