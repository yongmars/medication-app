const DATABASE_NAME = "medication-local-data";
const DATABASE_VERSION = 1;
const STORE_NAME = "medicationPhotos";

const MAX_IMAGE_DIMENSION = 1280;
const TARGET_IMAGE_BYTES = 600 * 1024;

export interface MedicationPhotoRecord {
  medicationId: number;
  blob: Blob;
  updatedAt: string;
}

export class MedicationPhotoError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MedicationPhotoError";
  }
}

const openDatabase = (): Promise<IDBDatabase> => {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.reject(new MedicationPhotoError("この端末では写真を保存できません。"));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "medicationId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new MedicationPhotoError("写真の保存場所を開けませんでした。", { cause: request.error }));
    request.onblocked = () => reject(new MedicationPhotoError("写真の保存場所が使用中です。ほかの画面を閉じて再度お試しください。"));
  });
};

const runRequest = async <T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) => {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    let result: T;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(new MedicationPhotoError("写真データの処理に失敗しました。", { cause: request.error }));
    transaction.oncomplete = () => { database.close(); resolve(result); };
    transaction.onerror = () => { database.close(); reject(new MedicationPhotoError("写真データの処理に失敗しました。", { cause: transaction.error })); };
  });
};

export const getMedicationPhotos = async (ids: number[]) => {
  if (ids.length === 0) return new Map<number, MedicationPhotoRecord>();
  const records = await runRequest<MedicationPhotoRecord[]>("readonly", (store) => store.getAll());
  const requested = new Set(ids);
  return new Map(records.filter((record) => requested.has(record.medicationId)).map((record) => [record.medicationId, record]));
};

export const getMedicationPhoto = async (id: number) => {
  const record = await runRequest<MedicationPhotoRecord | undefined>("readonly", (store) => store.get(id));
  return record ?? null;
};

export const saveMedicationPhoto = async (medicationId: number, blob: Blob) => {
  await runRequest<IDBValidKey>("readwrite", (store) => store.put({ medicationId, blob, updatedAt: new Date().toISOString() }));
};

export const deleteMedicationPhoto = async (id: number) => {
  await runRequest<undefined>("readwrite", (store) => store.delete(id));
};

export const clearMedicationPhotos = async () => {
  await runRequest<undefined>("readwrite", (store) => store.clear());
};

const loadImage = (file: File) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  const url = URL.createObjectURL(file);
  image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
  image.onerror = () => { URL.revokeObjectURL(url); reject(new MedicationPhotoError("画像を読み込めませんでした。")); };
  image.src = url;
});

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => blob ? resolve(blob) : reject(new MedicationPhotoError("画像を圧縮できませんでした。")), "image/jpeg", quality);
});

export const compressMedicationPhoto = async (file: File) => {
  if (!file.type.startsWith("image/")) throw new MedicationPhotoError("画像ファイルを選択してください。");
  const image = await loadImage(file);
  let scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new MedicationPhotoError("この端末では画像を圧縮できません。");

  for (;;) {
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await canvasToBlob(canvas, 0.78);
    if (blob.size <= TARGET_IMAGE_BYTES || Math.max(canvas.width, canvas.height) <= 720) return blob;
    scale *= 0.8;
  }
};

