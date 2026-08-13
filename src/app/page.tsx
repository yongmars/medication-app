"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { getMedicationPhotos } from "../lib/medicationPhotos";
import {
  AS_NEEDED_RECORDS_STORAGE_KEY,
  AsNeededRecord,
  DAILY_RECORDS_STORAGE_KEY,
  DailyMedicationRecords,
  getAppDateString,
  getSuggestedTiming,
  getTimingGroup,
  GROUP_TIMINGS,
  HomeTiming,
  Medication,
  MedicationTimingGroup,
  readMedications,
  ScheduledTiming,
  SCHEDULED_TIMING_GROUPS,
  TIMING_GROUP_LABELS,
  TIMING_LABELS,
} from "../lib/medications";

type Character = "noct" | "lux" | "saku";
type CharacterScene = "main" | "ed" | "ok" | "good";

const GROUP_CHARACTER: Record<HomeTiming, Character> = {
  morning: "saku",
  lunch: "lux",
  dinner: "noct",
  bedtime: "noct",
  as_needed: "noct",
};

const CHARACTER_LABELS: Record<Character, string> = { noct: "ノクト", lux: "ルクス", saku: "朔" };
const CHARACTER_IMAGES: Record<Character, Record<CharacterScene, string>> = {
  noct: {
    main: "noct.main.png",
    ed: "noct.ed.png",
    ok: "noct.ok.png",
    good: "noct.good.png",
  },
  lux: {
    main: "lux.main.png",
    ed: "lux.ed.png",
    ok: "lux.ok.png",
    good: "lux.good.png",
  },
  saku: {
    main: "saku.main.png",
    ed: "saku.ed.png",
    ok: "saku.ok.png",
    good: "saku.good.png",
  },
};
const GROUP_MESSAGES: Record<HomeTiming, string> = {
  morning: "おはようございます。\n朝のお薬を確認しよう。",
  lunch: "お昼のお薬だよ。\n飲んだらチェックしてね！",
  dinner: "こんばんは。\n夕のお薬を確認しよう。",
  bedtime: "今日もおつかれさま。\n寝る前のお薬だよ。",
  as_needed: "飲む前に用法・用量を\nもう一度確認しよう。",
};

const SCENE_MESSAGES: Record<Exclude<CharacterScene, "main">, string> = {
  ed: "お薬を確認して、\n飲んだら記録してね。",
  ok: "飲んだ記録ができたよ！",
  good: "この時間帯のお薬は完了！\nよくできました。",
};

const TAB_STYLES: Record<HomeTiming, { icon: string; active: string }> = {
  morning: { icon: "morning.webp", active: "bg-amber-500 text-white shadow-amber-500/30" },
  lunch: { icon: "lunch.webp", active: "bg-sky-500 text-white shadow-sky-500/30" },
  dinner: { icon: "dinner.webp", active: "bg-orange-500 text-white shadow-orange-500/30" },
  bedtime: { icon: "bedtime.webp", active: "bg-indigo-500 text-white shadow-indigo-500/30" },
  as_needed: { icon: "medicine192.png", active: "bg-purple-600 text-white shadow-purple-500/30" },
};

