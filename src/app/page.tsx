"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { getMedicationPhotos } from "../lib/medicationPhotos";
import {
  AS_NEEDED_RECORDS_STORAGE_KEY,
  AsNeededRecord,
  DAILY_RECORDS_STORAGE_KEY,
  DailyMedicationRecords,
  getAppDateString,
  getSuggestedTiming,
  Medication,
  readMedications,
  ScheduledTiming,
  SCHEDULED_TIMINGS,
  TIMING_LABELS,
} from "../lib/medications";

type Character = "noct" | "lux" | "saku";

const CHARACTER_LABELS: Record<Character, string> = { noct: "ノクト", lux: "ルクス", saku: "朔" };
const CHARACTER_MESSAGES: Record<Character, string> = {
  noct: "今日も一緒に、無理なく続けよう。",
  lux: "飲んだらチェックしてね！",
  saku: "処方の指示を確認してから飲もう。",
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function Home() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const [mounted, setMounted] = useState(false);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [selectedTiming, setSelectedTiming] = useState<ScheduledTiming>("breakfast_before");
  const [records, setRecords] = useState<DailyMedicationRecords>({});
  const [asNeededRecords, setAsNeededRecords] = useState<AsNeededRecord[]>([]);
  const [showAsNeeded, setShowAsNeeded] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<Record<number, string>>({});
  const [expandedPhoto, setExpandedPhoto] = useState<{ name: string; url: string } | null>(null);
  const [character, setCharacter] = useState<Character>("noct");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  const today = getAppDateString();
  const timingMedications = useMemo(
    () => medications.filter((medication) => medication.timings.includes(selectedTiming)),
    [medications, selectedTiming]
  );
  const checkedIds = records[today]?.[selectedTiming]?.checkedMedicationIds ?? [];
  const completedCount = timingMedications.filter((medication) => checkedIds.includes(medication.id)).length;

  useEffect(() => {
    const hydrateTimer = window.setTimeout(() => {
      setMounted(true);
      setMedications(readMedications());
      setSelectedTiming(getSuggestedTiming());
      setCharacter((localStorage.getItem("medication-character") as Character) || "noct");
      try {
        setRecords(JSON.parse(localStorage.getItem(DAILY_RECORDS_STORAGE_KEY) || "{}"));
        setAsNeededRecords(JSON.parse(localStorage.getItem(AS_NEEDED_RECORDS_STORAGE_KEY) || "[]"));
      } catch {
        setRecords({});
        setAsNeededRecords([]);
      }
    }, 0);
    const handleBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => {
      window.clearTimeout(hydrateTimer);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const activeUrls: string[] = [];
    void getMedicationPhotos(medications.map((medication) => medication.id)).then((photos) => {
      const next: Record<number, string> = {};
      photos.forEach((photo, id) => {
        const url = URL.createObjectURL(photo.blob);
        next[id] = url;
        activeUrls.push(url);
      });
      setPhotoUrls(next);
    });
    return () => activeUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [medications, mounted]);

  const saveRecords = (next: DailyMedicationRecords) => {
    setRecords(next);
    localStorage.setItem(DAILY_RECORDS_STORAGE_KEY, JSON.stringify(next));
  };

  const toggleMedication = (medicationId: number) => {
    const previous = records[today]?.[selectedTiming];
    const previousIds = previous?.checkedMedicationIds ?? [];
    const nextIds = previousIds.includes(medicationId)
      ? previousIds.filter((id) => id !== medicationId)
      : [...previousIds, medicationId];
    const relevantIds = timingMedications.map((medication) => medication.id);
    const completed = relevantIds.length > 0 && relevantIds.every((id) => nextIds.includes(id));
    saveRecords({
      ...records,
      [today]: {
        ...records[today],
        [selectedTiming]: { checkedMedicationIds: nextIds, completed },
      },
    });
  };

  const recordAsNeeded = (medication: Medication) => {
    const takenAt = new Date().toISOString();
    const next = [{
      id: `${takenAt}-${medication.id}-${asNeededRecords.length}`,
      medicationId: medication.id,
      medicationName: medication.name,
      takenAt,
    }, ...asNeededRecords];
    setAsNeededRecords(next);
    localStorage.setItem(AS_NEEDED_RECORDS_STORAGE_KEY, JSON.stringify(next));
  };

  const changeCharacter = (next: Character) => {
    setCharacter(next);
    localStorage.setItem("medication-character", next);
  };

  if (!mounted) {
    return <div className="min-h-full grid place-items-center text-slate-500 font-bold">読み込み中...</div>;
  }

  const asNeededMedications = medications.filter((medication) => medication.timings.includes("as_needed"));
  const todayAsNeeded = asNeededRecords.filter((record) => getAppDateString(new Date(record.takenAt)) === today);

  return (
    <div className="min-h-full bg-gradient-to-b from-sky-50 via-white to-amber-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 px-4 pt-4 pb-8">
      <header className="max-w-lg mx-auto mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-sky-600 dark:text-sky-400">ノクト・ルクス・朔と続ける</p>
          <h1 className="text-2xl font-black text-slate-800 dark:text-white">まいにち服薬</h1>
        </div>
        {installPrompt && (
          <button onClick={async () => { await installPrompt.prompt(); setInstallPrompt(null); }} className="rounded-full bg-sky-600 px-3 py-2 text-xs font-bold text-white shadow-sm">
            アプリを追加
          </button>
        )}
      </header>

      <section className="max-w-lg mx-auto rounded-3xl bg-white/90 dark:bg-slate-800 border border-sky-100 dark:border-slate-700 shadow-sm overflow-hidden mb-4">
        <div className="relative h-40 bg-gradient-to-r from-sky-100 to-amber-100 dark:from-slate-800 dark:to-slate-700">
          <Image src={`${basePath}/${character}_main.webp`} alt={CHARACTER_LABELS[character]} fill sizes="(max-width: 512px) 50vw, 240px" className="object-contain object-left-bottom pl-2 pt-2" priority />
          <div className="absolute right-3 top-4 max-w-[58%] rounded-2xl bg-white dark:bg-slate-900 px-4 py-3 shadow-md border border-white dark:border-slate-600">
            <p className="text-sm font-bold leading-relaxed text-slate-700 dark:text-slate-200">{CHARACTER_MESSAGES[character]}</p>
          </div>
        </div>
        <div className="flex justify-center gap-2 p-2">
          {(Object.keys(CHARACTER_LABELS) as Character[]).map((value) => (
            <button key={value} onClick={() => changeCharacter(value)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${character === value ? "bg-sky-600 text-white" : "bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300"}`}>
              {CHARACTER_LABELS[value]}
            </button>
          ))}
        </div>
      </section>

      <main className="max-w-lg mx-auto space-y-4">
        {medications.length === 0 ? (
          <div className="rounded-3xl bg-white dark:bg-slate-800 p-6 text-center shadow-sm border border-slate-100 dark:border-slate-700">
            <p className="text-lg font-black text-slate-700 dark:text-white">お薬がまだ登録されていません</p>
            <p className="mt-2 text-sm text-slate-500">設定から、飲んでいるお薬を登録してください。</p>
            <a href={`${basePath}/settings`} className="inline-block mt-4 rounded-2xl bg-sky-600 px-5 py-3 text-white font-bold">お薬を登録する</a>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto pb-1">
              <div className="flex gap-2 min-w-max">
                {SCHEDULED_TIMINGS.map((timing) => {
                  const count = medications.filter((medication) => medication.timings.includes(timing)).length;
                  return (
                    <button key={timing} onClick={() => { setShowAsNeeded(false); setSelectedTiming(timing); }} className={`rounded-2xl px-3 py-2 text-xs font-bold border ${!showAsNeeded && selectedTiming === timing ? "bg-sky-600 text-white border-sky-600" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700"}`}>
                      {TIMING_LABELS[timing]} <span className="opacity-70">{count}</span>
                    </button>
                  );
                })}
                <button onClick={() => setShowAsNeeded(true)} className={`rounded-2xl px-3 py-2 text-xs font-bold border ${showAsNeeded ? "bg-purple-600 text-white border-purple-600" : "bg-white dark:bg-slate-800 text-purple-600 border-purple-200 dark:border-slate-700"}`}>
                  頓服 {asNeededMedications.length}
                </button>
              </div>
            </div>

            {!showAsNeeded ? (
              <section className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-lg font-black text-slate-800 dark:text-white">{TIMING_LABELS[selectedTiming]}のお薬</h2>
                  <span className={`text-xs font-bold rounded-full px-3 py-1 ${timingMedications.length > 0 && completedCount === timingMedications.length ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"}`}>
                    {completedCount}/{timingMedications.length} 完了
                  </span>
                </div>
                {timingMedications.length === 0 ? (
                  <div className="rounded-3xl bg-white dark:bg-slate-800 p-6 text-center text-sm text-slate-500 border border-slate-100 dark:border-slate-700">この時間帯のお薬はありません。</div>
                ) : timingMedications.map((medication) => {
                  const checked = checkedIds.includes(medication.id);
                  return (
                    <article key={medication.id} className={`rounded-3xl border p-4 shadow-sm transition ${checked ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900" : "bg-white border-slate-100 dark:bg-slate-800 dark:border-slate-700"}`}>
                      <div className="flex gap-3 items-center">
                        {photoUrls[medication.id] ? (
                          <button onClick={() => setExpandedPhoto({ name: medication.name, url: photoUrls[medication.id] })} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={photoUrls[medication.id]} alt={`${medication.name}の写真`} className="h-full w-full object-cover" />
                          </button>
                        ) : <div className="h-16 w-16 shrink-0 rounded-2xl bg-sky-50 dark:bg-slate-700 grid place-items-center text-2xl">💊</div>}
                        <div className="min-w-0 flex-1">
                          <h3 className={`text-lg font-black break-words ${checked ? "text-emerald-700 dark:text-emerald-300" : "text-slate-800 dark:text-white"}`}>{medication.name}</h3>
                          {medication.memo && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 break-words">{medication.memo}</p>}
                        </div>
                      </div>
                      <button onClick={() => toggleMedication(medication.id)} className={`mt-4 w-full rounded-2xl py-3.5 text-base font-black transition active:scale-[0.98] ${checked ? "bg-emerald-600 text-white" : "bg-sky-600 text-white shadow-md shadow-sky-200 dark:shadow-none"}`}>
                        {checked ? "✓ 飲みました" : "飲んだ"}
                      </button>
                    </article>
                  );
                })}
              </section>
            ) : (
              <section className="space-y-3">
                <div className="px-1"><h2 className="text-lg font-black text-slate-800 dark:text-white">頓服のお薬</h2><p className="text-xs text-slate-500 mt-1">飲んだ時刻を記録します。用法・用量は処方の指示を優先してください。</p></div>
                {asNeededMedications.length === 0 ? <div className="rounded-3xl bg-white dark:bg-slate-800 p-6 text-center text-sm text-slate-500">頓服のお薬はありません。</div> : asNeededMedications.map((medication) => (
                  <article key={medication.id} className="rounded-3xl bg-white dark:bg-slate-800 border border-purple-100 dark:border-slate-700 p-4 shadow-sm">
                    <h3 className="text-lg font-black text-slate-800 dark:text-white">{medication.name}</h3>
                    {medication.memo && <p className="mt-1 text-sm text-slate-500">{medication.memo}</p>}
                    <button onClick={() => recordAsNeeded(medication)} className="mt-3 w-full rounded-2xl bg-purple-600 py-3 text-white font-black">今飲んだ</button>
                  </article>
                ))}
                {todayAsNeeded.length > 0 && <div className="rounded-3xl bg-purple-50 dark:bg-purple-950/20 p-4 border border-purple-100 dark:border-purple-900"><h3 className="font-bold text-purple-800 dark:text-purple-300 mb-2">今日の頓服記録</h3>{todayAsNeeded.map((record) => <p key={record.id} className="text-sm text-purple-700 dark:text-purple-300">{new Date(record.takenAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}　{record.medicationName}</p>)}</div>}
              </section>
            )}
          </>
        )}

        <aside className="rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-3 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
          このアプリは服薬記録を補助するツールです。医師・薬剤師の指示、お薬の説明書を必ず優先してください。
        </aside>
      </main>

      {expandedPhoto && (
        <button onClick={() => setExpandedPhoto(null)} className="fixed inset-0 z-[100] bg-black/80 p-6 grid place-items-center" aria-label="写真を閉じる">
          <span className="max-w-md w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={expandedPhoto.url} alt={`${expandedPhoto.name}の拡大写真`} className="max-h-[75vh] w-full object-contain rounded-2xl bg-white" />
            <span className="mt-3 block text-center text-white font-bold">{expandedPhoto.name}　タップして閉じる</span>
          </span>
        </button>
      )}
    </div>
  );
}
