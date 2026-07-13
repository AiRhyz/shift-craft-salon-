"use client";

// シフト作成の入力設定エディタ（マスタ管理・希望収集の v1）。
// 店舗設定・勤務パターン・スタッフ・必要人数(曜日別)・相性ペア・希望休/希望勤務を編集する。

import type {
  DayRequirements,
  PairKind,
  PatternConfig,
  PlanConfig,
  StaffConfig,
} from "@/lib/planConfig";
import {
  RANKS,
  SKILLS,
  WEEKDAYS_JP,
  applyMonth,
  daysInMonth,
  patternHours,
  patternWarning,
} from "@/lib/planConfig";
import { useState } from "react";

function Section({
  title,
  children,
  hint,
}: {
  title: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

const inputCls =
  "w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-brand focus:outline-none";
const numCls = `${inputCls} text-right tabular-nums`;

type Props = { config: PlanConfig; onChange: (c: PlanConfig) => void };

// ---------------------------------------------------------------- 店舗・期間

function StoreEditor({ config, onChange }: Props) {
  const [holidayInput, setHolidayInput] = useState("");

  const toggleClosed = (wd: number) => {
    const cur = config.closed_weekdays;
    onChange({
      ...config,
      closed_weekdays: cur.includes(wd)
        ? cur.filter((x) => x !== wd)
        : [...cur, wd],
    });
  };

  const addHoliday = () => {
    if (!holidayInput || config.holidays.includes(holidayInput)) return;
    onChange({
      ...config,
      holidays: [...config.holidays, holidayInput].sort(),
    });
    setHolidayInput("");
  };

  const removeHoliday = (d: string) =>
    onChange({
      ...config,
      holidays: config.holidays.filter((x) => x !== d),
    });

  return (
    <Section title="店舗設定・対象期間">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <div>
          <label className="text-[11px] text-slate-500">営業開始</label>
          <input
            type="time"
            className={inputCls}
            value={config.store_open}
            onChange={(e) => onChange({ ...config, store_open: e.target.value })}
          />
        </div>
        <div>
          <label className="text-[11px] text-slate-500">営業終了</label>
          <input
            type="time"
            className={inputCls}
            value={config.store_close}
            onChange={(e) => onChange({ ...config, store_close: e.target.value })}
          />
        </div>
        <div>
          <label className="text-[11px] text-slate-500">対象月</label>
          <input
            type="month"
            className={inputCls}
            value={config.start_date.slice(0, 7)}
            onChange={(e) => {
              if (e.target.value) onChange(applyMonth(config, e.target.value));
            }}
          />
          <div className="mt-0.5 text-[10px] text-slate-400">
            1日〜{daysInMonth(config.start_date.slice(0, 7))}日（
            {config.num_days}日間）で作成
          </div>
        </div>
        <div>
          <label className="text-[11px] text-slate-500">連勤上限</label>
          <input
            type="number"
            min={1}
            max={13}
            className={numCls}
            value={config.max_consecutive}
            onChange={(e) =>
              onChange({
                ...config,
                max_consecutive: Math.max(1, Number(e.target.value) || 6),
              })
            }
          />
        </div>
        <div>
          <label className="text-[11px] text-slate-500">
            人件費予算(円・空欄=無制限)
          </label>
          <input
            type="number"
            min={0}
            step={10000}
            className={numCls}
            placeholder="例: 300000"
            value={config.budget_yen ?? ""}
            onChange={(e) =>
              onChange({
                ...config,
                budget_yen:
                  e.target.value === "" ? null : Number(e.target.value) || 0,
              })
            }
          />
        </div>
        <div>
          <label className="text-[11px] text-slate-500">定休日</label>
          <div className="mt-1 flex gap-1.5">
            {WEEKDAYS_JP.map((w, i) => (
              <label key={i} className="inline-flex items-center gap-0.5 text-xs">
                <input
                  type="checkbox"
                  checked={config.closed_weekdays.includes(i)}
                  onChange={() => toggleClosed(i)}
                />
                {w}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* 臨時店休日（お盆・年末年始・研修日など、特定日の休業） */}
      <div className="mt-3 border-t border-slate-100 pt-3">
        <label className="text-[11px] text-slate-500">
          臨時店休日（お盆・年末年始・研修日など。誰も出勤せず、必要人数の対象外になります）
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            type="date"
            className={`${inputCls} w-40`}
            value={holidayInput}
            onChange={(e) => setHolidayInput(e.target.value)}
          />
          <button
            onClick={addHoliday}
            disabled={!holidayInput}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-40"
          >
            追加
          </button>
          {config.holidays.map((d) => (
            <span
              key={d}
              className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs text-violet-700"
            >
              {d.slice(5).replace("-", "/")} 店休
              <button
                onClick={() => removeHoliday(d)}
                className="ml-0.5 opacity-60 hover:opacity-100"
                aria-label="削除"
              >
                ✕
              </button>
            </span>
          ))}
          {config.holidays.length === 0 && (
            <span className="text-xs text-slate-400">なし</span>
          )}
        </div>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- 勤務パターン

function PatternsEditor({ config, onChange }: Props) {
  const update = (i: number, patch: Partial<PatternConfig>) => {
    const patterns = config.patterns.map((p, j) =>
      j === i ? { ...p, ...patch } : p,
    );
    onChange({ ...config, patterns });
  };

  const add = () =>
    onChange({
      ...config,
      patterns: [
        ...config.patterns,
        {
          id: `p${Date.now() % 100000}`,
          label: `パターン${config.patterns.length + 1}`,
          start: config.store_open,
          end: config.store_close,
          break_min: 60,
          balance: false,
        },
      ],
    });

  const remove = (i: number) => {
    const removed = config.patterns[i].id;
    onChange({
      ...config,
      patterns: config.patterns.filter((_, j) => j !== i),
      staff: config.staff.map((s) => ({
        ...s,
        avail_patterns:
          s.avail_patterns === null
            ? null
            : s.avail_patterns.filter((x) => x !== removed),
      })),
      want_requests: config.want_requests.filter(([, , pid]) => pid !== removed),
    });
  };

  return (
    <Section
      title="勤務パターン"
      hint="開始・終了・休憩から実働時間を自動計算。営業時間の範囲外は警告します。「回数を平準化」にチェックしたパターンは担当回数がスタッフ間で偏らないよう最適化されます（負担の大きいシフトに設定。例: 遅番・通し）"
    >
      <div className="space-y-2">
        {config.patterns.map((p, i) => {
          const warn = patternWarning(p, config.store_open, config.store_close);
          return (
            <div
              key={p.id}
              className="flex flex-wrap items-end gap-2 rounded-md border border-slate-100 bg-slate-50/60 p-2"
            >
              <div className="w-28">
                <label className="text-[11px] text-slate-500">名称</label>
                <input
                  className={inputCls}
                  value={p.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500">開始</label>
                <input
                  type="time"
                  className={inputCls}
                  value={p.start}
                  onChange={(e) => update(i, { start: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500">終了</label>
                <input
                  type="time"
                  className={inputCls}
                  value={p.end}
                  onChange={(e) => update(i, { end: e.target.value })}
                />
              </div>
              <div className="w-20">
                <label className="text-[11px] text-slate-500">休憩(分)</label>
                <input
                  type="number"
                  min={0}
                  step={15}
                  className={numCls}
                  value={p.break_min}
                  onChange={(e) =>
                    update(i, { break_min: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <label
                className="inline-flex items-center gap-1 pb-1.5 text-xs text-slate-600"
                title="チェックしたパターンは担当回数の偏り(公平性スコア)が最小化されます。遅番・通しなど負担の大きいシフトに設定してください"
              >
                <input
                  type="checkbox"
                  checked={p.balance}
                  onChange={(e) => update(i, { balance: e.target.checked })}
                />
                回数を平準化
              </label>
              <span className="pb-1.5 text-xs font-medium text-slate-600">
                実働 {patternHours(p)}h
              </span>
              {warn && (
                <span className="pb-1.5 text-xs font-medium text-rose-500">
                  ⚠ {warn}
                </span>
              )}
              <button
                onClick={() => remove(i)}
                className="ml-auto pb-1.5 text-xs text-rose-500 hover:underline"
              >
                削除
              </button>
            </div>
          );
        })}
      </div>
      <button
        onClick={add}
        className="mt-3 rounded-md border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand/5"
      >
        ＋ パターンを追加
      </button>
    </Section>
  );
}

// ---------------------------------------------------------------- スタッフ

function StaffEditor({ config, onChange }: Props) {
  const update = (i: number, patch: Partial<StaffConfig>) => {
    const staff = config.staff.map((s, j) => (j === i ? { ...s, ...patch } : s));
    onChange({ ...config, staff });
  };

  const addStaff = () => {
    onChange({
      ...config,
      staff: [
        ...config.staff,
        {
          id: `s${Date.now() % 100000}`,
          name: `スタッフ${config.staff.length + 1}`,
          rank: "assistant",
          skills: ["shampoo"],
          max_hours_month: 160,
          max_hours_week: 40,
          off_days_required: 4,
          hourly_wage: 1200,
          avail_patterns: null,
          unavailable_weekdays: [],
        },
      ],
    });
  };

  const removeStaff = (i: number) => {
    const removed = config.staff[i].id;
    const drop = (pairs: [string, string][]) =>
      pairs.filter(([a, b]) => a !== removed && b !== removed);
    onChange({
      ...config,
      staff: config.staff.filter((_, j) => j !== i),
      off_requests: config.off_requests.filter(([sid]) => sid !== removed),
      want_requests: config.want_requests.filter(([sid]) => sid !== removed),
      pairs: {
        ng_soft: drop(config.pairs.ng_soft),
        ng_hard: drop(config.pairs.ng_hard),
        caution: drop(config.pairs.caution),
        recommend: drop(config.pairs.recommend),
      },
    });
  };

  return (
    <Section
      title="スタッフマスタ"
      hint="役職・スキル・労働条件・勤務可能パターン・勤務不可曜日を設定"
    >
      <div className="space-y-3">
        {config.staff.map((s, i) => (
          <div
            key={s.id}
            className="rounded-md border border-slate-100 bg-slate-50/60 p-3"
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
              <div className="col-span-2 sm:col-span-1">
                <label className="text-[11px] text-slate-500">氏名</label>
                <input
                  className={inputCls}
                  value={s.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500">役職</label>
                <select
                  className={inputCls}
                  value={s.rank}
                  onChange={(e) =>
                    update(i, { rank: e.target.value as StaffConfig["rank"] })
                  }
                >
                  {RANKS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-slate-500">月上限(h)</label>
                <input
                  type="number"
                  className={numCls}
                  value={s.max_hours_month}
                  onChange={(e) =>
                    update(i, { max_hours_month: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500">週上限(h)</label>
                <input
                  type="number"
                  className={numCls}
                  value={s.max_hours_week}
                  onChange={(e) =>
                    update(i, { max_hours_week: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500">
                  期間内公休(日)
                </label>
                <input
                  type="number"
                  className={numCls}
                  value={s.off_days_required}
                  onChange={(e) =>
                    update(i, { off_days_required: Number(e.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <label className="text-[11px] text-slate-500">時給(円)</label>
                <input
                  type="number"
                  min={0}
                  step={50}
                  className={numCls}
                  value={s.hourly_wage}
                  onChange={(e) =>
                    update(i, { hourly_wage: Number(e.target.value) || 0 })
                  }
                />
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-[11px] text-slate-500">スキル:</span>
              {SKILLS.map((k) => (
                <label
                  key={k.id}
                  className="inline-flex items-center gap-1 text-xs text-slate-600"
                >
                  <input
                    type="checkbox"
                    checked={s.skills.includes(k.id)}
                    onChange={(e) =>
                      update(i, {
                        skills: e.target.checked
                          ? [...s.skills, k.id]
                          : s.skills.filter((x) => x !== k.id),
                      })
                    }
                  />
                  {k.label}
                </label>
              ))}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-[11px] text-slate-500">勤務可能パターン:</span>
              <label className="inline-flex items-center gap-1 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={s.avail_patterns === null}
                  onChange={(e) =>
                    update(i, {
                      avail_patterns: e.target.checked
                        ? null
                        : config.patterns.map((p) => p.id),
                    })
                  }
                />
                すべて可
              </label>
              {s.avail_patterns !== null &&
                config.patterns.map((p) => (
                  <label
                    key={p.id}
                    className="inline-flex items-center gap-1 text-xs text-slate-600"
                  >
                    <input
                      type="checkbox"
                      checked={s.avail_patterns!.includes(p.id)}
                      onChange={(e) => {
                        const cur = s.avail_patterns ?? [];
                        update(i, {
                          avail_patterns: e.target.checked
                            ? [...cur, p.id]
                            : cur.filter((x) => x !== p.id),
                        });
                      }}
                    />
                    {p.label}
                  </label>
                ))}
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[11px] text-slate-500">勤務不可曜日:</span>
              {WEEKDAYS_JP.map((w, wd) => (
                <label
                  key={wd}
                  className="inline-flex items-center gap-0.5 text-xs text-slate-600"
                >
                  <input
                    type="checkbox"
                    checked={s.unavailable_weekdays.includes(wd)}
                    onChange={(e) =>
                      update(i, {
                        unavailable_weekdays: e.target.checked
                          ? [...s.unavailable_weekdays, wd]
                          : s.unavailable_weekdays.filter((x) => x !== wd),
                      })
                    }
                  />
                  {w}
                </label>
              ))}
              <button
                onClick={() => removeStaff(i)}
                className="ml-auto text-xs text-rose-500 hover:underline"
              >
                削除
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={addStaff}
        className="mt-3 rounded-md border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand/5"
      >
        ＋ スタッフを追加
      </button>
    </Section>
  );
}

// ---------------------------------------------------------------- 必要人数

const REQ_SKILLS = ["closer", "shampoo"];

function ReqInputs({
  value,
  onChange,
}: {
  value: DayRequirements;
  onChange: (v: DayRequirements) => void;
}) {
  return (
    <>
      {RANKS.map((r) => (
        <div key={r.id}>
          <label className="text-[11px] text-slate-500">{r.label}</label>
          <input
            type="number"
            min={0}
            className={numCls}
            value={value.by_rank[r.id] ?? 0}
            onChange={(e) =>
              onChange({
                ...value,
                by_rank: { ...value.by_rank, [r.id]: Number(e.target.value) || 0 },
              })
            }
          />
        </div>
      ))}
      {REQ_SKILLS.map((k) => (
        <div key={k}>
          <label className="text-[11px] text-slate-500">
            {SKILLS.find((s) => s.id === k)?.label}
          </label>
          <input
            type="number"
            min={0}
            className={numCls}
            value={value.by_skill[k] ?? 0}
            onChange={(e) =>
              onChange({
                ...value,
                by_skill: { ...value.by_skill, [k]: Number(e.target.value) || 0 },
              })
            }
          />
        </div>
      ))}
    </>
  );
}

function RequirementsEditor({ config, onChange }: Props) {
  const req = config.requirements;
  const overrideWds = Object.keys(req.weekday_overrides).map(Number);
  const freeWds = WEEKDAYS_JP.map((_, i) => i).filter(
    (i) => !overrideWds.includes(i),
  );

  const setBase = (v: DayRequirements) =>
    onChange({
      ...config,
      requirements: { ...req, by_rank: v.by_rank, by_skill: v.by_skill },
    });

  const setOverride = (wd: number, v: DayRequirements | null) => {
    const overrides = { ...req.weekday_overrides };
    if (v === null) delete overrides[wd];
    else overrides[wd] = v;
    onChange({
      ...config,
      requirements: { ...req, weekday_overrides: overrides },
    });
  };

  return (
    <Section
      title="必要人数（毎営業日の最低人数）"
      hint="基本設定に加え、曜日別の上書きが可能（例: 土曜はスタイリスト3名）"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <ReqInputs
          value={{ by_rank: req.by_rank, by_skill: req.by_skill }}
          onChange={setBase}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3 rounded-md border border-sky-100 bg-sky-50/50 p-2">
        <div className="w-44">
          <label className="text-[11px] text-slate-500">
            営業中の最低在店人数
          </label>
          <input
            type="number"
            min={0}
            className={numCls}
            value={req.coverage_min}
            onChange={(e) =>
              onChange({
                ...config,
                requirements: {
                  ...req,
                  coverage_min: Math.max(0, Number(e.target.value) || 0),
                },
              })
            }
          />
        </div>
        <p className="pb-1 text-xs text-slate-500">
          営業時間の<b>すべての時間帯</b>にこの人数以上を配置します（0=チェックしない）。
          時短だけで営業前後が無人になる問題を防ぎます
        </p>
      </div>

      {overrideWds.sort().map((wd) => (
        <div
          key={wd}
          className="mt-3 rounded-md border border-slate-100 bg-slate-50/60 p-2"
        >
          <div className="mb-1 flex items-center">
            <span className="text-xs font-semibold text-slate-600">
              {WEEKDAYS_JP[wd]}曜日の上書き
            </span>
            <button
              onClick={() => setOverride(wd, null)}
              className="ml-auto text-xs text-rose-500 hover:underline"
            >
              削除
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <ReqInputs
              value={req.weekday_overrides[wd]}
              onChange={(v) => setOverride(wd, v)}
            />
          </div>
        </div>
      ))}

      {freeWds.length > 0 && (
        <div className="mt-3">
          <select
            className={`${inputCls} w-56`}
            value=""
            onChange={(e) => {
              if (e.target.value === "") return;
              const wd = Number(e.target.value);
              setOverride(wd, {
                by_rank: { ...req.by_rank },
                by_skill: { ...req.by_skill },
              });
            }}
          >
            <option value="">＋ 曜日別の上書きを追加...</option>
            {freeWds.map((wd) => (
              <option key={wd} value={wd}>
                {WEEKDAYS_JP[wd]}曜日
              </option>
            ))}
          </select>
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------- 相性ペア

const PAIR_LABEL: Record<PairKind, { label: string; cls: string }> = {
  ng_soft: { label: "NG(ソフト)", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  ng_hard: { label: "NG(ハード)", cls: "bg-rose-100 text-rose-800 border-rose-300" },
  caution: { label: "注意", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  recommend: {
    label: "推奨/OJT",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
};

function PairsEditor({ config, onChange }: Props) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [kind, setKind] = useState<PairKind>("ng_soft");
  const [note, setNote] = useState("");

  const nameOf = (id: string) =>
    config.staff.find((s) => s.id === id)?.name ?? id;
  const noteKey = (k: PairKind, x: string, y: string) => `${k}:${x}:${y}`;

  const add = () => {
    if (!a || !b || a === b) return;
    const exists = config.pairs[kind].some(
      ([x, y]) => (x === a && y === b) || (x === b && y === a),
    );
    if (exists) return;
    const pair_notes = { ...config.pair_notes };
    if (note.trim()) pair_notes[noteKey(kind, a, b)] = note.trim();
    onChange({
      ...config,
      pairs: { ...config.pairs, [kind]: [...config.pairs[kind], [a, b]] },
      pair_notes,
    });
    setNote("");
  };

  const remove = (k: PairKind, idx: number) => {
    const [x, y] = config.pairs[k][idx];
    const pair_notes = { ...config.pair_notes };
    delete pair_notes[noteKey(k, x, y)];
    onChange({
      ...config,
      pairs: { ...config.pairs, [k]: config.pairs[k].filter((_, i) => i !== idx) },
      pair_notes,
    });
  };

  return (
    <Section
      title="相性マトリクス（管理者限定）"
      hint="NG(ソフト)=強い減点 / NG(ハード)=同時出勤禁止 / 注意=中程度の減点 / 推奨=加点(OJT等)。メモは管理者のみ閲覧・solver へは送信されません"
    >
      <div className="flex flex-wrap items-end gap-2">
        <select className={`${inputCls} w-36`} value={a} onChange={(e) => setA(e.target.value)}>
          <option value="">スタッフA</option>
          {config.staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <span className="pb-1 text-slate-400">×</span>
        <select className={`${inputCls} w-36`} value={b} onChange={(e) => setB(e.target.value)}>
          <option value="">スタッフB</option>
          {config.staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          className={`${inputCls} w-32`}
          value={kind}
          onChange={(e) => setKind(e.target.value as PairKind)}
        >
          {(Object.keys(PAIR_LABEL) as PairKind[]).map((k) => (
            <option key={k} value={k}>{PAIR_LABEL[k].label}</option>
          ))}
        </select>
        <input
          className={`${inputCls} w-56`}
          placeholder="理由メモ(任意・事実ベースで)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          onClick={add}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          追加
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(PAIR_LABEL) as PairKind[]).flatMap((k) =>
          config.pairs[k].map(([x, y], i) => {
            const memo = config.pair_notes[noteKey(k, x, y)];
            return (
              <span
                key={`${k}-${i}`}
                title={memo || undefined}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${PAIR_LABEL[k].cls}`}
              >
                <b>{PAIR_LABEL[k].label}</b> {nameOf(x)} × {nameOf(y)}
                {memo && <span className="opacity-60">📝</span>}
                <button
                  onClick={() => remove(k, i)}
                  className="ml-0.5 opacity-60 hover:opacity-100"
                  aria-label="削除"
                >
                  ✕
                </button>
              </span>
            );
          }),
        )}
        {Object.values(config.pairs).every((v) => v.length === 0) && (
          <span className="text-xs text-slate-400">未設定</span>
        )}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- 希望収集

function WishEditor({ config, onChange }: Props) {
  const [sid, setSid] = useState("");
  const [day, setDay] = useState("");
  const [wish, setWish] = useState("off"); // "off" or pattern id

  const nameOf = (id: string) =>
    config.staff.find((s) => s.id === id)?.name ?? id;
  const patternName = (pid: string) =>
    config.patterns.find((p) => p.id === pid)?.label ?? pid;

  const add = () => {
    if (!sid || !day) return;
    if (wish === "off") {
      if (config.off_requests.some(([s, d]) => s === sid && d === day)) return;
      onChange({ ...config, off_requests: [...config.off_requests, [sid, day]] });
    } else {
      if (
        config.want_requests.some(
          ([s, d, p]) => s === sid && d === day && p === wish,
        )
      )
        return;
      onChange({
        ...config,
        want_requests: [...config.want_requests, [sid, day, wish]],
      });
    }
  };

  const removeOff = (idx: number) =>
    onChange({
      ...config,
      off_requests: config.off_requests.filter((_, i) => i !== idx),
    });
  const removeWant = (idx: number) =>
    onChange({
      ...config,
      want_requests: config.want_requests.filter((_, i) => i !== idx),
    });

  // 提出状況（スタッフ別の件数）
  const counts = config.staff.map((s) => ({
    name: s.name,
    n:
      config.off_requests.filter(([x]) => x === s.id).length +
      config.want_requests.filter(([x]) => x === s.id).length,
  }));

  return (
    <Section
      title="希望収集（希望休・希望勤務）"
      hint="「希望提出」タブからスタッフ本人も入力可能（v1 は同一ブラウザ内。スマホ提出・リマインドは v2）"
    >
      <div className="flex flex-wrap items-end gap-2">
        <select className={`${inputCls} w-36`} value={sid} onChange={(e) => setSid(e.target.value)}>
          <option value="">スタッフ</option>
          {config.staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input
          type="date"
          className={`${inputCls} w-40`}
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
        <select className={`${inputCls} w-36`} value={wish} onChange={(e) => setWish(e.target.value)}>
          <option value="off">休み希望</option>
          {config.patterns.map((p) => (
            <option key={p.id} value={p.id}>{p.label}希望</option>
          ))}
        </select>
        <button
          onClick={add}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          追加
        </button>
        <span className="ml-auto pb-1 text-[11px] text-slate-400">
          提出状況: {counts.map((c) => `${c.name} ${c.n}件`).join(" / ")}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {config.off_requests
          .map((r, i) => ({ r, i }))
          .sort((x, y) => x.r[1].localeCompare(y.r[1]))
          .map(({ r: [s, d], i }) => (
            <span
              key={`off-${i}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600"
            >
              {d.slice(5).replace("-", "/")} {nameOf(s)} 休み
              <button
                onClick={() => removeOff(i)}
                className="ml-0.5 opacity-60 hover:opacity-100"
                aria-label="削除"
              >
                ✕
              </button>
            </span>
          ))}
        {config.want_requests
          .map((r, i) => ({ r, i }))
          .sort((x, y) => x.r[1].localeCompare(y.r[1]))
          .map(({ r: [s, d, p], i }) => (
            <span
              key={`want-${i}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs text-sky-700"
            >
              {d.slice(5).replace("-", "/")} {nameOf(s)} {patternName(p)}希望
              <button
                onClick={() => removeWant(i)}
                className="ml-0.5 opacity-60 hover:opacity-100"
                aria-label="削除"
              >
                ✕
              </button>
            </span>
          ))}
        {config.off_requests.length === 0 && config.want_requests.length === 0 && (
          <span className="text-xs text-slate-400">未設定</span>
        )}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- 全体

export function ConfigEditor({ config, onChange }: Props) {
  return (
    <div className="space-y-4">
      <StoreEditor config={config} onChange={onChange} />
      <PatternsEditor config={config} onChange={onChange} />
      <StaffEditor config={config} onChange={onChange} />
      <RequirementsEditor config={config} onChange={onChange} />
      <PairsEditor config={config} onChange={onChange} />
      <WishEditor config={config} onChange={onChange} />
    </div>
  );
}
