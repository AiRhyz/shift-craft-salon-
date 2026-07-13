"use client";

// スタッフ向け 希望休・希望勤務の提出ページ（要件 3.2 希望収集の v1）。
// v1 は管理者と同じブラウザ保存を共有する簡易版。スマホ個別提出・期限
// リマインド・LINE 通知は v2（Supabase + 通知連携）で対応する。

import { Nav } from "@/components/Nav";
import { loadConfirmed } from "@/lib/confirmed";
import type { PlanConfig } from "@/lib/planConfig";
import { defaultConfig, loadConfig, saveConfig } from "@/lib/planConfig";
import type { SwapRequest } from "@/lib/swaps";
import { addSwap, loadSwaps } from "@/lib/swaps";
import type { Schedule } from "@/lib/types";
import { useEffect, useRef, useState } from "react";

const inputCls =
  "w-full rounded border border-slate-300 px-2 py-2 text-sm focus:border-brand focus:outline-none";

export default function SubmitPage() {
  const [config, setConfig] = useState<PlanConfig>(defaultConfig);
  const [sid, setSid] = useState("");
  const [day, setDay] = useState("");
  const [wish, setWish] = useState("off");
  const [saved, setSaved] = useState(false);
  const [confirmedSched, setConfirmedSched] = useState<Schedule | null>(null);
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [swapDate, setSwapDate] = useState("");
  const [swapTo, setSwapTo] = useState("");
  const hydrated = useRef(false);

  useEffect(() => {
    const c = loadConfig();
    if (c) setConfig(c);
    setConfirmedSched(loadConfirmed()?.schedule ?? null);
    setSwaps(loadSwaps());
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (hydrated.current) saveConfig(config);
  }, [config]);

  const me = config.staff.find((s) => s.id === sid);
  const myOff = config.off_requests
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r[0] === sid)
    .sort((a, b) => a.r[1].localeCompare(b.r[1]));
  const myWant = config.want_requests
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r[0] === sid)
    .sort((a, b) => a.r[1].localeCompare(b.r[1]));

  const patternName = (pid: string) =>
    config.patterns.find((p) => p.id === pid)?.label ?? pid;

  const add = () => {
    if (!sid || !day) return;
    setSaved(false);
    if (wish === "off") {
      if (config.off_requests.some(([s, d]) => s === sid && d === day)) return;
      setConfig({
        ...config,
        off_requests: [...config.off_requests, [sid, day]],
      });
    } else {
      if (
        config.want_requests.some(
          ([s, d, p]) => s === sid && d === day && p === wish,
        )
      )
        return;
      setConfig({
        ...config,
        want_requests: [...config.want_requests, [sid, day, wish]],
      });
    }
    setSaved(true);
    setDay("");
  };

  const removeOff = (idx: number) =>
    setConfig({
      ...config,
      off_requests: config.off_requests.filter((_, i) => i !== idx),
    });
  const removeWant = (idx: number) =>
    setConfig({
      ...config,
      want_requests: config.want_requests.filter((_, i) => i !== idx),
    });

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <Nav current="submit" />

      <header className="mb-5">
        <h1 className="text-xl font-bold text-slate-900">希望休・希望シフトの提出</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          お名前を選んで、休みたい日や希望の勤務パターンを送ってください
        </p>
      </header>

      <div className="space-y-4">
        <div>
          <label className="text-xs text-slate-500">お名前</label>
          <select
            className={inputCls}
            value={sid}
            onChange={(e) => setSid(e.target.value)}
          >
            <option value="">選択してください</option>
            {config.staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {me && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500">日付</label>
                <input
                  type="date"
                  className={inputCls}
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">希望</label>
                <select
                  className={inputCls}
                  value={wish}
                  onChange={(e) => setWish(e.target.value)}
                >
                  <option value="off">休み希望</option>
                  {config.patterns
                    .filter(
                      (p) =>
                        me.avail_patterns === null ||
                        me.avail_patterns.includes(p.id),
                    )
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}（{p.start}〜{p.end}）で働きたい
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <button
              onClick={add}
              disabled={!day}
              className="w-full rounded-md bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-dark disabled:opacity-40"
            >
              提出する
            </button>
            {saved && (
              <p className="text-center text-sm font-medium text-emerald-600">
                ✓ 提出しました
              </p>
            )}

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700">
                {me.name} さんの提出済み希望
              </h2>
              <div className="mt-2 space-y-1.5">
                {myOff.map(({ r: [, d], i }) => (
                  <div
                    key={`o${i}`}
                    className="flex items-center rounded-md bg-slate-50 px-3 py-1.5 text-sm text-slate-700"
                  >
                    {d.slice(5).replace("-", "/")} 休み希望
                    <button
                      onClick={() => removeOff(i)}
                      className="ml-auto text-xs text-rose-500 hover:underline"
                    >
                      取り消す
                    </button>
                  </div>
                ))}
                {myWant.map(({ r: [, d, p], i }) => (
                  <div
                    key={`w${i}`}
                    className="flex items-center rounded-md bg-sky-50 px-3 py-1.5 text-sm text-sky-700"
                  >
                    {d.slice(5).replace("-", "/")} {patternName(p)}希望
                    <button
                      onClick={() => removeWant(i)}
                      className="ml-auto text-xs text-rose-500 hover:underline"
                    >
                      取り消す
                    </button>
                  </div>
                ))}
                {myOff.length === 0 && myWant.length === 0 && (
                  <p className="text-sm text-slate-400">まだ提出はありません</p>
                )}
              </div>
            </section>
            {/* シフト交換申請（確定シフトがある場合） */}
            {confirmedSched && (
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-700">
                  シフト交換申請
                </h2>
                <p className="mt-0.5 text-xs text-slate-400">
                  確定シフトのうち自分の出勤日を選び、代わってほしい相手に申請します（店長の承認後に反映）
                </p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-500">自分の出勤日</label>
                    <select
                      className={inputCls}
                      value={swapDate}
                      onChange={(e) => setSwapDate(e.target.value)}
                    >
                      <option value="">選択</option>
                      {confirmedSched.days
                        .filter((d) => {
                          const meRow = confirmedSched.staff.find(
                            (s) => s.id === sid,
                          );
                          return meRow?.assignments[d.date];
                        })
                        .map((d) => (
                          <option key={d.date} value={d.date}>
                            {d.date.slice(5).replace("-", "/")}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">交代相手</label>
                    <select
                      className={inputCls}
                      value={swapTo}
                      onChange={(e) => setSwapTo(e.target.value)}
                    >
                      <option value="">選択</option>
                      {config.staff
                        .filter((s) => s.id !== sid)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (!sid || !swapDate || !swapTo) return;
                    addSwap(sid, swapTo, swapDate);
                    setSwaps(loadSwaps());
                    setSwapDate("");
                    setSwapTo("");
                  }}
                  disabled={!swapDate || !swapTo}
                  className="mt-3 w-full rounded-md border border-brand px-4 py-2 text-sm font-semibold text-brand hover:bg-brand/5 disabled:opacity-40"
                >
                  交換を申請する
                </button>
                <div className="mt-2 space-y-1">
                  {swaps
                    .filter((r) => r.from_id === sid)
                    .map((r) => {
                      const st = {
                        pending: ["承認待ち", "text-amber-600"],
                        approved: ["承認済み", "text-emerald-600"],
                        rejected: ["却下", "text-rose-500"],
                      }[r.status];
                      const toName =
                        config.staff.find((s) => s.id === r.to_id)?.name ??
                        r.to_id;
                      return (
                        <div key={r.id} className="text-xs text-slate-600">
                          {r.date.slice(5).replace("-", "/")} → {toName}：{" "}
                          <span className={`font-semibold ${st[1]}`}>{st[0]}</span>
                        </div>
                      );
                    })}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <footer className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-400">
        v1 はこの端末のブラウザに保存されます（店長と同じ端末・ブラウザでご利用ください）。
        スマホからの個別提出・リマインド通知は v2 で対応予定です。
      </footer>
    </main>
  );
}
