"use client";

// シフト作成の入力設定エディタ（マスタ管理・希望収集の v1 簡易版）。
// スタッフ・必要人数・相性ペア・希望休・期間を編集して onChange で親に返す。

import type { PlanConfig, StaffConfig } from "@/lib/planConfig";
import { RANKS, SKILLS } from "@/lib/planConfig";
import { useState } from "react";

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"];

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

// ---------------------------------------------------------------- スタッフ

function StaffEditor({
  config,
  onChange,
}: {
  config: PlanConfig;
  onChange: (c: PlanConfig) => void;
}) {
  const update = (i: number, patch: Partial<StaffConfig>) => {
    const staff = config.staff.map((s, j) => (j === i ? { ...s, ...patch } : s));
    onChange({ ...config, staff });
  };

  const addStaff = () => {
    const n = config.staff.length + 1;
    const id = `s${Date.now() % 100000}`;
    onChange({
      ...config,
      staff: [
        ...config.staff,
        {
          id,
          name: `スタッフ${n}`,
          rank: "assistant",
          skills: ["shampoo"],
          max_hours_month: 160,
          max_hours_week: 40,
          off_days_required: 4,
          avail_patterns: null,
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
      pairs: {
        ng_soft: drop(config.pairs.ng_soft),
        ng_hard: drop(config.pairs.ng_hard),
        recommend: drop(config.pairs.recommend),
      },
    });
  };

  return (
    <Section
      title="スタッフマスタ"
      hint="役職・スキル・労働条件・勤務可能パターンを設定"
    >
      <div className="space-y-3">
        {config.staff.map((s, i) => (
          <div
            key={s.id}
            className="rounded-md border border-slate-100 bg-slate-50/60 p-3"
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
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

function RequirementsEditor({
  config,
  onChange,
}: {
  config: PlanConfig;
  onChange: (c: PlanConfig) => void;
}) {
  const setRank = (rank: string, v: number) =>
    onChange({
      ...config,
      requirements: {
        ...config.requirements,
        by_rank: { ...config.requirements.by_rank, [rank]: v },
      },
    });
  const setSkill = (skill: string, v: number) =>
    onChange({
      ...config,
      requirements: {
        ...config.requirements,
        by_skill: { ...config.requirements.by_skill, [skill]: v },
      },
    });

  return (
    <Section
      title="必要人数（毎営業日の最低人数）"
      hint="v1 は全営業日一律。曜日別設定は v2 で対応"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {RANKS.map((r) => (
          <div key={r.id}>
            <label className="text-[11px] text-slate-500">{r.label}</label>
            <input
              type="number"
              min={0}
              className={numCls}
              value={config.requirements.by_rank[r.id] ?? 0}
              onChange={(e) => setRank(r.id, Number(e.target.value) || 0)}
            />
          </div>
        ))}
        {["closer", "shampoo"].map((k) => (
          <div key={k}>
            <label className="text-[11px] text-slate-500">
              {SKILLS.find((s) => s.id === k)?.label}
            </label>
            <input
              type="number"
              min={0}
              className={numCls}
              value={config.requirements.by_skill[k] ?? 0}
              onChange={(e) => setSkill(k, Number(e.target.value) || 0)}
            />
          </div>
        ))}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- 相性ペア

type PairKind = "ng_soft" | "ng_hard" | "recommend";
const PAIR_LABEL: Record<PairKind, { label: string; cls: string }> = {
  ng_soft: { label: "NG(ソフト)", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  ng_hard: { label: "NG(ハード)", cls: "bg-rose-100 text-rose-800 border-rose-300" },
  recommend: {
    label: "推奨/OJT",
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
};

function PairsEditor({
  config,
  onChange,
}: {
  config: PlanConfig;
  onChange: (c: PlanConfig) => void;
}) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [kind, setKind] = useState<PairKind>("ng_soft");

  const nameOf = (id: string) =>
    config.staff.find((s) => s.id === id)?.name ?? id;

  const add = () => {
    if (!a || !b || a === b) return;
    const exists = config.pairs[kind].some(
      ([x, y]) => (x === a && y === b) || (x === b && y === a),
    );
    if (exists) return;
    onChange({
      ...config,
      pairs: { ...config.pairs, [kind]: [...config.pairs[kind], [a, b]] },
    });
  };

  const remove = (k: PairKind, idx: number) =>
    onChange({
      ...config,
      pairs: { ...config.pairs, [k]: config.pairs[k].filter((_, i) => i !== idx) },
    });

  return (
    <Section
      title="相性マトリクス（管理者限定）"
      hint="NG(ソフト)=強い減点 / NG(ハード)=同時出勤禁止 / 推奨=加点(OJT等)。ハード化は解不能リスクに注意"
    >
      <div className="flex flex-wrap items-end gap-2">
        <select className={`${inputCls} w-40`} value={a} onChange={(e) => setA(e.target.value)}>
          <option value="">スタッフA</option>
          {config.staff.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <span className="pb-1 text-slate-400">×</span>
        <select className={`${inputCls} w-40`} value={b} onChange={(e) => setB(e.target.value)}>
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
        <button
          onClick={add}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          追加
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(PAIR_LABEL) as PairKind[]).flatMap((k) =>
          config.pairs[k].map(([x, y], i) => (
            <span
              key={`${k}-${i}`}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${PAIR_LABEL[k].cls}`}
            >
              <b>{PAIR_LABEL[k].label}</b> {nameOf(x)} × {nameOf(y)}
              <button
                onClick={() => remove(k, i)}
                className="ml-0.5 opacity-60 hover:opacity-100"
                aria-label="削除"
              >
                ✕
              </button>
            </span>
          )),
        )}
        {Object.values(config.pairs).every((v) => v.length === 0) && (
          <span className="text-xs text-slate-400">未設定</span>
        )}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- 希望休

function OffRequestsEditor({
  config,
  onChange,
}: {
  config: PlanConfig;
  onChange: (c: PlanConfig) => void;
}) {
  const [sid, setSid] = useState("");
  const [day, setDay] = useState("");

  const nameOf = (id: string) =>
    config.staff.find((s) => s.id === id)?.name ?? id;

  const add = () => {
    if (!sid || !day) return;
    if (config.off_requests.some(([s, d]) => s === sid && d === day)) return;
    onChange({ ...config, off_requests: [...config.off_requests, [sid, day]] });
  };

  const remove = (idx: number) =>
    onChange({
      ...config,
      off_requests: config.off_requests.filter((_, i) => i !== idx),
    });

  const sorted = config.off_requests
    .map((r, i) => ({ r, i }))
    .sort((x, y) => x.r[1].localeCompare(y.r[1]));

  return (
    <Section
      title="希望休"
      hint="v1 は管理者代行入力。v2 でスタッフ本人のスマホ提出＋リマインドに対応"
    >
      <div className="flex flex-wrap items-end gap-2">
        <select className={`${inputCls} w-40`} value={sid} onChange={(e) => setSid(e.target.value)}>
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
        <button
          onClick={add}
          className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          追加
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {sorted.map(({ r: [s, d], i }) => (
          <span
            key={i}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600"
          >
            {d.slice(5).replace("-", "/")} {nameOf(s)}
            <button
              onClick={() => remove(i)}
              className="ml-0.5 opacity-60 hover:opacity-100"
              aria-label="削除"
            >
              ✕
            </button>
          </span>
        ))}
        {config.off_requests.length === 0 && (
          <span className="text-xs text-slate-400">未設定</span>
        )}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------- 期間・店舗

function PeriodEditor({
  config,
  onChange,
}: {
  config: PlanConfig;
  onChange: (c: PlanConfig) => void;
}) {
  const toggleClosed = (wd: number) => {
    const cur = config.closed_weekdays;
    onChange({
      ...config,
      closed_weekdays: cur.includes(wd)
        ? cur.filter((x) => x !== wd)
        : [...cur, wd],
    });
  };

  return (
    <Section title="対象期間・店舗設定">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className="text-[11px] text-slate-500">開始日</label>
          <input
            type="date"
            className={inputCls}
            value={config.start_date}
            onChange={(e) => onChange({ ...config, start_date: e.target.value })}
          />
        </div>
        <div>
          <label className="text-[11px] text-slate-500">日数</label>
          <input
            type="number"
            min={1}
            max={31}
            className={numCls}
            value={config.num_days}
            onChange={(e) =>
              onChange({
                ...config,
                num_days: Math.min(31, Math.max(1, Number(e.target.value) || 1)),
              })
            }
          />
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
          <label className="text-[11px] text-slate-500">定休日</label>
          <div className="mt-1 flex gap-2">
            {WEEKDAYS.map((w, i) => (
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
    </Section>
  );
}

// ---------------------------------------------------------------- 全体

export function ConfigEditor({
  config,
  onChange,
}: {
  config: PlanConfig;
  onChange: (c: PlanConfig) => void;
}) {
  return (
    <div className="space-y-4">
      <PeriodEditor config={config} onChange={onChange} />
      <StaffEditor config={config} onChange={onChange} />
      <RequirementsEditor config={config} onChange={onChange} />
      <PairsEditor config={config} onChange={onChange} />
      <OffRequestsEditor config={config} onChange={onChange} />
    </div>
  );
}
