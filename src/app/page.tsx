"use client";

/* eslint-disable @next/next/no-img-element -- IndexedDBのBlob URLはnext/imageで最適化できないため */

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
  getMedicationCheckGroup,
  getMedicationDoseLabel,
  getMedicationUnitLabel,
  getSuggestedTiming,
  getTimingGroup,
  GROUP_TIMINGS,
  HomeTiming,
  isMedicationScheduledForAppDate,
  Medication,
  MedicationCheckGroup,
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
  wake_up: "saku",
  morning: "saku",
  lunch: "lux",
  dinner: "noct",
  between_meals: "lux",
  bedtime: "noct",
  as_needed: "noct",
};

const CHARACTER_LABELS: Record<Character, string> = { noct: "ノクト", lux: "ルクス", saku: "朔" };
const CHARACTER_IMAGES: Record<Character, Record<CharacterScene, string>> = {
  noct: { main: "noct.main.png", ed: "noct.ed.png", ok: "noct.ok.png", good: "noct.good.png" },
  lux: { main: "lux.main.png", ed: "lux.ed.png", ok: "lux.ok.png", good: "lux.good.png" },
  saku: { main: "saku.main.png", ed: "saku.ed.png", ok: "saku.ok.png", good: "saku.good.png" },
};

const GROUP_MESSAGES: Record<HomeTiming, string> = {
  wake_up: "おはようございます。\n起きたときのお薬を確認しよう。",
  morning: "おはようございます。\n朝のお薬を確認しよう。",
  lunch: "お昼のお薬だよ。\n飲んだらチェックしてね！",
  dinner: "こんばんは。\n夕方のお薬を確認しよう。",
  between_meals: "食間のお薬だよ。\n処方された時間を確認してね。",
  bedtime: "今日もおつかれさま。\n寝る前のお薬だよ。",
  as_needed: "飲む前に用法・用量を\nもう一度確認しよう。",
};

const SCENE_MESSAGES: Record<Exclude<CharacterScene, "main">, string> = {
  ed: "お薬を確認して、\n飲んだら記録してね。",
  ok: "飲んだ記録ができたね！",
  good: "この時間のお薬は完了！\nよくできました。",
};

const TAB_STYLES: Record<HomeTiming, { icon: string; active: string }> = {
  wake_up: { icon: "morning.webp", active: "bg-cyan-600 text-white shadow-cyan-500/30" },
  morning: { icon: "morning.webp", active: "bg-amber-500 text-white shadow-amber-500/30" },
  lunch: { icon: "lunch.webp", active: "bg-sky-500 text-white shadow-sky-500/30" },
  dinner: { icon: "dinner.webp", active: "bg-orange-500 text-white shadow-orange-500/30" },
  between_meals: { icon: "medicine192.png", active: "bg-teal-600 text-white shadow-teal-500/30" },
  bedtime: { icon: "bedtime.webp", active: "bg-indigo-500 text-white shadow-indigo-500/30" },
  as_needed: { icon: "medicine192.png", active: "bg-purple-600 text-white shadow-purple-500/30" },
};

const GROUP_MINUTES: Record<MedicationTimingGroup, number> = {
  wake_up: 6 * 60 + 30,
  morning: 8 * 60,
  lunch: 12 * 60 + 30,
  dinner: 18 * 60 + 30,
  between_meals: 15 * 60,
  bedtime: 22 * 60,
};

