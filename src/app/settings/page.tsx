"use client";

/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  clearMedicationPhotos,
  compressMedicationPhoto,
  deleteMedicationPhoto,
  getMedicationPhoto,
  saveMedicationPhoto,
} from "../../lib/medicationPhotos";
import {
  ALL_TIMINGS,
  DAILY_RECORDS_STORAGE_KEY,
  DailyMedicationRecords,
  getAppDateString,
  getMedicationDoseLabel,
  isMedicationScheduledForAppDate,
  Medication,
  MedicationScheduleType,
  MedicationTiming,
  MedicationUnit,
  readMedications,
  saveMedications,
  SCHEDULED_TIMINGS,
  TIMING_LABELS,
  UNIT_LABELS,
  Weekday,
  WEEKDAY_LABELS,
} from "../../lib/medications";
import {
  isNotificationSupported,
  LocalNotificationSettings,
  readNotificationSettings,
  saveNotificationSettings,
} from "../../lib/localNotifications";

const DOSE_OPTIONS = ["0.25", "0.5", "1", "1.5", "2", "3", "4", "5", "6", "7", "8", "9", "10"];
const UNIT_OPTIONS: MedicationUnit[] = ["tablet", "capsule", "packet", "ml", "other"];
const UPDATE_VERSION = "1.0.2";
const UPDATE_READ_STORAGE_KEY = `medication-update-read-${UPDATE_VERSION}`;

interface MedicationForm {
  name: string;
  doseChoice: string;
  customDose: string;
  unit: MedicationUnit;
  customUnit: string;
  timings: MedicationTiming[];
  scheduleType: MedicationScheduleType;
  weekdays: Weekday[];
  separateCheck: boolean;
  memo: string;
}

const createEmptyForm = (): MedicationForm => ({
  name: "",
  doseChoice: "1",
  customDose: "",
  unit: "tablet",
  customUnit: "",
  timings: [],
  scheduleType: "daily",
  weekdays: [],
  separateCheck: false,
  memo: "",
});

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade-in" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <section className="flex max-h-[82vh] w-full max-w-lg flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl animate-scale-up dark:bg-slate-800" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-100 p-5 dark:border-slate-700">
          <h2 className="text-xl font-black text-slate-800 dark:text-white">{title}</h2>
          <button type="button" onClick={onClose} aria-label="閉じる" className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-2xl text-slate-500 dark:bg-slate-700 dark:text-slate-200">×</button>
        </header>
        <div className="custom-scrollbar overflow-y-auto p-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{children}</div>
        <footer className="border-t border-slate-100 p-4 dark:border-slate-700"><button type="button" onClick={onClose} className="w-full rounded-2xl bg-sky-600 py-3.5 text-base font-black text-white">閉じる</button></footer>
      </section>
    </div>
  );
}

