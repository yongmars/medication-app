export type MedicationTiming =
  | "breakfast_before"
  | "breakfast_after"
  | "lunch_before"
  | "lunch_after"
  | "dinner_before"
  | "dinner_after"
  | "bedtime"
  | "as_needed";

export type ScheduledTiming = Exclude<MedicationTiming, "as_needed">;

export type MedicationTimingGroup = "morning" | "lunch" | "dinner" | "bedtime";
export type HomeTiming = MedicationTimingGroup | "as_needed";

export interface Medication {
  id: number;
  name: string;
  timings: MedicationTiming[];
  memo?: string;
}

export interface TimingRecord {
  checkedMedicationIds: number[];
  completed: boolean;
}

export type DailyMedicationRecord = Partial<Record<ScheduledTiming, TimingRecord>>;
export type DailyMedicationRecords = Record<string, DailyMedicationRecord>;

export interface AsNeededRecord {
  id: string;
  medicationId: number;
  medicationName: string;
  takenAt: string;
}

export const MEDICATIONS_STORAGE_KEY = "medication-list-v1";
export const DAILY_RECORDS_STORAGE_KEY = "medication-daily-records-v1";
export const AS_NEEDED_RECORDS_STORAGE_KEY = "medication-as-needed-records-v1";
export const MEDICATION_DATA_CHANGED_EVENT = "medication-data-changed";

export const SCHEDULED_TIMINGS: ScheduledTiming[] = [
  "breakfast_before",
  "breakfast_after",
  "lunch_before",
  "lunch_after",
  "dinner_before",
  "dinner_after",
  "bedtime",
];

export const ALL_TIMINGS: MedicationTiming[] = [...SCHEDULED_TIMINGS, "as_needed"];

export const SCHEDULED_TIMING_GROUPS: MedicationTimingGroup[] = ["morning", "lunch", "dinner", "bedtime"];

export const GROUP_TIMINGS: Record<MedicationTimingGroup, ScheduledTiming[]> = {
  morning: ["breakfast_before", "breakfast_after"],
  lunch: ["lunch_before", "lunch_after"],
  dinner: ["dinner_before", "dinner_after"],
  bedtime: ["bedtime"],
};

export const TIMING_GROUP_LABELS: Record<HomeTiming, string> = {
  morning: "朝",
  lunch: "昼",
  dinner: "夕",
  bedtime: "就寝前",
  as_needed: "頓服",
};

export const TIMING_LABELS: Record<MedicationTiming, string> = {
  breakfast_before: "朝食前",
  breakfast_after: "朝食後",
  lunch_before: "昼食前",
  lunch_after: "昼食後",
  dinner_before: "夕食前",
  dinner_after: "夕食後",
  bedtime: "就寝前",
  as_needed: "頓服",
};

export const TIMING_SHORT_LABELS: Record<ScheduledTiming, string> = {
  breakfast_before: "朝前",
  breakfast_after: "朝後",
  lunch_before: "昼前",
  lunch_after: "昼後",
  dinner_before: "夕前",
  dinner_after: "夕後",
  bedtime: "就寝",
};

export const getAppDateString = (date: Date = new Date()) => {
  const adjusted = new Date(date);
  adjusted.setHours(adjusted.getHours() - 4);
  const year = adjusted.getFullYear();
  const month = String(adjusted.getMonth() + 1).padStart(2, "0");
  const day = String(adjusted.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getSuggestedTiming = (date: Date = new Date()): ScheduledTiming => {
  const minutes = date.getHours() * 60 + date.getMinutes();
  if (minutes < 4 * 60) return "bedtime";
  if (minutes < 8 * 60) return "breakfast_before";
  if (minutes < 10 * 60) return "breakfast_after";
  if (minutes < 12 * 60) return "lunch_before";
  if (minutes < 15 * 60) return "lunch_after";
  if (minutes < 18 * 60) return "dinner_before";
  if (minutes < 21 * 60) return "dinner_after";
  return "bedtime";
};

export const getTimingGroup = (timing: ScheduledTiming): MedicationTimingGroup => {
  if (timing === "breakfast_before" || timing === "breakfast_after") return "morning";
  if (timing === "lunch_before" || timing === "lunch_after") return "lunch";
  if (timing === "dinner_before" || timing === "dinner_after") return "dinner";
  return "bedtime";
};

export const readMedications = (): Medication[] => {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(MEDICATIONS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveMedications = (medications: Medication[]) => {
  localStorage.setItem(MEDICATIONS_STORAGE_KEY, JSON.stringify(medications));
  window.dispatchEvent(new Event(MEDICATION_DATA_CHANGED_EVENT));
};
