"""PoC 実行エントリ。5名×14日のダミーシフトを解き、結果を表形式で表示する。

使い方:
    cd solver && python -m poc.run_poc
"""
from __future__ import annotations

from .dummy_data import SHIFT_PATTERNS, build_instance
from .shift_model import build_and_solve

# パターン表示用の短縮ラベル
LABEL = {"early": "早", "late": "遅", "full": "通", "short": "時"}


def main() -> int:
    inst = build_instance()
    sol = build_and_solve(inst, max_seconds=10.0)

    print("=" * 64)
    print("shift-craft-salon  solver PoC  (constraint-spec v0.1)")
    print("=" * 64)
    print(f"規模        : スタッフ{len(inst.staff)}名 × {len(inst.days)}日")
    print(f"求解ステータス: {sol.status}")
    print(f"求解時間    : {sol.solve_time_s:.3f} 秒")
    if sol.status not in ("OPTIMAL", "FEASIBLE"):
        print("\n解が見つかりませんでした（制約が過剰な可能性）。")
        print("→ v1 では diagnose_infeasible() で原因制約を特定・緩和サジェストする。")
        return 1

    print(f"目的関数値  : {sol.objective:.0f}")
    print(f"ソフトNG同時出勤: {sol.ng_soft_violations} 回（少ないほど良い）")
    print(f"推奨ペア同時出勤: {sol.recommend_together} 回（多いほど良い）")
    print(f"希望勤務の充足 : {sol.want_met} 件")

    # --- シフト表（スタッフ × 日）---
    print("\n[ シフト表 ]  早=早番 遅=遅番 通=通し 時=時短 ・=休")
    header = "        " + " ".join(f"{d.day:>2}" for d in inst.days)
    print(header)
    weekday = "        " + " ".join(
        f"{'月火水木金土日'[d.weekday()]:>2}" for d in inst.days
    )
    print(weekday)
    for s in inst.staff:
        cells = []
        for d in inst.days:
            p = sol.assign.get((s.id, d.isoformat()))
            cells.append(f"{LABEL.get(p, '・'):>2}")
        print(f"{s.name[:6]:<7} " + " ".join(cells))

    # --- 集計 ---
    print("\n[ 個人別集計 ]")
    print(f"{'スタッフ':<8}{'労働時間':>8}{'土日出勤':>8}")
    for s in inst.staff:
        h = sol.per_staff_hours.get(s.id, 0.0)
        wk = sol.per_staff_weekend.get(s.id, 0)
        print(f"{s.name[:7]:<8}{h:>7.1f}h{wk:>7}回")

    wk_vals = list(sol.per_staff_weekend.values())
    print(f"\n土日出勤の偏り(range): {max(wk_vals) - min(wk_vals)}  "
          f"(max={max(wk_vals)}, min={min(wk_vals)})")
    print("\nPoC 検証: 小規模インスタンスで全ハード制約を満たす解を数秒以内に取得できた。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