export default function SettingsPage() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const [mounted, setMounted] = useState(false);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [form, setForm] = useState<MedicationForm>(createEmptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<LocalNotificationSettings | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [hasReadUpdate, setHasReadUpdate] = useState(false);
  const [modal, setModal] = useState<"updates" | "license" | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const hydrateTimer = window.setTimeout(() => {
      setMounted(true);
      setMedications(readMedications());
      setNotifications(readNotificationSettings());
      setNotificationPermission(isNotificationSupported() ? Notification.permission : "unsupported");
      setHasReadUpdate(localStorage.getItem(UPDATE_READ_STORAGE_KEY) === "true");
    }, 0);
    return () => window.clearTimeout(hydrateTimer);
  }, []);

  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  const resetForm = () => {
    setForm(createEmptyForm());
    setEditingId(null);
    setPhotoBlob(null);
    setRemovePhoto(false);
    setPhotoPreview((previous) => { if (previous) URL.revokeObjectURL(previous); return null; });
    if (cameraInput.current) cameraInput.current.value = "";
    if (galleryInput.current) galleryInput.current.value = "";
  };

  const persistMedicationList = (next: Medication[]) => {
    saveMedications(next);
    const appDate = getAppDateString();
    try {
      const records = JSON.parse(localStorage.getItem(DAILY_RECORDS_STORAGE_KEY) || "{}") as DailyMedicationRecords;
      const todayRecord = records[appDate];
      if (todayRecord) {
        SCHEDULED_TIMINGS.forEach((timing) => {
          const record = todayRecord[timing];
          if (!record) return;
          const requiredIds = next
            .filter((medication) => medication.timings.includes(timing) && isMedicationScheduledForAppDate(medication, appDate))
            .map((medication) => medication.id);
          record.completed = requiredIds.length > 0 && requiredIds.every((id) => record.checkedMedicationIds.includes(id));
        });
        localStorage.setItem(DAILY_RECORDS_STORAGE_KEY, JSON.stringify(records));
      }
    } catch {
      // 壊れた履歴には触れず、お薬の保存を優先します。
    }
  };

  const handlePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const blob = await compressMedicationPhoto(file);
      setPhotoBlob(blob);
      setRemovePhoto(false);
      setPhotoPreview((previous) => { if (previous) URL.revokeObjectURL(previous); return URL.createObjectURL(blob); });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "写真を読み込めませんでした。");
    }
  };

  const toggleTiming = (timing: MedicationTiming) => {
    setForm((current) => {
      if (timing === "as_needed") return { ...current, timings: current.timings.includes("as_needed") ? [] : ["as_needed"] };
      const withoutAsNeeded = current.timings.filter((value) => value !== "as_needed");
      return {
        ...current,
        timings: withoutAsNeeded.includes(timing) ? withoutAsNeeded.filter((value) => value !== timing) : [...withoutAsNeeded, timing],
      };
    });
  };

  const toggleWeekday = (weekday: Weekday) => {
    setForm((current) => ({
      ...current,
      weekdays: current.weekdays.includes(weekday) ? current.weekdays.filter((day) => day !== weekday) : [...current.weekdays, weekday].sort(),
    }));
  };

  const saveMedication = async () => {
    const name = form.name.trim();
    const dose = Number(form.doseChoice === "other" ? form.customDose : form.doseChoice);
    if (!name) return setMessage("お薬の名前を入力してください。");
    if (!Number.isFinite(dose) || dose <= 0) return setMessage("1回量は0より大きい数値を入力してください。");
    if (form.unit === "other" && !form.customUnit.trim()) return setMessage("その他の単位名を入力してください。");
    if (form.timings.length === 0) return setMessage("服用タイミングを1つ以上選んでください。");
    if (form.scheduleType === "weekdays" && form.weekdays.length === 0) return setMessage("服用する曜日を1つ以上選んでください。");
    setSaving(true);
    const id = editingId ?? Math.max(0, ...medications.map((medication) => medication.id)) + 1;
    const medication: Medication = {
      id,
      name,
      dose,
      unit: form.unit,
      customUnit: form.unit === "other" ? form.customUnit.trim() : undefined,
      timings: ALL_TIMINGS.filter((timing) => form.timings.includes(timing)),
      scheduleType: form.scheduleType,
      weekdays: form.scheduleType === "weekdays" ? form.weekdays : [],
      separateCheck: form.separateCheck,
      memo: form.memo.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    const next = editingId === null ? [...medications, medication] : medications.map((item) => item.id === editingId ? medication : item);
    try {
      if (removePhoto) await deleteMedicationPhoto(id);
      if (photoBlob) await saveMedicationPhoto(id, photoBlob);
      persistMedicationList(next);
      setMedications(next);
      setMessage(editingId === null ? "お薬を登録しました。" : "お薬の情報を更新しました。");
      resetForm();
      setIsFormOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = async (medication: Medication) => {
    resetForm();
    setIsFormOpen(true);
    setEditingId(medication.id);
    const doseString = String(medication.dose);
    setForm({
      name: medication.name,
      doseChoice: DOSE_OPTIONS.includes(doseString) ? doseString : "other",
      customDose: DOSE_OPTIONS.includes(doseString) ? "" : doseString,
      unit: medication.unit,
      customUnit: medication.customUnit || "",
      timings: medication.timings,
      scheduleType: medication.scheduleType,
      weekdays: medication.weekdays,
      separateCheck: medication.separateCheck,
      memo: medication.memo || "",
    });
    try {
      const photo = await getMedicationPhoto(medication.id);
      if (photo) setPhotoPreview(URL.createObjectURL(photo.blob));
    } catch { /* 写真なしでも編集を続けます */ }
    window.requestAnimationFrame(() => document.getElementById("medication-form")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const deleteMedication = async (medication: Medication) => {
    if (!confirm(`${medication.name}を削除しますか？ 過去の服薬履歴は残ります。`)) return;
    const next = medications.filter((item) => item.id !== medication.id);
    persistMedicationList(next);
    setMedications(next);
    try { await deleteMedicationPhoto(medication.id); } catch { /* 本体の削除を優先 */ }
    if (editingId === medication.id) resetForm();
    setMessage("お薬を削除しました。");
  };

  const updateNotifications = (next: LocalNotificationSettings) => { setNotifications(next); saveNotificationSettings(next); };
  const requestPermission = async () => { if (isNotificationSupported()) setNotificationPermission(await Notification.requestPermission()); };
  const openUpdateHistory = () => {
    localStorage.setItem(UPDATE_READ_STORAGE_KEY, "true");
    setHasReadUpdate(true);
    setModal("updates");
  };

  const resetAllData = async () => {
    if (!confirm("登録したお薬、服薬履歴、頓服記録、通知設定、写真をすべて削除します。元に戻せません。続けますか？")) return;
    Object.keys(localStorage).filter((key) => key.startsWith("medication-")).forEach((key) => localStorage.removeItem(key));
    try { await clearMedicationPhotos(); } catch { /* localStorageの初期化を優先 */ }
    setMedications([]);
    setNotifications(readNotificationSettings());
    resetForm();
    setMessage("アプリ内のデータを初期化しました。");
  };

  if (!mounted || !notifications) return <div className="min-h-full grid place-items-center text-slate-500 font-bold">読み込み中...</div>;

  return (
    <div className="min-h-full bg-slate-50 dark:bg-slate-900">
      <header className="flex w-full items-center border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-slate-800"><div className="flex items-center gap-2"><Image src={`${basePath}/medicine192.png`} alt="まいにち内服のロゴ" width={28} height={28} className="object-contain" /><span className="text-base font-bold text-slate-800 dark:text-white">まいにち内服</span></div></header>
      <main className="mx-auto max-w-lg space-y-5 px-4 py-5">
        <header className="text-center"><h1 className="text-2xl font-black text-slate-800 dark:text-white">お薬と設定</h1></header>
        {message && <button onClick={() => setMessage(null)} className="w-full rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm font-bold text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300">{message}　×</button>}

        <Link href="/medicine-list" className="block w-full rounded-3xl bg-gradient-to-r from-sky-500 to-blue-600 p-5 text-left text-white shadow-md transition-transform active:scale-[0.99]">
          <span className="block text-lg font-black">使用中の内服薬一覧</span>
          <span className="mt-1 block text-sm leading-relaxed text-sky-50">受診・調剤時や、もしものときの確認に使えます</span>
        </Link>

        <section className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <h2 className="text-lg font-black text-slate-800 dark:text-white">登録済みのお薬 ({medications.length})</h2>
          <div className="mt-3 space-y-3">
            {medications.length === 0 ? <p className="rounded-2xl bg-slate-50 p-4 text-center text-sm text-slate-500 dark:bg-slate-700 dark:text-slate-300">登録されているお薬はありません。</p> : medications.map((medication) => (
              <article key={medication.id} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-600">
                <div className="flex items-start justify-between gap-2"><h3 className="break-words font-black text-slate-800 dark:text-white">{medication.name}</h3><span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-xs font-black text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">1回 {getMedicationDoseLabel(medication)}</span></div>
                <div className="mt-2 flex flex-wrap gap-1">{medication.timings.map((timing) => <span key={timing} className="rounded-full bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-700 dark:bg-slate-700 dark:text-sky-300">{TIMING_LABELS[timing]}</span>)}</div>
                {medication.separateCheck && <span className="mt-2 inline-flex rounded-full bg-purple-50 px-2 py-1 text-[11px] font-bold text-purple-700 dark:bg-purple-950/30 dark:text-purple-300">別に飲む</span>}
                <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">{medication.scheduleType === "daily" ? "毎日" : medication.weekdays.map((day) => `${WEEKDAY_LABELS[day]}曜`).join("・")}</p>
                {medication.memo && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{medication.memo}</p>}
                <div className="mt-3 flex gap-2"><button onClick={() => void startEdit(medication)} className="flex-1 rounded-xl bg-slate-100 py-2 text-sm font-bold text-slate-700 dark:bg-slate-700 dark:text-white">編集する</button><button onClick={() => void deleteMedication(medication)} className="rounded-xl bg-red-50 px-4 py-2 text-sm font-bold text-red-600 dark:bg-red-950/30">削除</button></div>
              </article>
            ))}
          </div>
        </section>

        <section id="medication-form" className="scroll-mt-4 overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <button type="button" onClick={() => setIsFormOpen((open) => !open)} className="flex w-full items-center justify-between px-5 py-5 text-left font-bold text-slate-800 dark:text-white" aria-expanded={isFormOpen}>
            <span className="text-base">{editingId === null ? "＋ お薬を登録する" : "✏️ お薬を編集する"}</span><span className="text-sm text-slate-400">{isFormOpen ? "▲ 閉じる" : "▼ 開く"}</span>
          </button>
          {isFormOpen && <div className="space-y-5 border-t border-slate-100 px-4 pb-4 pt-4 dark:border-slate-700">
            {editingId !== null && <div className="flex justify-end"><button type="button" onClick={() => { resetForm(); setIsFormOpen(false); }} className="text-xs font-bold text-slate-500">編集をやめる</button></div>}
            <label className="block"><span className="text-sm font-bold text-slate-700 dark:text-slate-200">お薬の名前</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={80} placeholder="例：アムロジピン錠5mg" className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base dark:border-slate-600 dark:bg-slate-900" /></label>

            <div><label className="text-sm font-bold text-slate-700 dark:text-slate-200" htmlFor="dose">1回量</label><select id="dose" value={form.doseChoice} onChange={(event) => setForm({ ...form, doseChoice: event.target.value })} className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base dark:border-slate-600 dark:bg-slate-900">{DOSE_OPTIONS.map((dose) => <option key={dose} value={dose}>{dose}</option>)}<option value="other">その他（自由入力）</option></select>{form.doseChoice === "other" && <input inputMode="decimal" type="number" min="0.01" step="any" value={form.customDose} onChange={(event) => setForm({ ...form, customDose: event.target.value })} placeholder="0より大きい数値" className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base dark:border-slate-600 dark:bg-slate-900" />}</div>

            <div><p className="text-sm font-bold text-slate-700 dark:text-slate-200">単位</p><div className="mt-2 grid grid-cols-3 gap-2">{UNIT_OPTIONS.map((unit) => <button type="button" key={unit} onClick={() => setForm({ ...form, unit })} className={`rounded-xl border px-2 py-2.5 text-sm font-bold ${form.unit === unit ? "border-sky-600 bg-sky-600 text-white" : "border-slate-200 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"}`}>{UNIT_LABELS[unit]}</button>)}</div>{form.unit === "other" && <input value={form.customUnit} onChange={(event) => setForm({ ...form, customUnit: event.target.value })} maxLength={20} placeholder="単位名（例：本、滴）" className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base dark:border-slate-600 dark:bg-slate-900" />}</div>

            <fieldset><legend className="text-sm font-bold text-slate-700 dark:text-slate-200">他の薬とのまとめ方</legend><div className="mt-2 space-y-2"><label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 ${!form.separateCheck ? "border-sky-500 bg-sky-50 dark:bg-sky-950/30" : "border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-900"}`}><input type="radio" name="separate-check" checked={!form.separateCheck} onChange={() => setForm({ ...form, separateCheck: false })} className="mt-1" /><span><span className="block text-sm font-black text-slate-700 dark:text-slate-200">通常</span><span className="mt-0.5 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">同じタイミングの錠剤・カプセルとまとめる</span></span></label><label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 ${form.separateCheck ? "border-purple-500 bg-purple-50 dark:bg-purple-950/30" : "border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-900"}`}><input type="radio" name="separate-check" checked={form.separateCheck} onChange={() => setForm({ ...form, separateCheck: true })} className="mt-1" /><span><span className="block text-sm font-black text-slate-700 dark:text-slate-200">この薬は別に飲む</span><span className="mt-0.5 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">まとめ飲みには含めず、この薬だけで記録します。</span></span></label></div><p className="mt-2 text-xs leading-relaxed text-slate-500">服用方法をアプリが判断する設定ではありません。医師・薬剤師の指示に合わせて選択してください。</p></fieldset>

            <div><p className="text-sm font-bold text-slate-700 dark:text-slate-200">服用タイミング（複数選択可）</p><p className="mt-1 text-xs text-slate-500">頓服を選ぶと、ほかのタイミングは解除されます。</p><div className="mt-2 grid grid-cols-2 gap-2">{ALL_TIMINGS.map((timing) => <button type="button" key={timing} onClick={() => toggleTiming(timing)} className={`rounded-xl border px-3 py-2.5 text-sm font-bold ${form.timings.includes(timing) ? "border-sky-600 bg-sky-600 text-white" : "border-slate-200 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"}`}>{TIMING_LABELS[timing]}</button>)}</div></div>

            {!form.timings.includes("as_needed") && <div><p className="text-sm font-bold text-slate-700 dark:text-slate-200">服用する曜日</p><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setForm({ ...form, scheduleType: "daily", weekdays: [] })} className={`rounded-xl border py-2.5 text-sm font-bold ${form.scheduleType === "daily" ? "border-sky-600 bg-sky-600 text-white" : "border-slate-200 dark:border-slate-600"}`}>毎日</button><button type="button" onClick={() => setForm({ ...form, scheduleType: "weekdays" })} className={`rounded-xl border py-2.5 text-sm font-bold ${form.scheduleType === "weekdays" ? "border-sky-600 bg-sky-600 text-white" : "border-slate-200 dark:border-slate-600"}`}>曜日指定</button></div>{form.scheduleType === "weekdays" && <div className="mt-2 grid grid-cols-7 gap-1">{WEEKDAY_LABELS.map((label, index) => <button type="button" key={label} onClick={() => toggleWeekday(index as Weekday)} className={`aspect-square rounded-full text-xs font-black ${form.weekdays.includes(index as Weekday) ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200"}`}>{label}</button>)}</div>}</div>}

            <label className="block"><span className="text-sm font-bold text-slate-700 dark:text-slate-200">服用メモ（任意）</span><textarea value={form.memo} onChange={(event) => setForm({ ...form, memo: event.target.value })} maxLength={200} rows={3} placeholder="処方された内容や注意点を入力してください。" className="mt-1 w-full resize-none rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm dark:border-slate-600 dark:bg-slate-900" /></label>

            <div><p className="text-sm font-bold text-slate-700 dark:text-slate-200">お薬の写真（任意・1枚）</p><p className="mt-1 text-xs text-slate-500">写真はこの端末内だけに保存されます。</p><input ref={cameraInput} type="file" accept="image/*" capture="environment" onChange={(event) => void handlePhoto(event)} className="hidden" /><input ref={galleryInput} type="file" accept="image/*" onChange={(event) => void handlePhoto(event)} className="hidden" /><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => cameraInput.current?.click()} className="rounded-xl bg-sky-50 py-3 text-sm font-bold text-sky-700 dark:bg-slate-700 dark:text-sky-300">カメラで撮る</button><button type="button" onClick={() => galleryInput.current?.click()} className="rounded-xl bg-slate-100 py-3 text-sm font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-200">画像を選ぶ</button></div>{photoPreview && <div className="mt-3"><div className="h-40 overflow-hidden rounded-2xl bg-slate-100"><img src={photoPreview} alt="登録するお薬の写真" className="h-full w-full object-contain" /></div><button type="button" onClick={() => { setPhotoBlob(null); setRemovePhoto(true); setPhotoPreview(null); }} className="mt-2 w-full rounded-xl bg-red-50 py-2 text-sm font-bold text-red-600">写真を削除する</button></div>}</div>
            <button type="button" onClick={() => void saveMedication()} disabled={saving} className="w-full rounded-2xl bg-sky-600 py-4 text-base font-black text-white disabled:opacity-50">{saving ? "保存中…" : editingId === null ? "お薬を登録する" : "変更を保存する"}</button>
          </div>}
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <button type="button" onClick={() => setIsNotificationOpen((open) => !open)} className="flex w-full items-center justify-between px-5 py-5 text-left font-bold text-slate-800 dark:text-white" aria-expanded={isNotificationOpen}>
            <span><span className="block text-base">服薬のお知らせ</span><span className="mt-1 block text-xs font-normal text-slate-500">その日に対象のお薬がある時間だけ通知します。</span></span><span className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${notifications.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{notifications.enabled ? "オン" : "オフ"}</span><span className="text-sm text-slate-400">{isNotificationOpen ? "▲ 閉じる" : "▼ 開く"}</span></span>
          </button>
          {isNotificationOpen && <div className="border-t border-slate-100 px-4 pb-4 pt-4 dark:border-slate-700"><div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-slate-700"><span className="text-sm font-bold text-slate-700 dark:text-slate-200">通知機能</span><button type="button" onClick={() => updateNotifications({ ...notifications, enabled: !notifications.enabled })} className={`rounded-full px-3 py-2 text-xs font-bold ${notifications.enabled ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"}`}>{notifications.enabled ? "オン" : "オフ"}</button></div>{notificationPermission !== "granted" && <button onClick={() => void requestPermission()} disabled={notificationPermission === "unsupported" || notificationPermission === "denied"} className="mt-3 w-full rounded-xl bg-amber-100 py-2.5 text-sm font-bold text-amber-800 disabled:opacity-60 dark:bg-amber-950/30 dark:text-amber-300">{notificationPermission === "unsupported" ? "このブラウザは通知に対応していません" : notificationPermission === "denied" ? "通知がブラウザで拒否されています" : "通知を許可する"}</button>}<div className="mt-4 space-y-2">{SCHEDULED_TIMINGS.map((timing) => <div key={timing} className="flex items-center gap-2 rounded-xl bg-slate-50 p-2 dark:bg-slate-700"><label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200"><input type="checkbox" checked={notifications.slots[timing].enabled} onChange={(event) => updateNotifications({ ...notifications, slots: { ...notifications.slots, [timing]: { ...notifications.slots[timing], enabled: event.target.checked } } })} />{TIMING_LABELS[timing]}</label><input type="time" value={notifications.slots[timing].time} onChange={(event) => updateNotifications({ ...notifications, slots: { ...notifications.slots, [timing]: { ...notifications.slots[timing], time: event.target.value } } })} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800" /></div>)}</div><p className="mt-3 text-xs leading-relaxed text-slate-500">時刻は例です。処方の指示に合わせて変更してください。端末やブラウザの状態によって、アプリを完全に閉じている間は通知されない場合があります。</p></div>}
        </section>

        <div className="border-t border-slate-200 pt-5 dark:border-slate-700">
          <button type="button" onClick={openUpdateHistory} className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm dark:border-slate-700 dark:bg-slate-800"><span className="flex items-center gap-2 font-black text-slate-700 dark:text-white">🆙 アップデート情報{!hasReadUpdate && <span className="rounded border border-red-200 bg-red-100 px-1.5 py-0.5 text-[10px] font-black text-red-600 dark:border-red-900/30 dark:bg-red-950/30 dark:text-red-400">NEW!</span>}</span><span className="text-sm font-bold text-slate-400">Ver. 1.0.2</span></button>
          <button type="button" onClick={() => setModal("license")} className="mt-3 flex w-full items-center rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left font-black text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">📄 ライセンス情報</button>
          <p className="mt-6 text-center text-sm font-bold text-slate-500">作った人： <a href="https://note.com/note_yongmars" target="_blank" rel="noreferrer" className="text-sky-600 underline underline-offset-4">視能訓練士 ゆうまるす ↗</a></p>
        </div>

        <section className="border-y border-slate-200 py-5 text-xs leading-relaxed text-slate-500 dark:border-slate-700 dark:text-slate-400">
          <h2 className="text-center font-black text-slate-600 dark:text-slate-300">【免責事項】</h2>
          <div className="mt-3 space-y-3"><p>・本アプリは服薬の記録と飲み忘れ防止を支援する補助ツールであり、医療機器ではありません。</p><p>・アプリ内の情報より、必ず医師・薬剤師の指示やお薬の説明書を優先してください。</p><p>・薬の服用可否、飲み忘れ時に今飲むか・次を飛ばすか、薬の相互作用などの医学的判断を本アプリは行いません。迷った場合は医師または薬剤師へご相談ください。</p><div><h3 className="font-black text-slate-600 dark:text-slate-300">・お薬の写真について</h3><p className="mt-1">登録した写真は、使用中のお薬を確認するための端末内の補助記録です。処方内容を証明するものではなく、お薬手帳や処方箋の代わりにはなりません。</p></div></div>
        </section>

        <div className="pb-4"><p className="mb-3 text-center text-xs text-slate-400">※初期化すると、すべての登録データが完全に消去され、元に戻せません。</p><button type="button" onClick={() => void resetAllData()} className="w-full rounded-2xl border-2 border-red-300 bg-transparent py-4 text-sm font-black text-red-600">🗑️ ⚠ アプリの全データを初期化する</button></div>
      </main>

      {modal === "updates" && <Modal title="アップデート情報" onClose={() => setModal(null)}><div className="space-y-6"><article><h3 className="text-base font-black text-slate-800 dark:text-white">■ Ver. 1.0.2 (2026年8月16日)</h3><ul className="mt-3 space-y-2 pl-1"><li>・「使用中の内服薬一覧」を追加しました。</li><li>・登録している内服薬の写真や薬名、1回量、服用タイミングなどを一覧で確認できるようになりました。</li><li>・災害時・受診時・調剤時などに、使用中の内服薬を確認しやすくなりました。</li></ul></article><article className="border-t border-slate-200 pt-6 dark:border-slate-700"><h3 className="text-base font-black text-slate-800 dark:text-white">■ Ver. 1.0.1（2026年8月）</h3><ul className="mt-3 space-y-2 pl-1"><li>・薬の登録時に「この薬は別に飲む」を設定できるようになりました。</li></ul></article><article className="border-t border-slate-200 pt-6 dark:border-slate-700"><h3 className="text-base font-black text-slate-800 dark:text-white">■ Ver. 1.0.0（2026年8月）</h3><ul className="mt-3 space-y-2 pl-1"><li>・『ノクトのまいにち内服管理アプリ』が誕生！</li><li>・毎日の内服チェックに対応。</li><li>・同じ時間帯に複数の薬を服用する場合もまとめて管理できます。</li><li>・錠剤・カプセルは、同じ服用タイミングなら1回のチェックでまとめて記録できます。</li></ul></article></div></Modal>}
      {modal === "license" && <Modal title="ライセンス・著作権について" onClose={() => setModal(null)}><p className="font-black text-slate-800 dark:text-white">© 2026 ゆうまるす / yongmars. All rights reserved.</p><p className="mt-4">本アプリに登場するキャラクター「ノクト」「ルクス」「朔」、その他のイラスト、アプリアイコン等は、すべて製作者「ゆうまるす」のオリジナル著作物です。画像の無断転載・複製・商用利用は固くお断りいたします。</p></Modal>}
    </div>
  );
}
