"""PoC の求解結果を JSON で書き出す。

frontend が solver 未接続でもサンプルシフトを表示できるよう、実際の CP-SAT 解を
JSON 化して frontend に同梱するために使う。

使い方:
    cd solver && python -m poc.export_json > ../frontend/lib/sample-schedule.json
"""
from __future__ import annotations

import json
import sys

from .dummy_data import SHIFT_PATTERNS, build_instance
from .shift_model import build_and_solve


def to_dict() -> dict:
    inst = build_instance()
    sol = build_and_solve(inst, max_seconds=10.0)

    patterns = [
        {"id": pid, "label": name, "hours": hours, "is_late": is_late}
        for pid, (name, hours, is_late) in SHIFT_PATTERNS.items()
    ]
    days = [
        {"date": d.isoformat(), "weekday": d.weekday(),
         "is_weekend": d in inst.weekend_holidays}
        for d in inst.days
    ]
    staff = []
    for s in inst.staff:
        assignments = {
            d.isoformat(): sol.assign.get((s.id, d.isoformat()))
            for d in inst.days
        }
        staff.append({
            "id": s.id,
            "name": s.name,
            "rank": s.rank,
            "skills": sorted(s.skills),
            "assignments": assignments,
            "total_hours": round(sol.per_staff_hours.get(s.id, 0.0), 1),
            "weekend_shifts": sol.per_staff_weekend.get(s.id, 0),
        })

    return {
        "meta": {
            "source": "solver/poc (constraint-spec v0.1)",
            "status": sol.status,
            "objective": sol.objective,
            "solve_time_s": round(sol.solve_time_s, 4),
            "ng_soft_violations": sol.ng_soft_violations,
            "recommend_together": sol.recommend_together,
            "want_met": sol.want_met,
        },
        "patterns": patterns,
        "days": days,
        "staff": staff,
    }


if __name__ == "__main__":
    json.dump(to_dict(), sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
