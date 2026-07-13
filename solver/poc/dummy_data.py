"""制約仕様書 v0.1 の PoC 用ダミーデータ。

5名 × 14日規模の小規模インスタンスを、決定論的に（乱数を使わず）生成する。
本番では Pydantic 入力モデル + DB から供給する箇所を、ここではハードコードで代替している。
docs/constraint-spec.md の集合・パラメータに対応。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta


# 役職ランク（rank）
STYLIST = "stylist"
JUNIOR = "junior"
ASSISTANT = "assistant"

# 勤務パターン（P）: id -> (表示名, 実労働時間h(休憩控除後), 遅番か)
SHIFT_PATTERNS: dict[str, tuple[str, float, bool]] = {
    "early": ("早番 9:00-18:00", 8.0, False),
    "late": ("遅番 12:00-21:00", 8.0, True),
    "full": ("通し 9:00-21:00", 11.0, False),
    "short": ("時短 10:00-15:00", 5.0, False),
}
LATE_PATTERNS = {pid for pid, (_, _, is_late) in SHIFT_PATTERNS.items() if is_late}


@dataclass
class Staff:
    id: str
    name: str
    rank: str
    skills: set[str]              # 例: {"cut", "color", "closer"}
    max_hours_month: float
    max_hours_week: float
    off_days_required: int        # 月間公休日数
    popular: int = 0              # 指名の多さ 0..3（S3 用）
    avail_patterns: set[str] = field(default_factory=lambda: set(SHIFT_PATTERNS))

    def can_close(self) -> bool:
        return "closer" in self.skills


@dataclass
class Instance:
    days: list[date]
    staff: list[Staff]
    weekend_holidays: set[date]              # D^sun
    busy_days: set[date]                     # 繁忙日（S3 用）
    req_rank: dict[str, int]                 # rank -> 各営業日の最低人数
    req_skill: dict[str, int]                # skill -> 各営業日の最低人数
    off_requests: set[tuple[str, date]]      # (staff_id, day) 希望休
    want_requests: set[tuple[str, date, str]]  # (staff_id, day, pattern) 希望勤務
    pair_ng_soft: list[tuple[str, str]]      # ソフトNGペア
    pair_ng_hard: list[tuple[str, str]]      # ハードNGペア
    pair_recommend: list[tuple[str, str]]    # 推奨/OJTペア
    max_consecutive: int = 6                 # 連勤上限 C^max


def build_instance() -> Instance:
    """決定論的な 5名 × 14日 のダミーインスタンスを返す。"""
    start = date(2026, 8, 1)                 # 2026-08-01(土) 起点
    days = [start + timedelta(days=i) for i in range(14)]
    weekend = {d for d in days if d.weekday() >= 5}  # 土(5)・日(6)
    busy = set(weekend)                      # 簡易化：土日を繁忙日とみなす

    # off_days_required は本 PoC の対象期間（14日）内の公休日数。
    # 本番では月間公休日数を対象期間へ日割りして与える。
    staff = [
        Staff("s1", "佐藤(店長)", STYLIST, {"cut", "color", "perm", "closer"},
              max_hours_month=160, max_hours_week=40, off_days_required=4, popular=3),
        Staff("s2", "鈴木", STYLIST, {"cut", "color", "closer"},
              max_hours_month=160, max_hours_week=40, off_days_required=4, popular=2),
        Staff("s3", "高橋", JUNIOR, {"cut", "color", "shampoo"},
              max_hours_month=140, max_hours_week=36, off_days_required=5, popular=1),
        Staff("s4", "田中(パート)", ASSISTANT, {"shampoo", "reception"},
              max_hours_month=80, max_hours_week=24, off_days_required=8,
              avail_patterns={"early", "short"}),
        Staff("s5", "伊藤", ASSISTANT, {"shampoo", "reception", "color"},
              max_hours_month=150, max_hours_week=40, off_days_required=5),
    ]

    # 各営業日の最低人数（H1 / H1'）
    req_rank = {STYLIST: 1, JUNIOR: 0, ASSISTANT: 1}
    req_skill = {"closer": 1, "shampoo": 1}

    # 希望休（H2）: 田中は毎週水曜休み希望、伊藤は初週末
    off_requests: set[tuple[str, date]] = set()
    for d in days:
        if d.weekday() == 2:            # 水曜
            off_requests.add(("s4", d))
    off_requests.add(("s5", days[0]))    # 8/1
    off_requests.add(("s3", days[6]))    # 8/7

    # 希望勤務（S6）: 高橋は遅番希望、鈴木は早番希望を数日
    want_requests: set[tuple[str, date, str]] = set()
    for d in days[:5]:
        want_requests.add(("s3", d, "late"))
        want_requests.add(("s2", d, "early"))

    # ペア（相性マトリクス）
    pair_ng_soft = [("s2", "s3")]        # 鈴木×高橋 は避けたい（ソフト）
    pair_ng_hard = []                    # ハードNGは無し（PoC 既定）
    pair_recommend = [("s1", "s5")]      # 佐藤(教育担当)×伊藤(アシ) OJT

    return Instance(
        days=days,
        staff=staff,
        weekend_holidays=weekend,
        busy_days=busy,
        req_rank=req_rank,
        req_skill=req_skill,
        off_requests=off_requests,
        want_requests=want_requests,
        pair_ng_soft=pair_ng_soft,
        pair_ng_hard=pair_ng_hard,
        pair_recommend=pair_recommend,
        max_consecutive=6,
    )
