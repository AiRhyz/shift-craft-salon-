"""CP-SAT シフト求解エンジン（入力駆動）。

制約仕様書 v0.1 の H0–H7・S1–S7 を実装。3つのモードで動く:

- strict     : 全ハード制約を遵守（通常求解）
- besteffort : strict が INFEASIBLE のとき自動発動。公休・希望休・連勤・労働時間など
               スタッフ側の条約は死守したまま、必要人数（H1/H1'/H5）のみ緩和し、
               不足人日を最小化したシフトを返す。不足は日別に shortage として報告
- diagnose   : 原因診断用。主要ハード制約すべてにスラックを張り、最小違反解から
               「どの制約を破らないと成立しないか」を列挙する（仕様 §7）
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

# besteffort での不足1人日あたりの減点。全ソフト制約を確実に支配する大きさ
SHORTAGE_PENALTY = 1000


@dataclass
class _Slack:
    var: cp_model.IntVar
    day: str | None      # 対象日(ISO)。日単位でない違反(公休不足等)は None
    short: str           # 日別表示用 例: "アシスタント{v}名不足"
    full: str            # 診断リスト用 例: "2026-08-03: アシスタントが{v}名不足"
    kind: str = "other"  # rank / skill / other（不足人数の重複補正用）


@dataclass
class _Ctx:
    model: cp_model.CpModel
    x: dict[tuple[str, str, str], cp_model.IntVar]
    y: dict[tuple[str, str], cp_model.IntVar]
    days: list[date]
    open_days: list[date]
    weekend: set[date]
    slacks: list[_Slack] = field(default_factory=list)


def _resolve_days(req: SolveRequest) -> list[date]:
    if req.start_date is None or req.num_days is None:
        raise ValueError("start_date と num_days が必要です")
    return [req.start_date + timedelta(days=i) for i in range(req.num_days)]


def _build(req: SolveRequest, mode: str) -> _Ctx:
    """決定変数とハード制約を構築する。

    - demand側(H1/H1'/H5)のスラック: besteffort / diagnose で有効
    - staff側(H2/H4c/H6)のスラック: diagnose のみ有効
    - H0/H0'/H3/H4a/H4b は常にハード（物理・法令制約）
    """
    demand_slack = mode in ("besteffort", "diagnose")
    staff_slack = mode == "diagnose"

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

    def add_slack(ub: int, name: str, day: str | None, short: str, full: str,
                  kind: str = "other"):
        v = model.NewIntVar(0, ub, name)
        ctx.slacks.append(_Slack(var=v, day=day, short=short, full=full, kind=kind))
        return v

    # --- 決定変数 x[s,d,p]（営業日のみ）/ H0': 勤務可能パターンのみ ---
    for s in req.staff:
        av = set(s.avail_patterns) if s.avail_patterns is not None else set(pattern_ids)
        na_wd = set(s.unavailable_weekdays)
        for d in open_days:
            if d.weekday() in na_wd:      # 勤務不可曜日（H0' 相当）
                continue
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

    # H1 / H1': 必要人数（曜日別上書きに対応）
    for d in open_days:
        diso = d.isoformat()
        day_req = req.requirements.for_weekday(d.weekday())
        for rank, need in day_req.by_rank.items():
            if need <= 0:
                continue
            total = sum(ctx.y[(s.id, diso)] for s in req.staff if s.rank == rank)
            if demand_slack:
                jp = RANK_JP.get(rank, rank)
                sv = add_slack(need, f"sl_rank_{rank}_{diso}", diso,
                               f"{jp}{{v}}名不足", f"{diso}: {jp}が{{v}}名不足",
                               kind="rank")
                model.Add(total + sv >= need)
            else:
                model.Add(total >= need)
        for skill, need in day_req.by_skill.items():
            if need <= 0:
                continue
            total = sum(ctx.y[(s.id, diso)] for s in req.staff if skill in s.skills)
            if demand_slack:
                jp = SKILL_JP.get(skill, skill)
                sv = add_slack(need, f"sl_skill_{skill}_{diso}", diso,
                               f"{jp}要員{{v}}名不足", f"{diso}: {jp}要員が{{v}}名不足",
                               kind="skill")
                model.Add(total + sv >= need)
            else:
                model.Add(total >= need)

    # H8(v1.5): 営業時間カバー — 営業中の各時間帯に最低 coverage_min 名を配置
    cov = req.requirements.coverage_min
    if cov > 0 and req.store_open and req.store_close:
        def _tmin(t: str) -> int:
            h, m = t.split(":")
            return int(h) * 60 + int(m)

        o, cl = _tmin(req.store_open), _tmin(req.store_close)
        pat_span = {p.id: (_tmin(p.start), _tmin(p.end))
                    for p in req.patterns if p.start and p.end}
        if pat_span and cl > o:
            # パターン境界で営業時間を区間に分割し、区間ごとに在店人数を数える
            pts = sorted({o, cl,
                          *[min(cl, max(o, s)) for s, _ in pat_span.values()],
                          *[min(cl, max(o, e)) for _, e in pat_span.values()]})
            intervals = [(a, b) for a, b in zip(pts, pts[1:]) if b > a]
            for d in open_days:
                diso = d.isoformat()
                for a, b in intervals:
                    covering = [pid for pid, (s, e) in pat_span.items()
                                if s <= a and e >= b]
                    vars_ = [ctx.x[(s.id, diso, pid)] for s in req.staff
                             for pid in covering if (s.id, diso, pid) in ctx.x]
                    tv = model.NewIntVar(0, len(req.staff), f"cov_{diso}_{a}")
                    model.Add(tv == sum(vars_))
                    label = f"{a//60:02d}:{a%60:02d}-{b//60:02d}:{b%60:02d}"
                    if demand_slack:
                        sv = add_slack(cov, f"sl_cov_{diso}_{a}", diso,
                                       f"{label} 在店{{v}}名不足",
                                       f"{diso}: {label} の在店が{{v}}名不足",
                                       kind="coverage")
                        model.Add(tv + sv >= cov)
                    else:
                        model.Add(tv >= cov)

    # H2: 希望休（besteffort でも死守）
    for sid, d in req.off_requests:
        key = (sid, d.isoformat())
        if key not in ctx.y:
            continue
        if staff_slack:
            ctx.slacks.append(_Slack(
                var=ctx.y[key], day=d.isoformat(),
                short=f"{name_of.get(sid, sid)}の希望休と衝突",
                full=f"{d.isoformat()}: {name_of.get(sid, sid)}の希望休と衝突（出勤が必要）"))
        else:
            model.Add(ctx.y[key] == 0)

    # H3: 連勤上限（常にハード）
    c = req.max_consecutive
    for s in req.staff:
        for i in range(len(days) - c):
            window = days[i:i + c + 1]
            model.Add(sum(ctx.y[(s.id, d.isoformat())] for d in window) <= c)

    # H4a/H4b: 週・月の上限労働時間（常にハード）
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

    # H4c: 公休日数（besteffort でも死守）
    n_open = len(open_days)
    for s in req.staff:
        max_work = max(0, n_open - s.off_days_required)
        total = sum(ctx.y[(s.id, d.isoformat())] for d in open_days)
        if staff_slack:
            sv = add_slack(max(1, s.off_days_required), f"sl_rest_{s.id}", None,
                           f"{s.name}の公休{{v}}日不足",
                           f"{s.name}: 公休{{v}}日分が確保できない（出勤日数超過が必要）")
            model.Add(total <= max_work + sv)
        else:
            model.Add(total <= max_work)

    # H5: 店締め責任者。by_skill に closer 要件があれば H1' と重複するため
    # スラックは作るが報告リストには載せない（ダブルカウント防止）
    closer_in_skill = req.requirements.by_skill.get("closer", 0) >= 1
    closers = [s for s in req.staff if "closer" in s.skills]
    for d in open_days:
        diso = d.isoformat()
        total = sum(ctx.y[(s.id, diso)] for s in closers)
        if demand_slack:
            if closer_in_skill:
                sv = model.NewIntVar(0, 1, f"sl_closer_{diso}")  # 未報告スラック
            else:
                sv = add_slack(1, f"sl_closer_{diso}", diso,
                               "店締め責任者不在",
                               f"{diso}: 店締め責任者を配置できない", kind="skill")
            model.Add(total + sv >= 1)
        else:
            if closers:
                model.Add(total >= 1)

    # H6: ハードNGペア（besteffort でも死守）
    for a, b in req.pairs.ng_hard:
        for d in days:
            ka, kb = (a, d.isoformat()), (b, d.isoformat())
            if ka in ctx.y and kb in ctx.y:
                if staff_slack:
                    sv = add_slack(1, f"sl_ng_{a}_{b}_{d.isoformat()}", d.isoformat(),
                                   "ハードNGペア同時出勤",
                                   f"{d.isoformat()}: ハードNGペア"
                                   f"({name_of.get(a, a)}×{name_of.get(b, b)})の同時出勤が必要")
                    model.Add(ctx.y[ka] + ctx.y[kb] <= 1 + sv)
                else:
                    model.Add(ctx.y[ka] + ctx.y[kb] <= 1)

    return ctx


def _add_soft_terms(ctx: _Ctx, req: SolveRequest):
    """ソフト制約 S1–S7 の目的項を構築する。"""
    model, x, y = ctx.model, ctx.x, ctx.y
    days, open_days, weekend = ctx.days, ctx.open_days, ctx.weekend
    pattern_min = {p.id: round(p.hours * 60) for p in req.patterns}
    w = req.weights
    obj: list = []

    def count_range(count_of, ub: int, prefix: str):
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

    # S2(一般化): 「回数を平準化」フラグ付きパターンごとに担当回数の偏りを最小化
    # balance 未指定の旧入力は is_late を踏襲（遅番のみ平準化）
    balanced = [p for p in req.patterns
                if (p.balance if p.balance is not None else p.is_late)]
    if len(req.staff) > 1:
        for bp in balanced:
            rng = count_range(
                lambda s, pid=bp.id: sum(
                    x[(s.id, d.isoformat(), pid)] for d in open_days
                    if (s.id, d.isoformat(), pid) in x),
                len(open_days), f"bal_{bp.id}")
            obj.append(-w.s2_balance * rng)

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

    # S5 / S4: 相性ペア
    ng_zs = []
    for a, b in req.pairs.ng_soft:
        for d in days:
            ka, kb = (a, d.isoformat()), (b, d.isoformat())
            if ka in y and kb in y:
                z = pair_and(y[ka], y[kb], f"ng_{a}_{b}_{d.isoformat()}")
                obj.append(-w.s5_ng_soft * z)
                ng_zs.append(z)
    caution_zs = []
    for a, b in req.pairs.caution:
        for d in days:
            ka, kb = (a, d.isoformat()), (b, d.isoformat())
            if ka in y and kb in y:
                z = pair_and(y[ka], y[kb], f"ca_{a}_{b}_{d.isoformat()}")
                obj.append(-w.s5_caution * z)
                caution_zs.append(z)
    rec_zs = []
    for a, b in req.pairs.recommend:
        for d in days:
            ka, kb = (a, d.isoformat()), (b, d.isoformat())
            if ka in y and kb in y:
                z = pair_and(y[ka], y[kb], f"rec_{a}_{b}_{d.isoformat()}")
                obj.append(w.s4_recommend * z)
                rec_zs.append(z)

    # S6: 希望勤務パターン一致
    want_lits = []
    for sid, d, p in req.want_requests:
        var = x.get((sid, d.isoformat(), p))
        if var is not None:
            obj.append(w.s6_want * var)
            want_lits.append(var)

    # S7: 人件費の予算内収束
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

    return obj, ng_zs, caution_zs, rec_zs, want_lits


def _run(req: SolveRequest, mode: str) -> Schedule:
    """指定モードで求解し Schedule を返す。"""
    ctx = _build(req, mode)
    model = ctx.model
    obj, ng_zs, caution_zs, rec_zs, want_lits = _add_soft_terms(ctx, req)

    # besteffort: 不足人日の最小化を最優先（大きな減点で支配させる）
    if mode == "besteffort" and ctx.slacks:
        obj = obj + [-SHORTAGE_PENALTY * sl.var for sl in ctx.slacks]

    if obj:
        model.Maximize(sum(obj))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = req.max_seconds
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)
    status_name = solver.StatusName(status)
    feasible = status in (cp_model.OPTIMAL, cp_model.FEASIBLE)

    pattern_ids = [p.id for p in req.patterns]
    pattern_min = {p.id: round(p.hours * 60) for p in req.patterns}

    # 日別の不足（besteffort のみ値が入る）
    shortage_by_day: dict[str, int] = {}
    detail_by_day: dict[str, list[str]] = {}
    if feasible and mode == "besteffort":
        # 「最低何人の応援が必要か」= 役職不足の合計 と スキル不足の最大値 の大きい方
        # （1人が複数スキルを兼ねられるため、スキル系は合算せず最大で見る）
        rank_sum: dict[str, int] = {}
        skill_max: dict[str, int] = {}
        for sl in ctx.slacks:
            val = solver.Value(sl.var)
            if val <= 0 or sl.day is None:
                continue
            detail_by_day.setdefault(sl.day, []).append(
                sl.short.replace("{v}", str(val)))
            if sl.kind == "rank":
                rank_sum[sl.day] = rank_sum.get(sl.day, 0) + val
            else:
                skill_max[sl.day] = max(skill_max.get(sl.day, 0), val)
        for day in set(rank_sum) | set(skill_max):
            shortage_by_day[day] = max(rank_sum.get(day, 0), skill_max.get(day, 0))

    staff_out = []
    total_cost = 0.0
    has_wage = any(s.hourly_wage > 0 for s in req.staff)
    for s in req.staff:
        assignments: dict[str, str | None] = {}
        hours = 0.0
        wk = 0
        for d in ctx.days:
            chosen = None
            for p in pattern_ids:
                var = ctx.x.get((s.id, d.isoformat(), p))
                if var is not None and feasible and solver.Value(var) == 1:
                    chosen = p
                    hours += pattern_min[p] / 60.0
                    if d in ctx.weekend:
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
        "caution_violations": sum(solver.Value(z) for z in caution_zs) if feasible else 0,
        "recommend_together": sum(solver.Value(z) for z in rec_zs) if feasible else 0,
        "want_met": sum(solver.Value(v) for v in want_lits) if feasible else 0,
        "estimated_cost_yen": round(total_cost) if (feasible and has_wage) else None,
        "diagnosis": None,
        "shortage_total": sum(shortage_by_day.values()),
        "store_open": req.store_open,
        "store_close": req.store_close,
    }
    days_out = [{
        "date": d.isoformat(), "weekday": d.weekday(),
        "is_weekend": d in ctx.weekend,
        "shortage": shortage_by_day.get(d.isoformat(), 0),
        "shortage_detail": detail_by_day.get(d.isoformat(), []),
    } for d in ctx.days]
    patterns_out = [{"id": p.id, "label": p.label, "hours": p.hours,
                     "is_late": p.is_late, "start": p.start, "end": p.end,
                     "break_min": p.break_min} for p in req.patterns]

    return Schedule(meta=meta, patterns=patterns_out, days=days_out, staff=staff_out)


def _diagnose(req: SolveRequest) -> list[str]:
    """緩和モデルを最小違反で解き、破らざるを得なかった制約を列挙する。"""
    ctx = _build(req, "diagnose")
    ctx.model.Minimize(sum(sl.var for sl in ctx.slacks))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = min(req.max_seconds, 5.0)
    solver.parameters.num_search_workers = 8
    status = solver.Solve(ctx.model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return ["制約が複雑に競合しており、原因を自動特定できませんでした。"
                "必要人数・上限労働時間・連勤上限を見直してください。"]
    causes = []
    for sl in ctx.slacks:
        val = solver.Value(sl.var)
        if val > 0:
            causes.append(sl.full.replace("{v}", str(val)))
    if not causes:
        causes.append("緩和モデルでは解が存在します。連勤上限・労働時間上限との"
                      "組み合わせが原因の可能性があります。")
    return causes[:20]


def solve(req: SolveRequest) -> Schedule:
    """通常求解 → INFEASIBLE なら診断＋ベストエフォート生成に自動フォールバック。"""
    sched = _run(req, "strict")
    if sched.meta.status != "INFEASIBLE":
        return sched

    diagnosis = _diagnose(req)
    best = _run(req, "besteffort")
    if best.meta.status in ("OPTIMAL", "FEASIBLE"):
        # 公休等は守った上で人員不足を許容した解
        best.meta.status = "BEST_EFFORT"
        best.meta.diagnosis = diagnosis
        return best

    # スタッフ側条件だけでも矛盾している（公休 > 営業日数 等）
    sched.meta.diagnosis = diagnosis
    return sched
