"""デモ用の SolveRequest。PoC のダミーデータ（5名×14日）と等価。

/solve をボディ無しで叩いたとき、または /solve/demo で使う。frontend の
同梱サンプル（sample-schedule.json）と同じ解が得られる。
"""
from __future__ import annotations

from datetime import date

from .models import (
    PairsIn,
    PatternIn,
    RequirementsIn,
    SolveRequest,
    StaffIn,
)


def demo_request() -> SolveRequest:
    start = date(2026, 8, 1)  # 土曜起点
    days = [start.fromordinal(start.toordinal() + i) for i in range(14)]

    patterns = [
        PatternIn(id="early", label="早番 9:00-18:00", hours=8.0, is_late=False),
        PatternIn(id="late", label="遅番 12:00-21:00", hours=8.0, is_late=True),
        PatternIn(id="full", label="通し 9:00-21:00", hours=11.0, is_late=False),
        PatternIn(id="short", label="時短 10:00-15:00", hours=5.0, is_late=False),
    ]

    staff = [
        StaffIn(id="s1", name="佐藤(店長)", rank="stylist",
                skills=["cut", "color", "perm", "closer"],
                max_hours_month=160, max_hours_week=40, off_days_required=4, hourly_wage=2000, popular=3),
        StaffIn(id="s2", name="鈴木", rank="stylist",
                skills=["cut", "color", "closer"],
                max_hours_month=160, max_hours_week=40, off_days_required=4, hourly_wage=1800, popular=2),
        StaffIn(id="s3", name="高橋", rank="junior",
                skills=["cut", "color", "shampoo"],
                max_hours_month=140, max_hours_week=36, off_days_required=5, hourly_wage=1400, popular=1),
        StaffIn(id="s4", name="田中(パート)", rank="assistant",
                skills=["shampoo", "reception"],
                max_hours_month=80, max_hours_week=24, off_days_required=8, hourly_wage=1150,
                avail_patterns=["early", "short"]),
        StaffIn(id="s5", name="伊藤", rank="assistant",
                skills=["shampoo", "reception", "color"],
                max_hours_month=150, max_hours_week=40, off_days_required=5, hourly_wage=1200),
    ]

    requirements = RequirementsIn(
        by_rank={"stylist": 1, "assistant": 1},
        by_skill={"closer": 1, "shampoo": 1},
    )

    off_requests: list[tuple[str, date]] = []
    for d in days:
        if d.weekday() == 2:  # 水曜は田中休み
            off_requests.append(("s4", d))
    off_requests.append(("s5", days[0]))
    off_requests.append(("s3", days[6]))

    want_requests: list[tuple[str, date, str]] = []
    for d in days[:5]:
        want_requests.append(("s3", d, "late"))
        want_requests.append(("s2", d, "early"))

    pairs = PairsIn(
        ng_soft=[("s2", "s3")],
        ng_hard=[],
        recommend=[("s1", "s5")],
    )

    return SolveRequest(
        start_date=start,
        num_days=14,
        patterns=patterns,
        staff=staff,
        requirements=requirements,
        off_requests=off_requests,
        want_requests=want_requests,
        pairs=pairs,
        max_consecutive=6,
    )
