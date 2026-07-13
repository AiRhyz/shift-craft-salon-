"""CP-SAT シフト割当モデル（PoC）。

docs/constraint-spec.md の H0–H6・S1/S5/S6 を最小実装する。
決定変数・制約・目的項の対応はコメントに制約番号（H1, S5 など）を付す。
"""
from __future__ import annotations

from dataclasses import dataclass

from ortools.sat.python import cp_model

from .dummy_data import Instance, LATE_PATTERNS, SHIFT_PATTERNS

# ソフト制約の既定重み（constraint-spec.md §5）。整数目的にするため整数で保持。
WEIGHTS = {
    "s1_weekend_range": 8,   # 土日出勤の平準化（減点）
    "s5_ng_soft": 10,        # ソフトNGペア同時出勤（減点）
    "s4_recommend": 4,       # 推奨/OJTペア同時出勤（加点）
    "s6_want": 3,            # 希望勤務パターン一致（加点）
}
# パターン別労働時間（分単位に丸めて整数化：h*60）
PATTERN_MIN = {pid: round(hours * 60) for pid, (_, hours, _) in SHIFT_PATTERNS.items()}


@dataclass
class Solution:
    status: str
    objective: float
    assign: dict[tuple[str, str], str]        # (staff_id, iso_date) -> pattern_id
    per_staff_hours: dict[str, float]
    per_staff_weekend: dict[str, int]
    solve_time_s: float
    ng_soft_violations: int
    recommend_together: int
    want_met: int