const CHECK_GROUP_LABELS: Record<Exclude<MedicationCheckGroup, "individual">, string> = {
  solid: "錠剤・カプセル",
  packet: "粉薬",
  liquid: "液剤",
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const getAvailableTabs = (medications: Medication[], appDate: string): HomeTiming[] => {
  const scheduled = SCHEDULED_TIMING_GROUPS.filter((group) => medications.some((medication) =>
    isMedicationScheduledForAppDate(medication, appDate) && GROUP_TIMINGS[group].some((timing) => medication.timings.includes(timing))
  ));
  return medications.some((medication) => medication.timings.includes("as_needed")) ? [...scheduled, "as_needed"] : scheduled;
};

const getClosestAvailableTab = (medications: Medication[], appDate: string): HomeTiming | null => {
  const available = getAvailableTabs(medications, appDate);
  const scheduled = available.filter((tab): tab is MedicationTimingGroup => tab !== "as_needed");
  if (scheduled.length === 0) return available[0] ?? null;
  const suggested = getTimingGroup(getSuggestedTiming());
  if (scheduled.includes(suggested)) return suggested;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  return scheduled.reduce((closest, group) => Math.abs(GROUP_MINUTES[group] - minutes) < Math.abs(GROUP_MINUTES[closest] - minutes) ? group : closest);
};

const getFormattedDate = () => {
  const adjusted = new Date();
  adjusted.setHours(adjusted.getHours() - 4);
  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
  return `${adjusted.getMonth() + 1}月${adjusted.getDate()}日（${dayNames[adjusted.getDay()]}）の服薬予定`;
};

const getTimingMedications = (medications: Medication[], timing: ScheduledTiming, appDate: string) =>
  medications.filter((medication) => medication.timings.includes(timing) && isMedicationScheduledForAppDate(medication, appDate));

const isTimingGroupComplete = (group: MedicationTimingGroup, medications: Medication[], records: DailyMedicationRecords, appDate: string) => {
  const timingsWithMedication = GROUP_TIMINGS[group].filter((timing) => getTimingMedications(medications, timing, appDate).length > 0);
  return timingsWithMedication.length > 0 && timingsWithMedication.every((timing) => {
    const checkedIds = records[appDate]?.[timing]?.checkedMedicationIds ?? [];
    return getTimingMedications(medications, timing, appDate).every((medication) => checkedIds.includes(medication.id));
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
  const availableTabs = useMemo(() => getAvailableTabs(medications, today), [medications, today]);
  const asNeededMedications = useMemo(() => medications.filter((medication) => medication.timings.includes("as_needed")), [medications]);
  const todayAsNeeded = asNeededRecords.filter((record) => getAppDateString(new Date(record.takenAt)) === today);
  const activeTab = selectedTab && availableTabs.includes(selectedTab) ? selectedTab : getClosestAvailableTab(medications, today);
  const character = activeTab ? GROUP_CHARACTER[activeTab] : "noct";
  const baseCharacterScene: CharacterScene = activeTab && activeTab !== "as_needed" ? isTimingGroupComplete(activeTab, medications, records, today) ? "good" : "ed" : "main";
  const characterScene = characterSceneOverride ?? baseCharacterScene;
  const message = characterScene === "main" ? activeTab ? GROUP_MESSAGES[activeTab] : "設定からお薬を登録してね。" : SCENE_MESSAGES[characterScene];
  const characterImage = CHARACTER_IMAGES[character][characterScene];

  const showCharacterScene = (scene: CharacterScene, duration = 1400) => {
    if (characterSceneTimer.current) window.clearTimeout(characterSceneTimer.current);
    setCharacterSceneOverride(scene);
    characterSceneTimer.current = window.setTimeout(() => { setCharacterSceneOverride(null); characterSceneTimer.current = null; }, duration);
  };

  useEffect(() => {
    characterSceneTimer.current = window.setTimeout(() => { setCharacterSceneOverride(null); characterSceneTimer.current = null; }, 1400);
    const hydrateTimer = window.setTimeout(() => {
      const storedMedications = readMedications();
      setMedications(storedMedications);
      setSelectedTab(getClosestAvailableTab(storedMedications, getAppDateString()));
      setMounted(true);
      try {
        const daily = JSON.parse(localStorage.getItem(DAILY_RECORDS_STORAGE_KEY) || "{}");
        const asNeeded = JSON.parse(localStorage.getItem(AS_NEEDED_RECORDS_STORAGE_KEY) || "[]");
        setRecords(daily && typeof daily === "object" ? daily : {});
        setAsNeededRecords(Array.isArray(asNeeded) ? asNeeded : []);
      } catch { setRecords({}); setAsNeededRecords([]); }
    }, 0);
    const handleBeforeInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as BeforeInstallPromptEvent); };
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
      photos.forEach((photo, id) => { const url = URL.createObjectURL(photo.blob); next[id] = url; activeUrls.push(url); });
      setPhotoUrls(next);
    });
    return () => activeUrls.forEach((url) => URL.revokeObjectURL(url));
  }, [medications, mounted]);

  const saveRecords = (next: DailyMedicationRecords) => { setRecords(next); localStorage.setItem(DAILY_RECORDS_STORAGE_KEY, JSON.stringify(next)); };

  const toggleMedicationIds = (timing: ScheduledTiming, medicationIds: number[]) => {
    const timingMedications = getTimingMedications(medications, timing, today);
    const previousIds = records[today]?.[timing]?.checkedMedicationIds ?? [];
    const allChecked = medicationIds.every((id) => previousIds.includes(id));
    const nextIds = allChecked ? previousIds.filter((id) => !medicationIds.includes(id)) : [...new Set([...previousIds, ...medicationIds])];
    const completed = timingMedications.length > 0 && timingMedications.every((medication) => nextIds.includes(medication.id));
    saveRecords({ ...records, [today]: { ...records[today], [timing]: { checkedMedicationIds: nextIds, completed } } });
    if (allChecked) {
      if (characterSceneTimer.current) window.clearTimeout(characterSceneTimer.current);
      setCharacterSceneOverride(null);
    } else showCharacterScene("ok");
  };

  const recordAsNeeded = (medication: Medication) => {
    const takenAt = new Date().toISOString();
    const next: AsNeededRecord[] = [{ id: `${takenAt}-${medication.id}-${asNeededRecords.length}`, medicationId: medication.id, medicationName: medication.name, takenAt, dose: medication.dose, unitLabel: getMedicationUnitLabel(medication) }, ...asNeededRecords];
    setAsNeededRecords(next);
    localStorage.setItem(AS_NEEDED_RECORDS_STORAGE_KEY, JSON.stringify(next));
    showCharacterScene("ok");
  };

  const medicationRow = (medication: Medication, checked = false) => (
    <div key={medication.id} className="flex items-center gap-3 py-2">
      {photoUrls[medication.id] ? <button type="button" onClick={() => setExpandedPhoto({ name: medication.name, url: photoUrls[medication.id] })} className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border-2 border-sky-100 bg-white"><img src={photoUrls[medication.id]} alt={`${medication.name}の写真`} className="h-full w-full object-cover" /></button> : <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-sky-50 text-2xl dark:bg-slate-700">💊</div>}
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-baseline gap-x-2"><h4 className={`break-words text-base font-black ${checked ? "text-emerald-700 line-through dark:text-emerald-300" : "text-slate-800 dark:text-white"}`}>{medication.name}</h4><span className="shrink-0 text-sm font-black text-sky-700 dark:text-sky-300">{getMedicationDoseLabel(medication)}</span></div>{medication.memo && <p className="mt-1 break-words text-xs text-slate-500 dark:text-slate-400">{medication.memo}</p>}</div>
      {checked && <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500 text-sm font-black text-white">✓</span>}
    </div>
  );

  const renderCheckGroup = (timing: ScheduledTiming, group: Exclude<MedicationCheckGroup, "individual">, groupMedications: Medication[]) => {
    const checkedIds = records[today]?.[timing]?.checkedMedicationIds ?? [];
    const complete = groupMedications.every((medication) => checkedIds.includes(medication.id));
    return <article key={group} className={`rounded-3xl border p-4 shadow-sm ${complete ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30" : "border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800"}`}><h3 className="text-sm font-black text-slate-500 dark:text-slate-300">{CHECK_GROUP_LABELS[group]}</h3><div className="mt-1 divide-y divide-slate-100 dark:divide-slate-700">{groupMedications.map((medication) => medicationRow(medication, checkedIds.includes(medication.id)))}</div><button type="button" onClick={() => toggleMedicationIds(timing, groupMedications.map((medication) => medication.id))} className={`mt-3 w-full min-h-12 rounded-2xl py-3.5 text-base font-black text-white active:scale-[0.98] ${complete ? "bg-emerald-600" : "bg-sky-600 shadow-md shadow-sky-200 dark:shadow-none"}`}>{complete ? "✓ 取り消す" : group === "solid" ? "まとめて飲んだ" : "飲んだ"}</button></article>;
  };

  const renderTiming = (timing: ScheduledTiming) => {
    const timingMedications = getTimingMedications(medications, timing, today);
    if (timingMedications.length === 0) return null;
    const grouped = {
      solid: timingMedications.filter((medication) => getMedicationCheckGroup(medication) === "solid"),
      packet: timingMedications.filter((medication) => getMedicationCheckGroup(medication) === "packet"),
      liquid: timingMedications.filter((medication) => getMedicationCheckGroup(medication) === "liquid"),
      individual: timingMedications.filter((medication) => getMedicationCheckGroup(medication) === "individual"),
    };
    return <section key={timing} className="space-y-3"><h2 className="flex items-center gap-2 px-1 text-lg font-black text-slate-800 dark:text-white"><span className="h-2 w-2 rounded-full bg-sky-500" />{TIMING_LABELS[timing]}</h2>{(["solid", "packet", "liquid"] as const).map((group) => grouped[group].length > 0 ? renderCheckGroup(timing, group, grouped[group]) : null)}{grouped.individual.map((medication) => { const checked = records[today]?.[timing]?.checkedMedicationIds?.includes(medication.id) ?? false; return <article key={medication.id} className={`rounded-3xl border p-4 shadow-sm ${checked ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30" : "border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800"}`}>{medicationRow(medication, checked)}<button type="button" onClick={() => toggleMedicationIds(timing, [medication.id])} className={`mt-3 w-full min-h-12 rounded-2xl py-3.5 text-base font-black text-white ${checked ? "bg-emerald-600" : "bg-sky-600"}`}>{checked ? "✓ 取り消す" : "飲んだ"}</button></article>; })}</section>;
  };

  if (!mounted) return <div className="min-h-full grid place-items-center text-slate-500 font-bold">読み込み中...</div>;

  return (
    <div className="flex min-h-full flex-col bg-gray-50 dark:bg-gray-900">
      <header className="flex w-full items-center justify-between border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-slate-800"><div className="flex items-center gap-2"><Image src={`${basePath}/medicine192.png`} alt="まいにち内服のロゴ" width={28} height={28} className="object-contain" /><span className="text-base font-bold text-slate-800 dark:text-white">まいにち内服</span></div>{installPrompt && <button type="button" onClick={async () => { await installPrompt.prompt(); setInstallPrompt(null); }} className="min-h-8 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-bold text-white animate-pulse">📲 インストール</button>}</header>

      <section className="sticky top-0 z-20 flex-shrink-0 border-b border-gray-200 bg-gray-50/95 px-4 pb-4 pt-4 shadow-sm backdrop-blur-sm dark:border-gray-800 dark:bg-gray-900/95">
        <h1 className="text-center text-lg font-black text-slate-800 dark:text-white">{getFormattedDate()}</h1>
        <div className="relative flex h-[190px] items-center justify-center"><div className="mr-24 sm:mr-32"><Image key={`${character}-${characterScene}-${activeTab}`} src={`${basePath}/${characterImage}`} alt={`${CHARACTER_LABELS[character]}。${message.replace("\n", " ")}`} width={175} height={175} className="animate-float-in-soft object-contain drop-shadow-lg" preload /></div><div className="pop-speech-bubble select-none"><p className="whitespace-pre-line text-center text-sm font-bold leading-relaxed text-sky-600">{message}</p></div></div>

        {availableTabs.length > 0 && <div className="mt-2 flex gap-1 overflow-x-auto rounded-2xl bg-gray-100 p-1 dark:bg-slate-800">{availableTabs.map((tab) => { const active = activeTab === tab; const done = tab !== "as_needed" && isTimingGroupComplete(tab, medications, records, today); const style = TAB_STYLES[tab]; return <button type="button" key={tab} onClick={() => setSelectedTab(tab)} className={`relative flex min-w-[62px] flex-1 flex-col items-center rounded-xl px-1 py-2 text-[11px] font-black transition ${active ? `${style.active} shadow-md` : "text-slate-500 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700"}`}><Image src={`${basePath}/${style.icon}`} alt="" width={25} height={25} className="mb-0.5 object-contain" /><span>{TIMING_GROUP_LABELS[tab]}</span>{done && <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-[9px] text-white ring-2 ring-white">✓</span>}</button>; })}</div>}
      </section>

      <main className="mx-auto w-full max-w-lg flex-1 space-y-5 px-4 py-5">
        {availableTabs.length === 0 && <section className="rounded-3xl border border-slate-100 bg-white p-7 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800"><div className="text-5xl">💊</div><h2 className="mt-3 text-xl font-black text-slate-800 dark:text-white">お薬を登録しましょう</h2><p className="mt-2 text-sm leading-relaxed text-slate-500">服用タイミングや1回量を登録すると、今日必要な時間帯だけ表示されます。</p><Link href="/settings" className="mt-5 inline-flex min-h-12 items-center rounded-2xl bg-sky-600 px-6 py-3 font-black text-white">設定を開く</Link></section>}

        {activeTab && activeTab !== "as_needed" && GROUP_TIMINGS[activeTab].map(renderTiming)}

        {activeTab === "as_needed" && <section className="space-y-3"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">処方された用法・用量を確認して記録してください。飲むべきか迷う場合は、アプリで判断せず医師または薬剤師へ相談してください。</div>{asNeededMedications.map((medication) => <article key={medication.id} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">{medicationRow(medication)}<button type="button" onClick={() => recordAsNeeded(medication)} className="mt-3 w-full min-h-12 rounded-2xl bg-purple-600 py-3.5 text-base font-black text-white">今飲んだ時刻を記録する</button></article>)}{todayAsNeeded.length > 0 && <div className="rounded-3xl bg-purple-50 p-4 dark:bg-purple-950/20"><h2 className="font-black text-purple-800 dark:text-purple-300">今日の頓服記録</h2>{todayAsNeeded.map((record) => <p key={record.id} className="mt-2 text-sm text-purple-700 dark:text-purple-300">{new Date(record.takenAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}　{record.medicationName}{record.dose && record.unitLabel ? ` ${record.dose}${record.unitLabel}` : ""}</p>)}</div>}</section>}
      </main>

      {expandedPhoto && <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setExpandedPhoto(null)}><div className="w-full max-w-lg" onClick={(event) => event.stopPropagation()}><div className="mb-3 flex items-center justify-between text-white"><p className="font-black">{expandedPhoto.name}</p><button type="button" onClick={() => setExpandedPhoto(null)} className="grid h-11 w-11 place-items-center rounded-full bg-white/20 text-2xl">×</button></div><img src={expandedPhoto.url} alt={`${expandedPhoto.name}の拡大写真`} className="max-h-[75vh] w-full rounded-3xl bg-white object-contain" /></div></div>}
    </div>
  );
}
