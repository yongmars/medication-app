"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  AS_NEEDED_RECORDS_STORAGE_KEY,
  AsNeededRecord,
  DAILY_RECORDS_STORAGE_KEY,
  DailyMedicationRecords,
  getAppDateString,
  isMedicationScheduledForAppDate,
  Medication,
  readMedications,
  ScheduledTiming,
  SCHEDULED_TIMINGS,
  TIMING_LABELS,
} from "../../lib/medications";

interface CalendarDay { date: Date; key: string; currentMonth: boolean; }
const makeDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const timingMedications = (medications: Medication[], timing: ScheduledTiming, appDate: string) =>
  medications.filter((medication) => medication.timings.includes(timing) && isMedicationScheduledForAppDate(medication, appDate));

const isTimingComplete = (medications: Medication[], records: DailyMedicationRecords, timing: ScheduledTiming, appDate: string) => {
  const expected = timingMedications(medications, timing, appDate);
  const checked = records[appDate]?.[timing]?.checkedMedicationIds ?? [];
  return expected.length > 0 && expected.every((medication) => checked.includes(medication.id));
};

const getDayTimingStats = (medications: Medication[], records: DailyMedicationRecords, appDate: string) => {
  const applicableTimings = SCHEDULED_TIMINGS.filter((timing) => timingMedications(medications, timing, appDate).length > 0);
  const completedCount = applicableTimings.filter((timing) => isTimingComplete(medications, records, timing, appDate)).length;
  return { applicableTimings, completedCount, totalCount: applicableTimings.length };
};

export default function CalendarPage() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const [mounted, setMounted] = useState(false);
  const [monthDate, setMonthDate] = useState(() => new Date());
  const [medications, setMedications] = useState<Medication[]>([]);
  const [records, setRecords] = useState<DailyMedicationRecords>({});
  const [asNeededRecords, setAsNeededRecords] = useState<AsNeededRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState(getAppDateString());

  useEffect(() => {
    const hydrateTimer = window.setTimeout(() => {
      setMounted(true);
      setMedications(readMedications());
      try {
        const daily = JSON.parse(localStorage.getItem(DAILY_RECORDS_STORAGE_KEY) || "{}");
        const asNeeded = JSON.parse(localStorage.getItem(AS_NEEDED_RECORDS_STORAGE_KEY) || "[]");
        setRecords(daily && typeof daily === "object" ? daily : {});
        setAsNeededRecords(Array.isArray(asNeeded) ? asNeeded : []);
      } catch { setRecords({}); setAsNeededRecords([]); }
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
  const selectedTimingStats = getDayTimingStats(medications, records, selectedDate);

  if (!mounted) return <div className="min-h-full grid place-items-center text-slate-500 font-bold">読み込み中...</div>;

  return (
    <div className="min-h-full bg-slate-50 px-2 py-5 dark:bg-slate-900 sm:px-4">
      <main className="mx-auto max-w-lg space-y-4">
        <header className="px-2 text-center"><p className="text-xs font-bold text-sky-600">まいにち服薬</p><h1 className="text-2xl font-black text-slate-800 dark:text-white">服薬履歴</h1></header>
        <section className="rounded-3xl border border-slate-100 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-4">
          <div className="mb-4 flex items-center justify-between"><button type="button" onClick={() => setMonthDate(new Date(year, month - 1, 1))} aria-label="前の月" className="h-10 w-10 rounded-xl bg-slate-100 font-bold dark:bg-slate-700">‹</button><h2 className="text-lg font-black text-slate-800 dark:text-white">{year}年 {month + 1}月</h2><button type="button" onClick={() => setMonthDate(new Date(year, month + 1, 1))} aria-label="次の月" className="h-10 w-10 rounded-xl bg-slate-100 font-bold dark:bg-slate-700">›</button></div>
          <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-xs font-bold text-slate-400 sm:gap-1">{["日", "月", "火", "水", "木", "金", "土"].map((day) => <div key={day} className="py-1">{day}</div>)}</div>
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
            {days.map((day) => {
              const selected = selectedDate === day.key;
              const stats = getDayTimingStats(medications, records, day.key);
              const allComplete = stats.totalCount > 0 && stats.completedCount === stats.totalCount;
              const showStats = stats.totalCount > 0 && day.key <= getAppDateString();
              return <button type="button" key={day.key} onClick={() => setSelectedDate(day.key)} className={`min-h-[68px] rounded-xl border px-0.5 py-1 text-center transition ${selected ? "border-sky-500 bg-sky-50 dark:bg-sky-950/30" : "border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"} ${day.currentMonth ? "opacity-100" : "opacity-35"}`}><span className={`block text-[11px] font-bold ${day.key === getAppDateString() ? "text-sky-600" : "text-slate-500 dark:text-slate-300"}`}>{day.date.getDate()}</span>{showStats ? <span className="mt-1 flex flex-col items-center"><span className={`text-[11px] font-black ${allComplete ? "text-emerald-600 dark:text-emerald-300" : "text-slate-500 dark:text-slate-300"}`}>{stats.completedCount}/{stats.totalCount}</span>{allComplete && <Image src={`${basePath}/paw.webp`} alt="すべての服薬完了" width={20} height={20} className="mt-0.5 h-5 w-5 object-contain" />}</span> : <span className="mt-2 block text-xs text-slate-300">－</span>}</button>;
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h2 className="font-black text-slate-800 dark:text-white">{selectedDate.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$1年$2月$3日")}の記録</h2>
          {selectedTimingStats.applicableTimings.length === 0 ? <p className="mt-3 rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-400 dark:bg-slate-700">この日に予定されているお薬はありません。</p> : <div className="mt-3 grid grid-cols-2 gap-2">{selectedTimingStats.applicableTimings.map((timing) => { const expected = timingMedications(medications, timing, selectedDate); const record = selectedRecord[timing]; const complete = isTimingComplete(medications, records, timing, selectedDate); const checkedCount = record?.checkedMedicationIds?.filter((id) => expected.some((medication) => medication.id === id)).length ?? 0; return <div key={timing} className={`flex min-h-[72px] items-center gap-2 rounded-xl p-2.5 text-sm font-bold ${complete ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-slate-50 text-slate-500 dark:bg-slate-700 dark:text-slate-300"}`}>{complete ? <Image src={`${basePath}/paw.webp`} alt={`${TIMING_LABELS[timing]}完了`} width={25} height={25} className="h-[25px] w-[25px] shrink-0 object-contain" /> : <span className="grid h-[25px] w-[25px] shrink-0 place-items-center text-slate-300">－</span>}<span>{TIMING_LABELS[timing]}<span className="block text-[10px] opacity-70">{checkedCount}/{expected.length}薬チェック</span></span></div>; })}</div>}
          <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-700"><h3 className="text-sm font-black text-purple-700 dark:text-purple-300">頓服</h3>{selectedAsNeeded.length === 0 ? <p className="mt-1 text-xs text-slate-400">記録はありません。</p> : selectedAsNeeded.map((record) => <p key={record.id} className="mt-1 text-sm text-slate-600 dark:text-slate-300">{new Date(record.takenAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}　{record.medicationName}{record.dose && record.unitLabel ? ` ${record.dose}${record.unitLabel}` : ""}</p>)}</div>
        </section>
        <p className="flex items-center justify-center gap-2 px-2 text-xs leading-relaxed text-slate-500"><Image src={`${basePath}/paw.webp`} alt="完了スタンプ" width={22} height={22} />は、その日に予定されたすべての服用時間帯が完了した印です。</p>
      </main>
    </div>
  );
}
