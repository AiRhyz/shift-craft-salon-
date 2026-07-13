"""CP-SAT シフト求解エンジン（入力駆動）。

制約仕様書 v0.1 の H0–H6・S1/S4/S5/S6 を実装。solver/poc の最小実装を
リクエスト駆動に一般化したもの。制約番号はコメントに付す。
"""
from __future__ import annotations

from datetime import date, timedelta

from ortools.sat.python import cp_model

from .models import Schedule, SolveRequest


def _resolve_days(req: SolveRequest) -> list[date]:
    if req.start_date is None or req.num_days is None:
        raise ValueError("start_date と num_days が必要です")
    return [req.start_date + timedelta(days=i) for i in range(req.num_days)]


def solve(req: SolveRequest) -> Schedule:
    days = _resolve_days(req)
    closed_wd = set(req.closed_weekdays)
    holidays = set(req.holidays)

    # 定休日・休業日は営業しない（誰も出勤しない）
    def is_closed(d: date) -> bool:
        return d.weekday() in closed_wd or d in holidays

    open_days = [d for d in days if not is_closed(d)]
    weekend = {d for d in days if d.weekday() >= 5}  # 土日（公平性 S1 用）

    pattern_ids = [p.id for p in req.patterns]
    pattern_min = {p.id: round(p.hours * 60) for p in req.patterns}
    late_ids = {p.id for p in req.patterns if p.is_late}
    _ = late_ids  # S2(遅番平準化)は v1 本実装で使用

    staff_by_id = {s.id: s for s in req.staff}

    def avail_of(s) -> set[str]:
        return set(s.avail_patterns) if s.avail_patterns is not None else set(pattern_ids)

    model = cp_model.CpModel()

    # --- 決定変数 x[s,d,p]（open_days のみ）---
    x: dict[tuple[str, str, str], cp_model.IntVar] = {}
    for s in req.staff:
        av = avail_of(s)
        for d in open_days:
            for p in pattern_ids:
                if p in av:
                    x[(s.id, d.isoformat(), p)] = model.NewBoolVar(
                        f"x_{s.id}_{d.isoformat()}_{p}"
                    )

    # 出勤フラグ y[s,d]（全 days。閉店日は 0 固定）
    y: dict[tuple[str, str], cp_model.IntVar] = {}
    for s in req.staff:
        for d in days:
            yv = model.NewBoolVar(f"y_{s.id}_{d.isoformat()}")
            terms = [x[(s.id, d.isoformat(), p)] for p in pattern_ids
                     if (s.id, d.isoformat(), p) in x]
            model.Add(yv == sum(terms))  # H0: 1日1パターン & y=sum_p x
            y[(s.id, d.isoformat())] = yv

    # ---------------- ハード制約 ----------------
    # H1 / H1': 役職別・スキル別の必要人数（営業日のみ）
    for d in open_days:
        for rank, need in req.requirements.by_rank.items():
            if need > 0:
                model.Add(sum(y[(s.id, d.isoformat())] for s in req.staff
                              if s.rank == rank) >= need)
        for skill, need in req.requirements.by_skill.items():
            if need > 0:
                model.Add(sum(y[(s.id, d.isoformat())] for s in req.staff
                              if skill in s.skills) >= need)

    # H2: 希望休
    for sid, d in req.off_requests:
        key = (sid, d.isoformat())
        if key in y:
            model.Add(y[key] == 0)

    # H3: 連勤上限
    c = req.max_consecutive
    for s in req.staff:
        for i in range(len(days) - c):
            window = days[i:i + c + 1]
            model.Add(sum(y[(s.id, d.isoformat())] for d in window) <= c)

    # H4b: 月間上限労働時間 / H4a: 週間上限労働時間
    weeks: dict[tuple[int, int], list[date]] = {}
    for d in open_days:
        iso = d.isocalendar()
        weeks.setdefault((iso[0], iso[1]), []).append(d)
    for s in req.staff:
        month_terms = [pattern_min[p] * x[(s.id, d.isoformat(), p)]
                       for d in open_days for p in pattern_ids
                       if (s.id, d.isoformat(), p) in x]
        if month_terms:
            model.Add(sum(month_terms) <= round(s.max_hours_month * 60))
        for _, wdays in weeks.items():
            week_terms = [pattern_min[p] * x[(s.id, d.isoformat(), p)]
                          for d in wdays for p in pattern_ids
                          if (s.id, d.isoformat(), p) in x]
            if week_terms:
                model.Add(sum(week_terms) <= round(s.max_hours_week * 60))

    # H4c: 公休日数 -> 出勤日数上限
    n_open = len(open_days)
    for s in req.staff:
        max_work = max(0, n_open - s.off_days_required)
        model.Add(sum(y[(s.id, d.isoformat())] for d in open_days) <= max_work)

    # H5: 店締め責任者を毎営業日1名以上（skill "closer"）
    closers = [s for s in req.staff if "closer" in s.skills]
    for d in open_days:
        if closers:
            model.Add(sum(y[(s.id, d.isoformat())] for s in closers) >= 1)

    # H6: ハードNGペア同時出勤禁止
    for a, b in req.pairs.ng_hard:
        for d in days:
            if (a, d.isoformat()) in y and (b, d.isoformat()) in y:
                model.Add(y[(a, d.isoformat())] + y[(b, d.isoformat())] <= 1)

    # ---------------- ソフト制約（目的項）----------------
    obj: list = []
    w = req.weights

    # S1: 土日出勤の range を最小化
    if weekend:
        a_vars = {}
        n_wk = len(weekend)
        for s in req.staff:
            av = model.NewIntVar(0, n_wk, f"wk_{s.id}")
            model.Add(av == sum(y[(s.id, d.isoformat())] for d in days if d in weekend))
            a_vars[s.id] = av
        hi = model.NewIntVar(0, n_wk, "wk_max")
        lo = model.NewIntVar(0, n_wk, "wk_min")
        for s in req.staff:
            model.Add(hi >= a_vars[s.id])
            model.Add(lo <= a_vars[s.id])
        rng = model.NewIntVar(0, n_wk, "wk_range")
        model.Add(rng == hi - lo)
        obj.append(-w.s1_weekend_range * rng)

    def pair_and(ya, yb, name):
        z = model.NewBoolVar(name)
        model.Add(z <= ya)
        model.Add(z <= yb)
        model.Add(z >= ya + yb - 1)
        return z

    # S5: ソフトNGペア同時出勤（減点）
    ng_zs = []
    for a, b in req.pairs.ng_soft:
        for d in days:
            ka, kb = (a, d.isoformat()), (b, d.isoformat())
            if ka in y and kb in y:
                z = pair_and(y[ka], y[kb], f"ng_{a}_{b}_{d.isoformat()}")
                obj.append(-w.s5_ng_soft * z)
                ng_zs.append(z)

    # S4: 推奨/OJTペア同時出勤（加点）
    rec_zs = []
    for a, b in req.pairs.recommend:
        for d in days:
            ka, kb = (a, d.isoformat()), (b, d.isoformat())
            if ka in y and kb in y:
                z = pair_and(y[ka], y[kb], f"rec_{a}_{b}_{d.isoformat()}")
                obj.append(w.s4_recommend * z)
                rec_zs.append(z)

    # S6: 希望勤務パターン一致（加点）
    want_lits = []
    for sid, d, p in req.want_requests:
        var = x.get((sid, d.isoformat(), p))
        if var is not None:
            obj.append(w.s6_want * var)
            want_lits.append(var)

    if obj:
        model.Maximize(sum(obj))

    # ---------------- 求解 ----------------
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = req.max_seconds
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)
    status_name = solver.StatusName(status)

    feasible = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)

    staff_out = []
    for s in req.staff:
        assignments: dict[str, str | None] = {}
        hours = 0.0
        wk = 0
        for d in days:
            chosen = None
            for p in pattern_ids:
                var = x.get((s.id, d.isoformat(), p))
                if var is not None and feasible and solver.Value(var) == 1:
                    chosen = p
                    hours += pattern_min[p] / 60.0
                    if d in weekend:
                        wk += 1
                    break
            assignments[d.isoformat()] = chosen
        staff_out.append({
            "id": s.id, "name": s.name, "rank": s.rank,
            "skills": sorted(s.skills), "assignments": assignments,
            "total_hours": round(hours, 1), "weekend_shifts": wk,
        })

    meta = {
        "source": "solver API (constraint-spec v0.1)",
        "status": status_name,
        "objective": solver.ObjectiveValue() if feasible and obj else None,
        "solve_time_s": round(solver.WallTime(), 4),
        "ng_soft_violations": sum(solver.Value(z) for z in ng_zs) if feasible else 0,
        "recommend_together": sum(solver.Value(z) for z in rec_zs) if feasible else 0,
        "want_met": sum(solver.Value(v) for v in want_lits) if feasible else 0,
    }
    days_out = [{"date": d.isoformat(), "weekday": d.weekday(),
                 "is_weekend": d in weekend} for d in days]
    patterns_out = [{"id": p.id, "label": p.label, "hours": p.hours,
                     "is_late": p.is_late} for p in req.patterns]

    return Schedule(meta=meta, patterns=patterns_out, days=days_out, staff=staff_out)
