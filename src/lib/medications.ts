export type MedicationTiming =
  | "wake_up"
  | "breakfast_before"
  | "breakfast_after"
  | "lunch_before"
  | "lunch_after"
  | "dinner_before"
  | "dinner_after"
  | "between_meals"
  | "bedtime"
  | "as_needed";

export type ScheduledTiming = Exclude<MedicationTiming, "as_needed">;
export type MedicationTimingGroup = "wake_up" | "morning" | "lunch" | "dinner" | "between_meals" | "bedtime";
export type HomeTiming = MedicationTimingGroup | "as_needed";
export type MedicationUnit = "tablet" | "capsule" | "packet" | "ml" | "other";
export type MedicationScheduleType = "daily" | "weekdays";
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type MedicationCheckGroup = "solid" | "packet" | "liquid" | "individual";

export interface Medication {
  id: number;
  name: string;
  dose: number;
  unit: MedicationUnit;
  customUnit?: string;
  timings: MedicationTiming[];
  scheduleType: MedicationScheduleType;
  weekdays: Weekday[];
  separateCheck: boolean;
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
  dose?: number;
  unitLabel?: string;
}

export const MEDICATIONS_STORAGE_KEY = "medication-list-v1";
export const DAILY_RECORDS_STORAGE_KEY = "medication-daily-records-v1";
export const AS_NEEDED_RECORDS_STORAGE_KEY = "medication-as-needed-records-v1";
export const MEDICATION_DATA_CHANGED_EVENT = "medication-data-changed";

export const SCHEDULED_TIMINGS: ScheduledTiming[] = [
  "wake_up",
  "breakfast_before",
  "breakfast_after",
  "lunch_before",
  "lunch_after",
  "dinner_before",
  "dinner_after",
  "between_meals",
  "bedtime",
];

export const ALL_TIMINGS: MedicationTiming[] = [...SCHEDULED_TIMINGS, "as_needed"];
export const SCHEDULED_TIMING_GROUPS: MedicationTimingGroup[] = ["wake_up", "morning", "lunch", "dinner", "between_meals", "bedtime"];

export const GROUP_TIMINGS: Record<MedicationTimingGroup, ScheduledTiming[]> = {
  wake_up: ["wake_up"],
  morning: ["breakfast_before", "breakfast_after"],
  lunch: ["lunch_before", "lunch_after"],
  dinner: ["dinner_before", "dinner_after"],
  between_meals: ["between_meals"],
  bedtime: ["bedtime"],
};

export const TIMING_GROUP_LABELS: Record<HomeTiming, string> = {
  wake_up: "起床時",
  morning: "朝",
  lunch: "昼",
  dinner: "夕",
  between_meals: "食間",
  bedtime: "就寝前",
  as_needed: "頓服",
};

export const TIMING_LABELS: Record<MedicationTiming, string> = {
  wake_up: "起床時",
  breakfast_before: "朝食前",
  breakfast_after: "朝食後",
  lunch_before: "昼食前",
  lunch_after: "昼食後",
  dinner_before: "夕食前",
  dinner_after: "夕食後",
  between_meals: "食間",
  bedtime: "就寝前",
  as_needed: "頓服",
};

export const TIMING_SHORT_LABELS: Record<ScheduledTiming, string> = {
  wake_up: "起床",
  breakfast_before: "朝前",
  breakfast_after: "朝後",
  lunch_before: "昼前",
  lunch_after: "昼後",
  dinner_before: "夕前",
  dinner_after: "夕後",
  between_meals: "食間",
  bedtime: "就寝",
};

export const UNIT_LABELS: Record<MedicationUnit, string> = {
  tablet: "錠",
  capsule: "カプセル",
  packet: "包",
  ml: "mL",
  other: "その他",
};

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

const VALID_TIMINGS = new Set<MedicationTiming>(ALL_TIMINGS);
const VALID_UNITS = new Set<MedicationUnit>(["tablet", "capsule", "packet", "ml", "other"]);

