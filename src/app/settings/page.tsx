"use client";

/* eslint-disable @next/next/no-img-element */

import { ChangeEvent, useEffect, useRef, useState } from "react";
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
  Medication,
  MedicationTiming,
  readMedications,
  saveMedications,
  SCHEDULED_TIMINGS,
  TIMING_LABELS,
} from "../../lib/medications";
import {
  isNotificationSupported,
  LocalNotificationSettings,
  readNotificationSettings,
  saveNotificationSettings,
} from "../../lib/localNotifications";

const emptyForm = { name: "", memo: "", timings: [] as MedicationTiming[] };

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<LocalNotificationSettings | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const hydrateTimer = window.setTimeout(() => {
      setMounted(true);
      setMedications(readMedications());
      setNotifications(readNotificationSettings());
      setNotificationPermission(isNotificationSupported() ? Notification.permission : "unsupported");
    }, 0);
    return () => window.clearTimeout(hydrateTimer);
  }, []);

  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  const resetForm = () => {
    setForm(emptyForm);
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
          const requiredIds = next.filter((medication) => medication.timings.includes(timing)).map((medication) => medication.id);
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
    setForm((current) => ({
      ...current,
      timings: current.timings.includes(timing) ? current.timings.filter((value) => value !== timing) : [...current.timings, timing],
    }));
  };

  const saveMedication = async () => {
    const name = form.name.trim();
    if (!name) return setMessage("お薬の名前を入力してください。");
    if (form.timings.length === 0) return setMessage("服用タイミングを1つ以上選んでください。");
    setSaving(true);
    const id = editingId ?? Math.max(0, ...medications.map((medication) => medication.id)) + 1;
    const medication: Medication = { id, name, timings: ALL_TIMINGS.filter((timing) => form.timings.includes(timing)), memo: form.memo.trim() || undefined };
    const next = editingId === null
      ? [...medications, medication]
      : medications.map((item) => item.id === editingId ? medication : item);
    try {
      if (removePhoto) await deleteMedicationPhoto(id);
      if (photoBlob) await saveMedicationPhoto(id, photoBlob);
      persistMedicationList(next);
      setMedications(next);
      setMessage(editingId === null ? "お薬を登録しました。" : "お薬の情報を更新しました。");
      resetForm();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存に失敗しました。");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = async (medication: Medication) => {
    resetForm();
    setEditingId(medication.id);
    setForm({ name: medication.name, memo: medication.memo || "", timings: medication.timings });
    try {
      const photo = await getMedicationPhoto(medication.id);
      if (photo) setPhotoPreview(URL.createObjectURL(photo.blob));
    } catch { /* 写真なしでも編集を続けます */ }
    document.getElementById("medication-form")?.scrollIntoView({ behavior: "smooth" });
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

  const updateNotifications = (next: LocalNotificationSettings) => {
    setNotifications(next);
    saveNotificationSettings(next);
  };

  const requestPermission = async () => {
    if (!isNotificationSupported()) return;
    setNotificationPermission(await Notification.requestPermission());
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
    <div className="min-h-full bg-slate-50 dark:bg-slate-900 px-4 py-5">
      <main className="max-w-lg mx-auto space-y-5">
        <header><p className="text-xs font-bold text-sky-600">まいにち服薬</p><h1 className="text-2xl font-black text-slate-800 dark:text-white">お薬と設定</h1></header>
        {message && <button onClick={() => setMessage(null)} className="w-full rounded-2xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900 p-3 text-sm font-bold text-sky-700 dark:text-sky-300">{message}　×</button>}

        <section className="rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
          <h2 className="text-lg font-black text-slate-800 dark:text-white">登録済みのお薬 ({medications.length})</h2>
          <div className="mt-3 space-y-3">
            {medications.length === 0 ? <p className="rounded-2xl bg-slate-50 dark:bg-slate-700 p-4 text-center text-sm text-slate-500 dark:text-slate-300">登録されているお薬はありません。</p> : medications.map((medication) => (
              <article key={medication.id} className="rounded-2xl border border-slate-200 dark:border-slate-600 p-3">
                <h3 className="font-black text-slate-800 dark:text-white break-words">{medication.name}</h3>
                <div className="mt-2 flex flex-wrap gap-1">{medication.timings.map((timing) => <span key={timing} className="rounded-full bg-sky-50 dark:bg-slate-700 px-2 py-1 text-[11px] font-bold text-sky-700 dark:text-sky-300">{TIMING_LABELS[timing]}</span>)}</div>
                {medication.memo && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{medication.memo}</p>}
                <div className="mt-3 flex gap-2"><button onClick={() => void startEdit(medication)} className="flex-1 rounded-xl bg-slate-100 dark:bg-slate-700 py-2 text-sm font-bold text-slate-700 dark:text-white">編集する</button><button onClick={() => void deleteMedication(medication)} className="rounded-xl bg-red-50 dark:bg-red-950/30 px-4 py-2 text-sm font-bold text-red-600">削除</button></div>
              </article>
            ))}
          </div>
        </section>

        <section id="medication-form" className="rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm space-y-4">
          <div className="flex justify-between items-center"><h2 className="text-lg font-black text-slate-800 dark:text-white">{editingId === null ? "＋ お薬を登録する" : "お薬を編集する"}</h2>{editingId !== null && <button onClick={resetForm} className="text-xs font-bold text-slate-500">編集をやめる</button>}</div>
          <label className="block"><span className="text-sm font-bold text-slate-700 dark:text-slate-200">お薬の名前</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={80} placeholder="例：〇〇錠" className="mt-1 w-full rounded-2xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-3 text-base" /></label>
          <div><p className="text-sm font-bold text-slate-700 dark:text-slate-200">服用タイミング（複数選択可）</p><div className="mt-2 grid grid-cols-2 gap-2">{ALL_TIMINGS.map((timing) => <button type="button" key={timing} onClick={() => toggleTiming(timing)} className={`rounded-xl border px-3 py-2.5 text-sm font-bold ${form.timings.includes(timing) ? "bg-sky-600 border-sky-600 text-white" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300"}`}>{TIMING_LABELS[timing]}</button>)}</div></div>
          <label className="block"><span className="text-sm font-bold text-slate-700 dark:text-slate-200">服用メモ（任意）</span><textarea value={form.memo} onChange={(event) => setForm({ ...form, memo: event.target.value })} maxLength={200} rows={3} placeholder="例：1回1錠。処方された内容をそのまま入力してください。" className="mt-1 w-full resize-none rounded-2xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-3 text-sm" /></label>
          <div><p className="text-sm font-bold text-slate-700 dark:text-slate-200">お薬の写真（任意・1枚）</p><p className="mt-1 text-xs text-slate-500">写真はこの端末内だけに保存されます。</p><input ref={cameraInput} type="file" accept="image/*" capture="environment" onChange={(event) => void handlePhoto(event)} className="hidden" /><input ref={galleryInput} type="file" accept="image/*" onChange={(event) => void handlePhoto(event)} className="hidden" /><div className="mt-2 grid grid-cols-2 gap-2"><button onClick={() => cameraInput.current?.click()} className="rounded-xl bg-sky-50 dark:bg-slate-700 py-3 text-sm font-bold text-sky-700 dark:text-sky-300">カメラで撮る</button><button onClick={() => galleryInput.current?.click()} className="rounded-xl bg-slate-100 dark:bg-slate-700 py-3 text-sm font-bold text-slate-700 dark:text-slate-200">画像を選ぶ</button></div>{photoPreview && <div className="mt-3"><div className="h-40 overflow-hidden rounded-2xl bg-slate-100"><img src={photoPreview} alt="登録するお薬の写真" className="h-full w-full object-contain" /></div><button onClick={() => { setPhotoBlob(null); setRemovePhoto(true); setPhotoPreview(null); }} className="mt-2 w-full rounded-xl bg-red-50 py-2 text-sm font-bold text-red-600">写真を削除する</button></div>}</div>
          <button onClick={() => void saveMedication()} disabled={saving} className="w-full rounded-2xl bg-sky-600 py-4 text-base font-black text-white disabled:opacity-50">{saving ? "保存中…" : editingId === null ? "お薬を登録する" : "変更を保存する"}</button>
        </section>

        <section className="rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-black text-slate-800 dark:text-white">服薬のお知らせ</h2><p className="text-xs text-slate-500 mt-1">登録薬がある時間帯だけ通知します。</p></div><button onClick={() => updateNotifications({ ...notifications, enabled: !notifications.enabled })} className={`rounded-full px-3 py-2 text-xs font-bold ${notifications.enabled ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"}`}>{notifications.enabled ? "オン" : "オフ"}</button></div>
          {notificationPermission !== "granted" && <button onClick={() => void requestPermission()} disabled={notificationPermission === "unsupported" || notificationPermission === "denied"} className="mt-3 w-full rounded-xl bg-amber-100 dark:bg-amber-950/30 py-2.5 text-sm font-bold text-amber-800 dark:text-amber-300 disabled:opacity-60">{notificationPermission === "unsupported" ? "このブラウザは通知に対応していません" : notificationPermission === "denied" ? "通知がブラウザで拒否されています" : "通知を許可する"}</button>}
          <div className="mt-4 space-y-2">{SCHEDULED_TIMINGS.map((timing) => <div key={timing} className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-slate-700 p-2"><label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200"><input type="checkbox" checked={notifications.slots[timing].enabled} onChange={(event) => updateNotifications({ ...notifications, slots: { ...notifications.slots, [timing]: { ...notifications.slots[timing], enabled: event.target.checked } } })} />{TIMING_LABELS[timing]}</label><input type="time" value={notifications.slots[timing].time} onChange={(event) => updateNotifications({ ...notifications, slots: { ...notifications.slots, [timing]: { ...notifications.slots[timing], time: event.target.value } } })} className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm" /></div>)}</div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">時刻は例です。処方の指示に合わせて変更してください。端末やブラウザの状態によって、アプリを完全に閉じている間は通知されない場合があります。</p>
        </section>

        <section className="rounded-3xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-4 text-xs leading-relaxed text-amber-900 dark:text-amber-300 space-y-2"><h2 className="text-sm font-black">大切なお知らせ</h2><p>本アプリは服薬の記録を支援する補助ツールで、医療機器ではありません。</p><p>アプリ内の表示より、医師・薬剤師の指示、お薬の説明書を必ず優先してください。</p><p>写真やメモは、お薬手帳・処方箋の代わりにはなりません。</p></section>
        <button onClick={() => void resetAllData()} className="w-full rounded-2xl border border-red-200 bg-white dark:bg-slate-800 py-3 text-sm font-bold text-red-600">すべてのアプリ内データを初期化する</button>
      </main>
    </div>
  );
}