def build_and_solve(inst: Instance, max_seconds: float = 10.0) -> Solution:
    model = cp_model.CpModel()
    patterns = list(SHIFT_PATTERNS)
    staff_by_id = {s.id: s for s in inst.staff}

    # --- 決定変数 x[s,d,p]（constraint-spec §3） ---
    x: dict[tuple[str, str, str], cp_model.IntVar] = {}
    for s in inst.staff:
        for d in inst.days:
            for p in patterns:
                # H0': 勤務可能なパターンのみ変数を作る
                if p in s.avail_patterns:
                    x[(s.id, d.isoformat(), p)] = model.NewBoolVar(
                        f"x_{s.id}_{d.isoformat()}_{p}"
                    )

    def x_of(sid: str, d, p):
        return x.get((sid, d.isoformat(), p))

    # 出勤フラグ y[s,d] = sum_p x（constraint-spec §3）
    y: dict[tuple[str, str], cp_model.IntVar] = {}
    for s in inst.staff:
        for d in inst.days:
            yv = model.NewBoolVar(f"y_{s.id}_{d.isoformat()}")
            terms = [x_of(s.id, d, p) for p in patterns if x_of(s.id, d, p) is not None]
            # H0: 1日1パターン（sum_p x <= 1）かつ y = sum_p x
            model.Add(yv == sum(terms))
            y[(s.id, d.isoformat())] = yv

    # ---------------- ハード制約 ----------------
    _add_headcount(model, inst, y)                 # H1 / H1'
    _add_off_requests(model, inst, y)              # H2
    _add_consecutive(model, inst, y)               # H3
    _add_hours_limits(model, inst, x, patterns)    # H4a / H4b
    _add_rest_days(model, inst, y)                 # H4c
    _add_closer(model, inst, y)                    # H5
    _add_hard_ng(model, inst, y)                   # H6

    # ---------------- ソフト制約（目的項） ----------------
    obj_terms: list = []
    obj_terms += _soft_weekend_balance(model, inst, y)     # S1
    ng_soft_z = _soft_ng_pairs(model, inst, y, obj_terms)  # S5
    rec_z = _soft_recommend_pairs(model, inst, y, obj_terms)  # S4
    want_lits = _soft_want(model, inst, x, obj_terms)      # S6

    model.Maximize(sum(obj_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max_seconds
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)

    return _extract(solver, status, inst, x, y, patterns, ng_soft_z, rec_z, want_lits)


# ============================ ハード制約 ============================

def _add_headcount(model, inst: Instance, y):
    # H1: 役職別の必要人数
    for d in inst.days:
        for rank, need in inst.req_rank.items():
            if need <= 0:
                continue
            model.Add(
                sum(y[(s.id, d.isoformat())] for s in inst.staff if s.rank == rank) >= need
            )
        # H1': スキル別の必要人数
        for skill, need in inst.req_skill.items():
            if need <= 0:
                continue
            model.Add(
                sum(y[(s.id, d.isoformat())] for s in inst.staff if skill in s.skills) >= need
            )


def _add_off_requests(model, inst: Instance, y):
    # H2: 希望休は出勤 0
    for sid, d in inst.off_requests:
        model.Add(y[(sid, d.isoformat())] == 0)


def _add_consecutive(model, inst: Instance, y):
    # H3: 連続 C^max+1 日の窓で出勤 <= C^max
    c = inst.max_consecutive
    for s in inst.staff:
        for i in range(len(inst.days) - c):
            window = inst.days[i:i + c + 1]
            model.Add(sum(y[(s.id, d.isoformat())] for d in window) <= c)


def _add_hours_limits(model, inst: Instance, x, patterns):
    # H4b: 月間上限労働時間（分換算）
    for s in inst.staff:
        month_terms = [
            PATTERN_MIN[p] * x[(s.id, d.isoformat(), p)]
            for d in inst.days for p in patterns
            if (s.id, d.isoformat(), p) in x
        ]
        model.Add(sum(month_terms) <= round(s.max_hours_month * 60))

    # H4a: 週間上限労働時間（ISO 週で分割）
    weeks: dict[tuple[int, int], list] = {}
    for d in inst.days:
        iso = d.isocalendar()
        weeks.setdefault((iso[0], iso[1]), []).append(d)
    for s in inst.staff:
        for _, wdays in weeks.items():
            week_terms = [
                PATTERN_MIN[p] * x[(s.id, d.isoformat(), p)]
                for d in wdays for p in patterns
                if (s.id, d.isoformat(), p) in x
            ]
            model.Add(sum(week_terms) <= round(s.max_hours_week * 60))


def _add_rest_days(model, inst: Instance, y):
    # H4c: 月間公休日数 -> 出勤日数上限
    n_days = len(inst.days)
    for s in inst.staff:
        max_work_days = max(0, n_days - s.off_days_required)
        model.Add(sum(y[(s.id, d.isoformat())] for d in inst.days) <= max_work_days)


def _add_closer(model, inst: Instance, y):
    # H5: 店締め責任者を毎営業日 1名以上
    closers = [s for s in inst.staff if s.can_close()]
    for d in inst.days:
        model.Add(sum(y[(s.id, d.isoformat())] for s in closers) >= 1)


def _add_hard_ng(model, inst: Instance, y):
    # H6: ハードNGペアは同日同時出勤禁止
    for a, b in inst.pair_ng_hard:
        for d in inst.days:
            model.Add(y[(a, d.isoformat())] + y[(b, d.isoformat())] <= 1)


# ============================ ソフト制約 ============================

def _pair_and(model, ya, yb, name):
    """z = ya AND yb を線形化して返す（constraint-spec §5）。"""
    z = model.NewBoolVar(name)
    model.Add(z <= ya)
    model.Add(z <= yb)
    model.Add(z >= ya + yb - 1)
    return z


def _soft_weekend_balance(model, inst: Instance, y):
    # S1: 土日出勤回数の range を最小化（-w * range）
    a = {}
    for s in inst.staff:
        av = model.NewIntVar(0, len(inst.weekend_holidays), f"wk_{s.id}")
        model.Add(av == sum(
            y[(s.id, d.isoformat())] for d in inst.days if d in inst.weekend_holidays
        ))
        a[s.id] = av
    hi = model.NewIntVar(0, len(inst.weekend_holidays), "wk_max")
    lo = model.NewIntVar(0, len(inst.weekend_holidays), "wk_min")
    for s in inst.staff:
        model.Add(hi >= a[s.id])
        model.Add(lo <= a[s.id])
    rng = model.NewIntVar(0, len(inst.weekend_holidays), "wk_range")
    model.Add(rng == hi - lo)
    return [-WEIGHTS["s1_weekend_range"] * rng]


def _soft_ng_pairs(model, inst: Instance, y, obj_terms) -> list:
    # S5: ソフトNGペア同時出勤を減点
    zs = []
    for a, b in inst.pair_ng_soft:
        for d in inst.days:
            z = _pair_and(model, y[(a, d.isoformat())], y[(b, d.isoformat())],
                          f"ng_{a}_{b}_{d.isoformat()}")
            obj_terms.append(-WEIGHTS["s5_ng_soft"] * z)
            zs.append(z)
    return zs


def _soft_recommend_pairs(model, inst: Instance, y, obj_terms) -> list:
    # S4: 推奨/OJTペア同時出勤を加点
    zs = []
    for a, b in inst.pair_recommend:
        for d in inst.days:
            z = _pair_and(model, y[(a, d.isoformat())], y[(b, d.isoformat())],
                          f"rec_{a}_{b}_{d.isoformat()}")
            obj_terms.append(WEIGHTS["s4_recommend"] * z)
            zs.append(z)
    return zs


def _soft_want(model, inst: Instance, x, obj_terms) -> list:
    # S6: 希望勤務パターン一致を加点
    lits = []
    for sid, d, p in inst.want_requests:
        var = x.get((sid, d.isoformat(), p))
        if var is not None:
            obj_terms.append(WEIGHTS["s6_want"] * var)
            lits.append(var)
    return lits


# ============================ 解の取り出し ============================

def _extract(solver, status, inst, x, y, patterns, ng_soft_z, rec_z, want_lits) -> Solution:
    status_name = solver.StatusName(status)
    assign: dict[tuple[str, str], str] = {}
    per_hours: dict[str, float] = {}
    per_weekend: dict[str, int] = {}

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for s in inst.staff:
            hours = 0.0
            weekend = 0
            for d in inst.days:
                for p in patterns:
                    var = x.get((s.id, d.isoformat(), p))
                    if var is not None and solver.Value(var) == 1:
                        assign[(s.id, d.isoformat())] = p
                        hours += PATTERN_MIN[p] / 60.0
                        if d in inst.weekend_holidays:
                            weekend += 1
            per_hours[s.id] = hours
            per_weekend[s.id] = weekend

        ng_v = sum(solver.Value(z) for z in ng_soft_z)
        rec_v = sum(solver.Value(z) for z in rec_z)
        want_v = sum(solver.Value(v) for v in want_lits)
        objective = solver.ObjectiveValue()
    else:
        ng_v = rec_v = want_v = 0
        objective = float("nan")

    return Solution(
        status=status_name,
        objective=objective,
        assign=assign,
        per_staff_hours=per_hours,
        per_staff_weekend=per_weekend,
        solve_time_s=solver.WallTime(),
        ng_soft_violations=ng_v,
        recommend_together=rec_v,
        want_met=want_v,
    )