export const getAppDateString = (date: Date = new Date()) => {
  const adjusted = new Date(date);
  adjusted.setHours(adjusted.getHours() - 4);
  const year = adjusted.getFullYear();
  const month = String(adjusted.getMonth() + 1).padStart(2, "0");
  const day = String(adjusted.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getWeekdayForAppDate = (appDate: string): Weekday => {
  const [year, month, day] = appDate.split("-").map(Number);
  return new Date(year, month - 1, day, 12).getDay() as Weekday;
};

export const isMedicationScheduledForAppDate = (medication: Medication, appDate: string) =>
  medication.timings.includes("as_needed") ||
  medication.scheduleType === "daily" ||
  medication.weekdays.includes(getWeekdayForAppDate(appDate));

export const getSuggestedTiming = (date: Date = new Date()): ScheduledTiming => {
  const minutes = date.getHours() * 60 + date.getMinutes();
  if (minutes < 4 * 60) return "bedtime";
  if (minutes < 7 * 60) return "wake_up";
  if (minutes < 8 * 60) return "breakfast_before";
  if (minutes < 10 * 60) return "breakfast_after";
  if (minutes < 12 * 60) return "lunch_before";
  if (minutes < 14 * 60) return "lunch_after";
  if (minutes < 16 * 60 + 30) return "between_meals";
  if (minutes < 18 * 60) return "dinner_before";
  if (minutes < 21 * 60) return "dinner_after";
  return "bedtime";
};

export const getTimingGroup = (timing: ScheduledTiming): MedicationTimingGroup => {
  if (timing === "wake_up") return "wake_up";
  if (timing === "breakfast_before" || timing === "breakfast_after") return "morning";
  if (timing === "lunch_before" || timing === "lunch_after") return "lunch";
  if (timing === "dinner_before" || timing === "dinner_after") return "dinner";
  if (timing === "between_meals") return "between_meals";
  return "bedtime";
};

export const getMedicationUnitLabel = (medication: Pick<Medication, "unit" | "customUnit">) =>
  medication.unit === "other" ? medication.customUnit?.trim() || "その他" : UNIT_LABELS[medication.unit];

export const formatDose = (dose: number) => Number.isInteger(dose) ? String(dose) : String(Number(dose.toFixed(2)));

export const getMedicationDoseLabel = (medication: Pick<Medication, "dose" | "unit" | "customUnit">) =>
  `${formatDose(medication.dose)}${getMedicationUnitLabel(medication)}`;

export const getMedicationCheckGroup = (medication: Medication): MedicationCheckGroup => {
  if (medication.separateCheck || medication.unit === "other") return "individual";
  if (medication.unit === "tablet" || medication.unit === "capsule") return "solid";
  if (medication.unit === "packet") return "packet";
  return "liquid";
};

export const normalizeMedication = (value: unknown): Medication | null => {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<Medication>;
  if (typeof source.id !== "number" || !Number.isFinite(source.id) || typeof source.name !== "string" || !source.name.trim()) return null;
  const timings = Array.isArray(source.timings)
    ? source.timings.filter((timing): timing is MedicationTiming => typeof timing === "string" && VALID_TIMINGS.has(timing as MedicationTiming))
    : [];
  const uniqueTimings = [...new Set(timings)];
  const normalizedTimings = uniqueTimings.includes("as_needed") ? ["as_needed" as const] : uniqueTimings;
  const unit = typeof source.unit === "string" && VALID_UNITS.has(source.unit as MedicationUnit) ? source.unit as MedicationUnit : "tablet";
  const weekdays = Array.isArray(source.weekdays)
    ? [...new Set(source.weekdays.filter((day): day is Weekday => Number.isInteger(day) && day >= 0 && day <= 6))].sort()
    : [];
  const scheduleType: MedicationScheduleType = source.scheduleType === "weekdays" && weekdays.length > 0 ? "weekdays" : "daily";
  return {
    id: source.id,
    name: source.name.trim(),
    dose: typeof source.dose === "number" && Number.isFinite(source.dose) && source.dose > 0 ? source.dose : 1,
    unit,
    customUnit: unit === "other" && typeof source.customUnit === "string" ? source.customUnit.trim() : undefined,
    timings: normalizedTimings,
    scheduleType,
    weekdays: scheduleType === "weekdays" ? weekdays : [],
    separateCheck: source.separateCheck === true,
    memo: typeof source.memo === "string" && source.memo.trim() ? source.memo.trim() : undefined,
  };
};

export const readMedications = (): Medication[] => {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(MEDICATIONS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeMedication).filter((item): item is Medication => item !== null) : [];
  } catch {
    return [];
  }
};

export const saveMedications = (medications: Medication[]) => {
  const normalized = medications.map(normalizeMedication).filter((item): item is Medication => item !== null);
  localStorage.setItem(MEDICATIONS_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new Event(MEDICATION_DATA_CHANGED_EVENT));
};
