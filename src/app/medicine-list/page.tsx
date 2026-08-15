"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMedicationPhotos } from "../../lib/medicationPhotos";
import {
  getMedicationDoseLabel,
  Medication,
  readMedications,
  TIMING_LABELS,
  WEEKDAY_LABELS,
} from "../../lib/medications";

const formatUpdatedAt = (timestamp: number) => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "記録なし";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(timestamp));
};

const getScheduleLabel = (medication: Medication) => {
  if (medication.timings.includes("as_needed")) return "曜日指定なし（頓服）";
  if (medication.scheduleType === "daily") return "毎日";
  return medication.weekdays.map((weekday) => `${WEEKDAY_LABELS[weekday]}曜`).join("・") || "未設定";
};

export default function MedicationListPage() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const router = useRouter();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<Record<number, string>>({});
  const [photoUpdatedAt, setPhotoUpdatedAt] = useState<Record<number, number>>({});
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const [expandedPhoto, setExpandedPhoto] = useState<{ name: string; url: string } | null>(null);

  useEffect(() => {
    const loadedMedications = readMedications();
    let cancelled = false;
    const createdUrls: string[] = [];

    const loadData = async () => {
      try {
        const photos = await getMedicationPhotos(loadedMedications.map((medication) => medication.id));
        const nextUrls: Record<number, string> = {};
        const nextUpdatedAt: Record<number, number> = {};
        photos.forEach((photo, medicationId) => {
          const url = URL.createObjectURL(photo.blob);
          createdUrls.push(url);
          nextUrls[medicationId] = url;
          const timestamp = Date.parse(photo.updatedAt);
          if (Number.isFinite(timestamp)) nextUpdatedAt[medicationId] = timestamp;
        });
        if (cancelled) {
          createdUrls.forEach((url) => URL.revokeObjectURL(url));
          return;
        }
        setPhotoUrls(nextUrls);
        setPhotoUpdatedAt(nextUpdatedAt);
      } catch (error) {
        console.error("Failed to load medication photos", error);
        if (!cancelled) setPhotoNotice("写真を読み込めませんでした。お薬の登録内容は引き続き確認できます。");
      } finally {
        if (!cancelled) {
          setMedications(loadedMedications);
          setIsLoaded(true);
        }
      }
    };

    void loadData();
    return () => {
      cancelled = true;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    if (!expandedPhoto) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpandedPhoto(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expandedPhoto]);

  return (
    <div className="flex min-h-full flex-col bg-slate-50 dark:bg-slate-900">
      <header className="flex w-full items-center border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-slate-800">
        <div className="flex items-center gap-2">
          <Image src={`${basePath}/medicine192.png`} alt="まいにち内服のロゴ" width={28} height={28} className="object-contain" />
          <span className="text-base font-bold text-slate-800 dark:text-white">まいにち内服</span>
        </div>
      </header>

      <div className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50/95 px-4 py-4 shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
        <header className="flex items-center justify-between">
          <button type="button" onClick={() => router.push("/settings")} className="min-h-10 rounded-xl bg-slate-100 px-3.5 text-sm font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">戻る</button>
          <h1 className="text-center text-xl font-black text-slate-800 dark:text-white">使用中の内服薬一覧</h1>
          <div className="w-14" aria-hidden="true" />
        </header>
      </div>

      <main className="mx-auto w-full max-w-lg space-y-4 px-4 py-5 pb-24">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium leading-relaxed text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100">
          この画面は、使用中の内服薬を確認するための補助記録です。処方内容の証明や、お薬手帳・処方箋の代わりになるものではありません。
        </div>

        {photoNotice && <div role="status" className="rounded-2xl bg-sky-50 p-4 text-sm text-sky-800 dark:bg-sky-950/30 dark:text-sky-200">{photoNotice}</div>}

        {isLoaded && medications.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-sm dark:border-slate-700 dark:bg-slate-800">
            <p className="font-bold text-slate-700 dark:text-slate-200">登録されている内服薬はありません。</p>
            <button type="button" onClick={() => router.push("/settings")} className="mt-4 min-h-11 rounded-xl bg-sky-600 px-5 text-sm font-bold text-white">設定画面で内服薬を登録する</button>
          </div>
        ) : (
          medications.map((medication) => {
            const photoUrl = photoUrls[medication.id];
            const medicationUpdatedAt = medication.updatedAt ? Date.parse(medication.updatedAt) : Number.NaN;
            const lastUpdatedAt = Math.max(
              Number.isFinite(medicationUpdatedAt) ? medicationUpdatedAt : 0,
              photoUpdatedAt[medication.id] ?? 0,
            );
            return (
              <article key={medication.id} className="overflow-hidden rounded-3xl border border-sky-200 bg-white shadow-sm dark:border-sky-800/60 dark:bg-slate-800">
                <div className="flex gap-4 border-b border-slate-100 p-5 dark:border-slate-700">
                  {photoUrl ? (
                    <button type="button" onClick={() => setExpandedPhoto({ name: medication.name, url: photoUrl })} className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-600 dark:bg-slate-900" aria-label={`${medication.name}の写真を拡大表示`}>
                      <Image src={photoUrl} alt={`${medication.name}の写真`} width={96} height={96} unoptimized className="h-full w-full object-cover" />
                    </button>
                  ) : (
                    <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-2 text-center text-xs font-bold text-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-500">写真未登録</div>
                  )}
                  <div className="min-w-0 flex-1 self-center">
                    <p className="mb-1 text-xs font-bold text-sky-600 dark:text-sky-400">薬剤名・規格・濃度</p>
                    <h2 className="break-words text-xl font-black leading-snug text-slate-900 dark:text-white">{medication.name}</h2>
                  </div>
                </div>

                <dl className="grid grid-cols-[7rem_1fr] gap-y-3 px-5 py-4 text-sm leading-relaxed">
                  <dt className="font-bold text-slate-500 dark:text-slate-400">1回量</dt>
                  <dd className="font-bold text-slate-800 dark:text-slate-100">{getMedicationDoseLabel(medication)}</dd>
                  <dt className="font-bold text-slate-500 dark:text-slate-400">服用タイミング</dt>
                  <dd className="font-bold text-slate-800 dark:text-slate-100">{medication.timings.length ? medication.timings.map((timing) => TIMING_LABELS[timing]).join("・") : "未設定"}</dd>
                  <dt className="font-bold text-slate-500 dark:text-slate-400">服用する曜日</dt>
                  <dd className="font-bold text-slate-800 dark:text-slate-100">{getScheduleLabel(medication)}</dd>
                  <dt className="font-bold text-slate-500 dark:text-slate-400">他の薬とのまとめ方</dt>
                  <dd className={`font-bold ${medication.separateCheck ? "text-purple-700 dark:text-purple-300" : "text-slate-800 dark:text-slate-100"}`}>{medication.separateCheck ? "この薬は別に飲む" : "まとめて飲む"}</dd>
                  {medication.memo && <><dt className="font-bold text-slate-500 dark:text-slate-400">メモ</dt><dd className="break-words font-medium text-slate-800 dark:text-slate-100">{medication.memo}</dd></>}
                  <dt className="font-bold text-slate-500 dark:text-slate-400">最終更新日</dt>
                  <dd className="font-bold text-slate-800 dark:text-slate-100">{formatUpdatedAt(lastUpdatedAt)}</dd>
                </dl>
              </article>
            );
          })
        )}
      </main>

      {expandedPhoto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${expandedPhoto.name}の写真`} onClick={() => setExpandedPhoto(null)}>
          <div className="relative w-full max-w-lg rounded-3xl bg-white p-4 shadow-2xl dark:bg-slate-800" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
              <h2 className="truncate font-bold text-slate-800 dark:text-white">{expandedPhoto.name}</h2>
              <button type="button" onClick={() => setExpandedPhoto(null)} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300" aria-label="写真を閉じる">✕</button>
            </div>
            <Image src={expandedPhoto.url} alt={`${expandedPhoto.name}の拡大写真`} width={1280} height={1280} unoptimized className="max-h-[75vh] w-full rounded-2xl bg-slate-50 object-contain dark:bg-slate-900" />
          </div>
        </div>
      )}
    </div>
  );
}