const GROUP_MINUTES: Record<MedicationTimingGroup, number> = {
  morning: 8 * 60,
  lunch: 12 * 60 + 30,
  dinner: 18 * 60 + 30,
  bedtime: 22 * 60,
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const getAvailableTabs = (medications: Medication[]): HomeTiming[] => {
  const scheduled = SCHEDULED_TIMING_GROUPS.filter((group) =>
    medications.some((medication) => GROUP_TIMINGS[group].some((timing) => medication.timings.includes(timing)))
  );
  return medications.some((medication) => medication.timings.includes("as_needed"))
    ? [...scheduled, "as_needed"]
    : scheduled;
};

const getClosestAvailableTab = (medications: Medication[]): HomeTiming | null => {
  const available = getAvailableTabs(medications);
  const scheduled = available.filter((tab): tab is MedicationTimingGroup => tab !== "as_needed");
  if (scheduled.length === 0) return available[0] ?? null;
  const suggested = getTimingGroup(getSuggestedTiming());
  if (scheduled.includes(suggested)) return suggested;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return scheduled.reduce((closest, group) =>
    Math.abs(GROUP_MINUTES[group] - minutes) < Math.abs(GROUP_MINUTES[closest] - minutes) ? group : closest
  );
};

const getFormattedDate = () => {
  const adjusted = new Date();
  adjusted.setHours(adjusted.getHours() - 4);
  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
  return `${adjusted.getMonth() + 1}月${adjusted.getDate()}日（${dayNames[adjusted.getDay()]}）の服薬予定`;
};

const isTimingGroupComplete = (
  group: MedicationTimingGroup,
  medications: Medication[],
  records: DailyMedicationRecords,
  today: string
) => {
  const timingsWithMedication = GROUP_TIMINGS[group].filter((timing) =>
    medications.some((medication) => medication.timings.includes(timing))
  );
  return timingsWithMedication.length > 0 && timingsWithMedication.every((timing) => {
    const timingMedications = medications.filter((medication) => medication.timings.includes(timing));
    const checkedIds = records[today]?.[timing]?.checkedMedicationIds ?? [];
    return timingMedications.every((medication) => checkedIds.includes(medication.id));
  });
};

export default function Home() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const [mounted, setMounted] = useState(false);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [selectedTab, setSelectedTab] = useState<HomeTiming | null>(null);
  const [records, setRecords] = useState<DailyMedicationRecords>({});
  const [asNeededRecords, setAsNeededRecords] = useState<AsNeededRecord[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<number, string>>({});
  const [expandedPhoto, setExpandedPhoto] = useState<{ name: string; url: string } | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [characterSceneOverride, setCharacterSceneOverride] = useState<CharacterScene | null>("main");
  const characterSceneTimer = useRef<number | null>(null);

  const today = getAppDateString();
  const availableTabs = useMemo(() => getAvailableTabs(medications), [medications]);
  const asNeededMedications = useMemo(
    () => medications.filter((medication) => medication.timings.includes("as_needed")),
    [medications]
  );
  const todayAsNeeded = asNeededRecords.filter((record) => getAppDateString(new Date(record.takenAt)) === today);
  const activeTab = selectedTab && availableTabs.includes(selectedTab) ? selectedTab : getClosestAvailableTab(medications);
  const character = activeTab ? GROUP_CHARACTER[activeTab] : "noct";
  const baseCharacterScene: CharacterScene = activeTab && activeTab !== "as_needed"
    ? isTimingGroupComplete(activeTab, medications, records, today) ? "good" : "ed"
    : "main";
  const characterScene = characterSceneOverride ?? baseCharacterScene;
  const message = characterScene === "main"
    ? activeTab ? GROUP_MESSAGES[activeTab] : "設定からお薬を登録してね。"
    : SCENE_MESSAGES[characterScene];
  const characterImage = CHARACTER_IMAGES[character][characterScene];

  const showCharacterScene = (scene: CharacterScene, duration = 1400) => {
    if (characterSceneTimer.current) window.clearTimeout(characterSceneTimer.current);
    setCharacterSceneOverride(scene);
    characterSceneTimer.current = window.setTimeout(() => {
      setCharacterSceneOverride(null);
      characterSceneTimer.current = null;
    }, duration);
  };

  useEffect(() => {
    characterSceneTimer.current = window.setTimeout(() => {
      setCharacterSceneOverride(null);
      characterSceneTimer.current = null;
    }, 1400);
    const hydrateTimer = window.setTimeout(() => {
      const storedMedications = readMedications();
      setMedications(storedMedications);
      setSelectedTab(getClosestAvailableTab(storedMedications));
      setMounted(true);
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
      if (characterSceneTimer.current) window.clearTimeout(characterSceneTimer.current);
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

  const getMedicationsForTiming = (timing: ScheduledTiming) =>
    medications.filter((medication) => medication.timings.includes(timing));

  const toggleMedication = (timing: ScheduledTiming, medicationId: number) => {
    const timingMedications = getMedicationsForTiming(timing);
    const previousIds = records[today]?.[timing]?.checkedMedicationIds ?? [];
    const wasChecked = previousIds.includes(medicationId);
    const nextIds = previousIds.includes(medicationId)
      ? previousIds.filter((id) => id !== medicationId)
      : [...previousIds, medicationId];
    const completed = timingMedications.length > 0 && timingMedications.every((medication) => nextIds.includes(medication.id));
    saveRecords({
      ...records,
      [today]: {
        ...records[today],
        [timing]: { checkedMedicationIds: nextIds, completed },
      },
    });
    if (wasChecked) {
      if (characterSceneTimer.current) window.clearTimeout(characterSceneTimer.current);
      setCharacterSceneOverride(null);
    } else {
      showCharacterScene("ok");
    }
  };

  const isGroupComplete = (group: MedicationTimingGroup) => {
    return isTimingGroupComplete(group, medications, records, today);
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
    showCharacterScene("ok");
  };

  const renderMedicationCard = (medication: Medication, timing: ScheduledTiming) => {
    const checked = records[today]?.[timing]?.checkedMedicationIds?.includes(medication.id) ?? false;
    return (
      <article key={`${timing}-${medication.id}`} className={`rounded-3xl border p-4 shadow-sm transition-all ${checked ? "bg-emerald-50 border-emerald-200 opacity-80 dark:bg-emerald-950/30 dark:border-emerald-900" : "bg-white border-slate-100 dark:bg-slate-800 dark:border-slate-700"}`}>
        <div className="flex gap-3 items-center">
          {photoUrls[medication.id] ? (
            <button type="button" onClick={() => setExpandedPhoto({ name: medication.name, url: photoUrls[medication.id] })} className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border-2 border-sky-100 bg-white touch-manipulation">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrls[medication.id]} alt={`${medication.name}の写真`} className="h-full w-full object-cover" />
            </button>
          ) : <div className="h-16 w-16 shrink-0 rounded-2xl bg-sky-50 dark:bg-slate-700 grid place-items-center text-2xl">💊</div>}
          <div className="min-w-0 flex-1">
            <h3 className={`text-xl font-black break-words ${checked ? "line-through text-emerald-700 dark:text-emerald-300" : "text-slate-800 dark:text-white"}`}>{medication.name}</h3>
            {medication.memo && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 break-words">{medication.memo}</p>}
          </div>
          {checked && <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500 text-sm font-black text-white">✓</span>}
        </div>
        <button type="button" onClick={() => toggleMedication(timing, medication.id)} className={`mt-4 w-full min-h-12 rounded-2xl py-3.5 text-base font-black transition active:scale-[0.98] ${checked ? "bg-emerald-600 text-white" : "bg-sky-600 text-white shadow-md shadow-sky-200 dark:shadow-none"}`}>
          {checked ? "✓ 飲みました" : "飲んだ"}
        </button>
      </article>
    );
  };

  if (!mounted) return <div className="min-h-full grid place-items-center text-slate-500 font-bold">読み込み中...</div>;

  return (
    <div className="flex min-h-full flex-col bg-gray-50 dark:bg-gray-900">
      <header className="flex w-full items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-slate-800">
        <div className="flex items-center gap-2">
          <Image src={`${basePath}/medicine192.png`} alt="まいにち服薬のロゴ" width={28} height={28} className="object-contain" />
          <span className="text-base font-bold text-slate-800 dark:text-white">まいにち服薬</span>
        </div>
        {installPrompt && (
          <button type="button" onClick={async () => { await installPrompt.prompt(); setInstallPrompt(null); }} className="min-h-8 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-bold text-white animate-pulse">
            📥 インストール
          </button>
        )}
      </header>

      <section className="sticky top-0 z-20 flex-shrink-0 border-b border-gray-200 bg-gray-50/95 px-4 pb-4 pt-4 shadow-sm backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/95">
        <h1 className="text-center text-lg font-black text-slate-800 dark:text-white">{getFormattedDate()}</h1>
        <div className="relative flex h-[190px] items-center justify-center">
          <div className="mr-24 sm:mr-32">
            <Image key={`${character}-${characterScene}-${activeTab}`} src={`${basePath}/${characterImage}`} alt={`${CHARACTER_LABELS[character]}：${message.replace("\n", " ")}`} width={175} height={175} className="animate-float-in-soft object-contain drop-shadow-lg" priority />
          </div>
          <div className="pop-speech-bubble select-none">
            <p className="whitespace-pre-line text-center text-sm font-bold leading-relaxed text-sky-600">{message}</p>
          </div>
        </div>

        {availableTabs.length > 0 && (
          <div className="mt-2 flex justify-between gap-1 rounded-2xl bg-gray-100 p-1 dark:bg-slate-800">
            {availableTabs.map((tab) => {
              const active = activeTab === tab;
              const done = tab !== "as_needed" && isGroupComplete(tab);
              const style = TAB_STYLES[tab];
              return (
                <button key={tab} type="button" onClick={() => { setSelectedTab(tab); showCharacterScene("main"); }} className={`relative flex min-w-0 flex-1 touch-manipulation flex-col items-center justify-center rounded-xl px-1 py-2 transition-all duration-300 ${active ? `${style.active} scale-[1.03] font-bold shadow-md` : "text-slate-600 hover:bg-gray-200 dark:text-slate-400 dark:hover:bg-slate-700"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`${basePath}/${style.icon}`} alt="" className="h-7 w-7 shrink-0 object-contain" />
                  <span className="mt-0.5 truncate text-[10px] sm:text-xs">{TIMING_GROUP_LABELS[tab]}</span>
                  {done && <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full border border-white bg-emerald-500 text-[8px] text-white dark:border-slate-800">✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <main className="space-y-5 px-5 py-5">
        {medications.length === 0 ? (
          <div className="rounded-3xl border border-slate-100 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <p className="text-lg font-black text-slate-700 dark:text-white">お薬がまだ登録されていません</p>
            <p className="mt-2 text-sm text-slate-500">設定から、飲んでいるお薬を登録してください。</p>
            <Link href="/settings" className="mt-4 inline-block rounded-2xl bg-sky-600 px-5 py-3 font-bold text-white">お薬を登録する</Link>
          </div>
        ) : activeTab === "as_needed" ? (
          <section className="space-y-3">
            <div className="px-1">
              <h2 className="text-lg font-black text-slate-800 dark:text-white">頓服のお薬</h2>
              <p className="mt-1 text-xs text-slate-500">飲んだ時刻を記録します。用法・用量は処方の指示を優先してください。</p>
            </div>
            {asNeededMedications.map((medication) => (
              <article key={medication.id} className="rounded-3xl border border-purple-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-center gap-3">
                  {photoUrls[medication.id] ? (
                    <button type="button" onClick={() => setExpandedPhoto({ name: medication.name, url: photoUrls[medication.id] })} className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border-2 border-purple-100 bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoUrls[medication.id]} alt={`${medication.name}の写真`} className="h-full w-full object-cover" />
                    </button>
                  ) : <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-purple-50 text-2xl dark:bg-slate-700">💊</div>}
                  <div className="min-w-0"><h3 className="text-lg font-black text-slate-800 dark:text-white">{medication.name}</h3>{medication.memo && <p className="mt-1 text-sm text-slate-500">{medication.memo}</p>}</div>
                </div>
                <button type="button" onClick={() => recordAsNeeded(medication)} className="mt-3 w-full min-h-12 rounded-2xl bg-purple-600 py-3 font-black text-white">今飲んだ</button>
              </article>
            ))}
            {todayAsNeeded.length > 0 && <div className="rounded-3xl border border-purple-100 bg-purple-50 p-4 dark:border-purple-900 dark:bg-purple-950/20"><h3 className="mb-2 font-bold text-purple-800 dark:text-purple-300">今日の頓服記録</h3>{todayAsNeeded.map((record) => <p key={record.id} className="text-sm text-purple-700 dark:text-purple-300">{new Date(record.takenAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}　{record.medicationName}</p>)}</div>}
          </section>
        ) : activeTab ? (
          <section className="space-y-6">
            {GROUP_TIMINGS[activeTab].map((timing) => {
              const timingMedications = getMedicationsForTiming(timing);
              if (timingMedications.length === 0) return null;
              const checkedIds = records[today]?.[timing]?.checkedMedicationIds ?? [];
              const completedCount = timingMedications.filter((medication) => checkedIds.includes(medication.id)).length;
              return (
                <div key={timing} className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <h2 className="text-lg font-black text-slate-800 dark:text-white">{TIMING_LABELS[timing]}のお薬</h2>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${completedCount === timingMedications.length ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"}`}>{completedCount}/{timingMedications.length} 完了</span>
                  </div>
                  {timingMedications.map((medication) => renderMedicationCard(medication, timing))}
                </div>
              );
            })}
          </section>
        ) : null}

        <aside className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
          このアプリは服薬記録を補助するツールです。医師・薬剤師の指示、お薬の説明書を必ず優先してください。
        </aside>
      </main>

      {expandedPhoto && (
        <button type="button" onClick={() => setExpandedPhoto(null)} className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-6" aria-label="写真を閉じる">
          <span className="w-full max-w-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={expandedPhoto.url} alt={`${expandedPhoto.name}の拡大写真`} className="max-h-[75vh] w-full rounded-2xl bg-white object-contain" />
            <span className="mt-3 block text-center font-bold text-white">{expandedPhoto.name}　タップして閉じる</span>
          </span>
        </button>
      )}
    </div>
  );
}
