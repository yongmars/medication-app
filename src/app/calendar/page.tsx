"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AS_NEEDED_RECORDS_STORAGE_KEY,
  AsNeededRecord,
  DAILY_RECORDS_STORAGE_KEY,
  DailyMedicationRecords,
  getAppDateString,
  SCHEDULED_TIMINGS,
  TIMING_LABELS,
} from "../../lib/medications";

interface CalendarDay { date: Date; key: string; currentMonth: boolean; }

const makeDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export default function CalendarPage() {
  const [mounted, setMounted] = useState(false);
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [records, setRecords] = useState<DailyMedicationRecords>({});
  const [asNeededRecords, setAsNeededRecords] = useState<AsNeededRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState(getAppDateString());

  useEffect(() => {
    const hydrateTimer = window.setTimeout(() => {
      setMounted(true);
      try {
        setRecords(JSON.parse(localStorage.getItem(DAILY_RECORDS_STORAGE_KEY) || "{}"));
        setAsNeededRecords(JSON.parse(localStorage.getItem(AS_NEEDED_RECORDS_STORAGE_KEY) || "[]"));
      } catch {
        setRecords({});
        setAsNeededRecords([]);
      }
    }, 0);
    return () => window.clearTimeout(hydrateTimer);
  }, []);

  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const days = useMemo(() => {
    const first = new Date(year, month, 1);
    const gridStart = new Date(year, month, 1 - first.getDay());
    return Array.from({ length: 42 }, (_, index): CalendarDay => {
      const date = new Date(gridStart);
      date.setDate(gridStart.getDate() + index);
      return { date, key: makeDateKey(date), currentMonth: date.getMonth() === month };
    });
  }, [month, year]);

  const selectedRecord = records[selectedDate] || {};
  const selectedAsNeeded = asNeededRecords.filter((record) => getAppDateString(new Date(record.takenAt)) === selectedDate);

  if (!mounted) return <div className="min-h-full grid place-items-center text-slate-500 font-bold">読み込み中...</div>;

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-900 px-4 py-5">
      <main className="max-w-lg mx-auto space-y-4">
        <header><p className="text-xs font-bold text-sky-600">まいにち服薬</p><h1 className="text-2xl font-black text-slate-800 dark:text-white">服薬履歴</h1></header>
        <section className="rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setMonthDate(new Date(year, month - 1, 1))} className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-700 font-bold">‹</button>
            <h2 className="text-lg font-black text-slate-800 dark:text-white">{year}年 {month + 1}月</h2>
            <button onClick={() => setMonthDate(new Date(year, month + 1, 1))} className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-700 font-bold">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-400 mb-1">{["日", "月", "火", "水", "木", "金", "土"].map((day) => <div key={day} className="py-1">{day}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const completed = SCHEDULED_TIMINGS.filter((timing) => records[day.key]?.[timing]?.completed).length;
              const asNeededCount = asNeededRecords.filter((record) => getAppDateString(new Date(record.takenAt)) === day.key).length;
              const selected = selectedDate === day.key;
              return (
                <button key={day.key} onClick={() => setSelectedDate(day.key)} className={`min-h-14 rounded-xl border p-1 text-center transition ${selected ? "border-sky-500 bg-sky-50 dark:bg-sky-950/30" : "border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"} ${day.currentMonth ? "opacity-100" : "opacity-35"}`}>
                  <span className={`block text-[11px] font-bold ${day.key === getAppDateString() ? "text-sky-600" : "text-slate-500 dark:text-slate-300"}`}>{day.date.getDate()}</span>
                  {completed > 0 && <span className="block text-sm leading-4" title={`${completed}時間帯完了`}>🐾</span>}
                  {(completed > 0 || asNeededCount > 0) && <span className="block text-[9px] font-bold text-slate-400">{completed > 0 ? `${completed}/7` : ""}{asNeededCount > 0 ? ` 頓${asNeededCount}` : ""}</span>}
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
          <h2 className="font-black text-slate-800 dark:text-white">{selectedDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1年$2月$3日")}の記録</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {SCHEDULED_TIMINGS.map((timing) => {
              const record = selectedRecord[timing];
              return <div key={timing} className={`rounded-xl p-2.5 text-sm font-bold ${record?.completed ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-slate-50 text-slate-400 dark:bg-slate-700"}`}><span>{record?.completed ? "✓" : "－"}</span> {TIMING_LABELS[timing]}{record?.checkedMedicationIds.length ? <span className="block pl-5 text-[10px] opacity-70">{record.checkedMedicationIds.length}薬チェック</span> : null}</div>;
            })}
          </div>
          <div className="mt-4 border-t border-slate-100 dark:border-slate-700 pt-3"><h3 className="text-sm font-black text-purple-700 dark:text-purple-300">頓服</h3>{selectedAsNeeded.length === 0 ? <p className="mt-1 text-xs text-slate-400">記録はありません。</p> : selectedAsNeeded.map((record) => <p key={record.id} className="mt-1 text-sm text-slate-600 dark:text-slate-300">{new Date(record.takenAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}　{record.medicationName}</p>)}</div>
        </section>
        <p className="px-2 text-xs leading-relaxed text-slate-500">🐾は、その日に服用が完了した時間帯があることを示します。記録はこの端末内だけに保存されます。</p>
      </main>
    </div>
  );
}
