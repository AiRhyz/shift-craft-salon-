"""CP-SAT シフト求解エンジン（入力駆動）。

制約仕様書 v0.1 の H0–H6・S1–S7 を実装。制約番号はコメントに付す。
INFEASIBLE 時は主要ハード制約をスラック付きで緩和した診断モデルを解き直し、
違反が必要になった箇所（人数不足の日・希望休の衝突等）を特定して返す（仕様 §7）。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from ortools.sat.python import cp_model

from .models import Schedule, SolveRequest

RANK_JP = {"stylist": "スタイリスト", "junior": "ジュニア", "assistant": "アシスタント"}
SKILL_JP = {
    "cut": "カット", "color": "カラー", "perm": "パーマ",
    "shampoo": "シャンプー", "reception": "受付", "closer": "店締め",
}


@dataclass
class _Ctx:
    """モデルと変数群。relax=True のとき slacks に (変数, ラベル雛形) が入る。"""
    model: cp_model.CpModel
    x: dict[tuple[str, str, str], cp_model.IntVar]
    y: dict[tuple[str, str], cp_model.IntVar]
    days: list[date]
    open_days: list[date]
    weekend: set[date]
    slacks: list[tuple[cp_model.IntVar, str]] = field(default_factory=list)


def _resolve_days(req: SolveRequest) -> list[date]:
    if req.start_date is None or req.num_days is None:
        raise ValueError("start_date と num_days が必要です")
    return [req.start_date + timedelta(days=i) for i in range(req.num_days)]


def _build(req: SolveRequest, relax: bool) -> _Ctx:
    """決定変数とハード制約を構築する。

    relax=True では H1/H1'/H2/H4c/H5/H6 にスラック変数を導入し、
    「どの制約を破れば解が存在するか」を診断できるようにする。
    H0/H0'/H3/H4a/H4b は物理・法令制約として緩和しない
    （需要側スラックが人数不足として吸収するため診断は可能）。
    """
    days = _resolve_days(req)
    closed_wd = set(req.closed_weekdays)
    holidays = set(req.holidays)
    open_days = [d for d in days if d.weekday() not in closed_wd and d not in holidays]
    weekend = {d for d in days if d.weekday() >= 5}

    pattern_ids = [p.id for p in req.patterns]
    pattern_min = {p.id: round(p.hours * 60) for p in req.patterns}
    name_of = {s.id: s.name for s in req.staff}

    model = cp_model.CpModel()
    ctx = _Ctx(model=model, x={}, y={}, days=days, open_days=open_days,
               weekend=weekend)

    def slack(ub: int, name: str, label: str) -> cp_model.IntVar:
        v = model.NewIntVar(0, ub, name)
        ctx.slacks.append((v, label))
        return v

    # --- 決定変数 x[s,d,p]（営業日のみ）/ H0': 勤務可能パターンのみ ---
    for s in req.staff:
        av = set(s.avail_patterns) if s.avail_patterns is not None else set(pattern_ids)
        for d in open_days:
            for p in pattern_ids:
                if p in av:
                    ctx.x[(s.id, d.isoformat(), p)] = model.NewBoolVar(
                        f"x_{s.id}_{d.isoformat()}_{p}")

    # 出勤フラグ y / H0: 1日1パターン
    for s in req.staff:
        for d in days:
            yv = model.NewBoolVar(f"y_{s.id}_{d.isoformat()}")
            terms = [ctx.x[(s.id, d.isoformat(), p)] for p in pattern_ids
                     if (s.id, d.isoformat(), p) in ctx.x]
            model.Add(yv == sum(terms))
            ctx.y[(s.id, d.isoformat())] = yv

    # H1 / H1': 必要人数
    for d in open_days:
        for rank, need in req.requirements.by_rank.items():
            if need <= 0:
                continue
            total = sum(ctx.y[(s.id, d.isoformat())] for s in req.staff
                        if s.rank == rank)
            if relax:
                sv = slack(need, f"sl_rank_{rank}_{d.isoformat()}",
                           f"{d.isoformat()}: {RANK_JP.get(rank, rank)}が{{v}}名不足")
                model.Add(total + sv >= need)
            else:
                model.Add(total >= need)
        for skill, need in req.requirements.by_skill.items():
            if need <= 0:
                continue
            total = sum(ctx.y[(s.id, d.isoformat())] for s in req.staff
                        if skill in s.skills)
            if relax:
                sv = slack(need, f"sl_skill_{skill}_{d.isoformat()}",
                           f"{d.isoformat()}: {SKILL_JP.get(skill, skill)}要員が{{v}}名不足")
                model.Add(total + sv >= need)
            else:
                model.Add(total >= need)

    # H2: 希望休
    for sid, d in req.off_requests:
        key = (sid, d.isoformat())
        if key not in ctx.y:
            continue
        if relax:
            # y 自体を違反量として登録（1 なら希望休を破って出勤）
            ctx.slacks.append(
                (ctx.y[key],
                 f"{d.isoformat()}: {name_of.get(sid, sid)}の希望休と衝突（出勤が必要）"))
        else:
            model.Add(ctx.y[key] == 0)

    # H3: 連勤上限（緩和しない）
    c = req.max_consecutive
    for s in req.staff:
        for i in range(len(days) - c):
            window = days[i:i + c + 1]
            model.Add(sum(ctx.y[(s.id, d.isoformat())] for d in window) <= c)

    # H4a/H4b: 週・月の上限労働時間（緩和しない）
    weeks: dict[tuple[int, int], list[date]] = {}
    for d in open_days:
        iso = d.isocalendar()
        weeks.setdefault((iso[0], iso[1]), []).append(d)
    for s in req.staff:
        month_terms = [pattern_min[p] * ctx.x[(s.id, d.isoformat(), p)]
                       for d in open_days for p in pattern_ids
                       if (s.id, d.isoformat(), p) in ctx.x]
        if month_terms:
            model.Add(sum(month_terms) <= round(s.max_hours_month * 60))
        for _, wdays in weeks.items():
            week_terms = [pattern_min[p] * ctx.x[(s.id, d.isoformat(), p)]
                          for d in wdays for p in pattern_ids
                          if (s.id, d.isoformat(), p) in ctx.x]
            if week_terms:
                model.Add(sum(week_terms) <= round(s.max_hours_week * 60))

    # H4c: 公休日数
    n_open = len(open_days)
    for s in req.staff:
        max_work = max(0, n_open - s.off_days_required)
        total = sum(ctx.y[(s.id, d.isoformat())] for d in open_days)
        if relax:
            sv = slack(max(1, s.off_days_required),
                       f"sl_rest_{s.id}",
                       f"{s.name}: 公休{{v}}日分が確保できない（出勤日数超過が必要）")
            model.Add(total <= max_work + sv)
        else:
            model.Add(total <= max_work)

    # H5: 店締め責任者
    closers = [s for s in req.staff if "closer" in s.skills]
    for d in open_days:
        total = sum(ctx.y[(s.id, d.isoformat())] for s in closers)
        if relax:
            sv = slack(1, f"sl_closer_{d.isoformat()}",
                       f"{d.isoformat()}: 店締め責任者を配置できない")
            model.Add(total + sv >= 1)
        else:
            if closers:
                model.Add(total >= 1)
            # closers が 0 名なら relax 側で全日不足として検出される

    # H6: ハードNGペア
    for a, b in req.pairs.ng_hard:
        for d in days:
            ka, kb = (a, d.isoformat()), (b, d.isoformat())
            if ka in ctx.y and kb in ctx.y:
                if relax:
                    sv = slack(1, f"sl_ng_{a}_{b}_{d.isoformat()}",
                               f"{d.isoformat()}: ハードNGペア"
                               f"({name_of.get(a, a)}×{name_of.get(b, b)})の同時出勤が必要")
                    model.Add(ctx.y[ka] + ctx.y[kb] <= 1 + sv)
                else:
                    model.Add(ctx.y[ka] + ctx.y[kb] <= 1)

    return ctx


def _diagnose(req: SolveRequest) -> list[str]:
    """緩和モデルを最小違反で解き、破らざるを得なかった制約を列挙する。"""
    ctx = _build(req, relax=True)
    ctx.model.Minimize(sum(v for v, _ in ctx.slacks))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = min(req.max_seconds, 5.0)
    solver.parameters.num_search_workers = 8
    status = solver.Solve(ctx.model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return ["制約が複雑に競合しており、原因を自動特定できませんでした。"
                "必要人数・上限労働時間・連勤上限を見直してください。"]
    causes = []
    for v, label in ctx.slacks:
        val = solver.Value(v)
        if val > 0:
            causes.append(label.replace("{v}", str(val)))
    if not causes:
        causes.append("緩和モデルでは解が存在します。連勤上限・労働時間上限との"
                      "組み合わせが原因の可能性があります。")
    return causes[:20]  # 表示過多を防ぐ


def solve(req: SolveRequest) -> Schedule:
    ctx = _build(req, relax=False)
    model, x, y = ctx.model, ctx.x, ctx.y
    days, open_days, weekend = ctx.days, ctx.open_days, ctx.weekend
    pattern_ids = [p.id for p in req.patterns]
    pattern_min = {p.id: round(p.hours * 60) for p in req.patterns}
    late_ids = {p.id for p in req.patterns if p.is_late}

    # ---------------- ソフト制約（目的項）----------------
    obj: list = []
    w = req.weights

    def count_range(count_of, ub: int, prefix: str):
        """スタッフ間の回数 range（max-min）変数を作る。"""
        vs = {}
        for s in req.staff:
            av = model.NewIntVar(0, ub, f"{prefix}_{s.id}")
            model.Add(av == count_of(s))
            vs[s.id] = av
        hi = model.NewIntVar(0, ub, f"{prefix}_max")
        lo = model.NewIntVar(0, ub, f"{prefix}_min")
        for s in req.staff:
            model.Add(hi >= vs[s.id])
            model.Add(lo <= vs[s.id])
        rng = model.NewIntVar(0, ub, f"{prefix}_range")
        model.Add(rng == hi - lo)
        return rng

    # S1: 土日出勤の平準化
    if weekend and len(req.staff) > 1:
        rng = count_range(
            lambda s: sum(y[(s.id, d.isoformat())] for d in days if d in weekend),
            len(weekend), "wk")
        obj.append(-w.s1_weekend_range * rng)

    # S2: 遅番回数の平準化
    if late_ids and len(req.staff) > 1:
        rng = count_range(
            lambda s: sum(x[(s.id, d.isoformat(), p)] for d in open_days
                          for p in late_ids if (s.id, d.isoformat(), p) in x),
            len(open_days), "late")
        obj.append(-w.s2_late_range * rng)

    # S3: 指名の多いスタッフを繁忙日（v1: 土日）へ優先配置
    for s in req.staff:
        if s.popular > 0:
            for d in open_days:
                if d in weekend:
                    obj.append(w.s3_busy_popular * s.popular * y[(s.id, d.isoformat())])

    def pair_and(ya, yb, name):
        z = model.NewBoolVar(name)
        model.Add(z <= ya)
        model.Add(z <= yb)
        model.Add(z >= ya + yb - 1)
        return z

    # S5: ソフトNGペア（減点）
    ng_zs = []
    for a, b in req.pairs.ng_soft:
        for d in days:
            ka, kb = (a, d.isoformat()), (b, d.isoformat())
            if ka in y and kb in y:
                z = pair_and(y[ka], y[kb], f"ng_{a}_{b}_{d.isoformat()}")
                obj.append(-w.s5_ng_soft * z)
                ng_zs.append(z)

    # S4: 推奨/OJTペア（加点）
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

    # S7: 人件費の予算内収束（予算超過を千円単位で減点）
    wage_by_staff = {s.id: s.hourly_wage for s in req.staff}
    cost_terms = []
    for (sid, diso, p), var in x.items():
        wage = wage_by_staff.get(sid, 0)
        if wage > 0:
            cost_terms.append(round(wage * pattern_min[p] / 60) * var)
    if req.budget_yen is not None and cost_terms:
        cost = model.NewIntVar(0, 10 ** 9, "cost")
        model.Add(cost == sum(cost_terms))
        over = model.NewIntVar(0, 10 ** 9, "over_budget")
        model.Add(over >= cost - req.budget_yen)
        over_k = model.NewIntVar(0, 10 ** 6, "over_budget_k")
        model.AddDivisionEquality(over_k, over, 1000)
        obj.append(-w.s7_over_budget * over_k)

    if obj:
        model.Maximize(sum(obj))

    # ---------------- 求解 ----------------
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = req.max_seconds
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)
    status_name = solver.StatusName(status)
    feasible = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)

    # INFEASIBLE なら原因診断（仕様 §7）
    diagnosis = _diagnose(req) if status == cp_model.INFEASIBLE else None

    staff_out = []
    total_cost = 0.0
    has_wage = any(s.hourly_wage > 0 for s in req.staff)
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
        total_cost += hours * s.hourly_wage
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
        "estimated_cost_yen": round(total_cost) if (feasible and has_wage) else None,
        "diagnosis": diagnosis,
    }
    days_out = [{"date": d.isoformat(), "weekday": d.weekday(),
                 "is_weekend": d in weekend} for d in days]
    patterns_out = [{"id": p.id, "label": p.label, "hours": p.hours,
                     "is_late": p.is_late} for p in req.patterns]

    return Schedule(meta=meta, patterns=patterns_out, days=days_out, staff=staff_out)
