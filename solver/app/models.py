"""solver API の入出力スキーマ（Pydantic v2）。

frontend/lib/types.ts と一対一で対応させる。制約仕様書 v0.1 のパラメータに準拠。
"""
from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


# ----------------------------- 入力 -----------------------------

class PatternIn(BaseModel):
    id: str
    label: str
    hours: float = Field(gt=0, description="休憩控除後の実労働時間")
    is_late: bool = False


class StaffIn(BaseModel):
    id: str
    name: str
    rank: str
    skills: list[str] = Field(default_factory=list)
    max_hours_month: float = 200
    max_hours_week: float = 40
    off_days_required: int = 0
    popular: int = 0
    avail_patterns: list[str] | None = None  # None = 全パターン可


class RequirementsIn(BaseModel):
    """各営業日に必要な最低人数（v1 は全営業日一律）。"""
    by_rank: dict[str, int] = Field(default_factory=dict)
    by_skill: dict[str, int] = Field(default_factory=dict)


class PairsIn(BaseModel):
    ng_soft: list[tuple[str, str]] = Field(default_factory=list)
    ng_hard: list[tuple[str, str]] = Field(default_factory=list)
    recommend: list[tuple[str, str]] = Field(default_factory=list)


class WeightsIn(BaseModel):
    s1_weekend_range: int = 8
    s5_ng_soft: int = 10
    s4_recommend: int = 4
    s6_want: int = 3


class SolveRequest(BaseModel):
    """シフト求解リクエスト。

    days は明示指定 or 期間指定のどちらか。両方未指定ならデモ既定を使う
    （main 側で demo_request を代入）。
    """
    start_date: date | None = None
    num_days: int | None = None
    holidays: list[date] = Field(default_factory=list)   # 追加の休業/祝日
    closed_weekdays: list[int] = Field(default_factory=list)  # 定休日(0=月..6=日)

    patterns: list[PatternIn]
    staff: list[StaffIn]
    requirements: RequirementsIn = Field(default_factory=RequirementsIn)
    off_requests: list[tuple[str, date]] = Field(default_factory=list)
    want_requests: list[tuple[str, date, str]] = Field(default_factory=list)
    pairs: PairsIn = Field(default_factory=PairsIn)
    weights: WeightsIn = Field(default_factory=WeightsIn)
    max_consecutive: int = 6
    max_seconds: float = 10.0


# ----------------------------- 出力 -----------------------------

class PatternOut(BaseModel):
    id: str
    label: str
    hours: float
    is_late: bool


class DayOut(BaseModel):
    date: str
    weekday: int
    is_weekend: bool


class StaffOut(BaseModel):
    id: str
    name: str
    rank: str
    skills: list[str]
    assignments: dict[str, str | None]
    total_hours: float
    weekend_shifts: int


class MetaOut(BaseModel):
    source: str
    status: str
    objective: float | None
    solve_time_s: float
    ng_soft_violations: int
    recommend_together: int
    want_met: int


class Schedule(BaseModel):
    meta: MetaOut
    patterns: list[PatternOut]
    days: list[DayOut]
    staff: list[StaffOut]
