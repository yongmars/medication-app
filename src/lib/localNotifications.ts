import {
  getAppDateString,
  isMedicationScheduledForAppDate,
  Medication,
  ScheduledTiming,
  SCHEDULED_TIMINGS,
} from "./medications";

export interface NotificationSlotSetting {
  enabled: boolean;
  time: string;
}

export interface LocalNotificationSettings {
  enabled: boolean;
  slots: Record<ScheduledTiming, NotificationSlotSetting>;
}

export interface ScheduledNotification {
  timing: ScheduledTiming;
  appDate: string;
  fireAt: Date;
}

export type NotificationSentRecord = Record<string, Partial<Record<ScheduledTiming, boolean>>>;

export const NOTIFICATION_SETTINGS_STORAGE_KEY = "medication-notification-settings-v1";
export const NOTIFICATION_SENT_STORAGE_KEY = "medication-notification-sent-v1";
export const NOTIFICATION_SETTINGS_CHANGED_EVENT = "medication-notification-settings-changed";
export const NOTIFICATION_TITLE = "服薬の時間だよ";
export const NOTIFICATION_BODY = "処方の指示を確認して、お薬を飲みましょう";

export const DEFAULT_NOTIFICATION_SETTINGS: LocalNotificationSettings = {
  enabled: true,
  slots: {
    wake_up: { enabled: true, time: "06:30" },
    breakfast_before: { enabled: true, time: "07:30" },
    breakfast_after: { enabled: true, time: "08:30" },
    lunch_before: { enabled: true, time: "11:30" },
    lunch_after: { enabled: true, time: "12:30" },
    dinner_before: { enabled: true, time: "17:30" },
    dinner_after: { enabled: true, time: "18:30" },
    between_meals: { enabled: true, time: "15:00" },
    bedtime: { enabled: true, time: "22:00" },
  },
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const APP_DAY_START_MINUTES = 4 * 60;

const sanitizeSettings = (value: unknown): LocalNotificationSettings => {
  const parsed = value as Partial<LocalNotificationSettings> | null;
  const sourceSlots = (parsed?.slots ?? {}) as Partial<Record<ScheduledTiming, Partial<NotificationSlotSetting>>>;
  return {
    enabled: typeof parsed?.enabled === "boolean" ? parsed.enabled : true,
    slots: SCHEDULED_TIMINGS.reduce((result, timing) => {
      const source = sourceSlots[timing];
      const fallback = DEFAULT_NOTIFICATION_SETTINGS.slots[timing];
      result[timing] = {
        enabled: typeof source?.enabled === "boolean" ? source.enabled : fallback.enabled,
        time: typeof source?.time === "string" && TIME_PATTERN.test(source.time) ? source.time : fallback.time,
      };
      return result;
    }, {} as Record<ScheduledTiming, NotificationSlotSetting>),
  };
};

export const isNotificationSupported = () => typeof window !== "undefined" && "Notification" in window;

export const readNotificationSettings = () => {
  if (typeof window === "undefined") return DEFAULT_NOTIFICATION_SETTINGS;
  const raw = localStorage.getItem(NOTIFICATION_SETTINGS_STORAGE_KEY);
  if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
  try { return sanitizeSettings(JSON.parse(raw)); } catch { return DEFAULT_NOTIFICATION_SETTINGS; }
};

export const saveNotificationSettings = (settings: LocalNotificationSettings) => {
  localStorage.setItem(NOTIFICATION_SETTINGS_STORAGE_KEY, JSON.stringify(sanitizeSettings(settings)));
  window.dispatchEvent(new Event(NOTIFICATION_SETTINGS_CHANGED_EVENT));
};

export const readNotificationSentRecord = (): NotificationSentRecord => {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(NOTIFICATION_SENT_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch { return {}; }
};

export const markNotificationSent = (timing: ScheduledTiming, appDate: string) => {
  const record = readNotificationSentRecord();
  record[appDate] = { ...record[appDate], [timing]: true };
  localStorage.setItem(NOTIFICATION_SENT_STORAGE_KEY, JSON.stringify(record));
};

const addDays = (appDate: string, days: number) => {
  const [year, month, day] = appDate.split("-").map(Number);
  return getAppDateString(new Date(year, month - 1, day + days, 12));
};

const getFireDate = (appDate: string, time: string) => {
  const [year, month, day] = appDate.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const fireAt = new Date(year, month - 1, day, hours, minutes);
  if (hours * 60 + minutes < APP_DAY_START_MINUTES) fireAt.setDate(fireAt.getDate() + 1);
  return fireAt;
};

const getCandidates = (settings: LocalNotificationSettings, sent: NotificationSentRecord, appDates: string[], medications: Medication[]) =>
  appDates.flatMap((appDate) => SCHEDULED_TIMINGS.flatMap((timing) => {
    const slot = settings.slots[timing];
    const hasMedication = medications.some((medication) =>
      medication.timings.includes(timing) && isMedicationScheduledForAppDate(medication, appDate)
    );
    if (!slot.enabled || sent[appDate]?.[timing] || !hasMedication) return [];
    return [{ timing, appDate, fireAt: getFireDate(appDate, slot.time) }];
  }));

export const getNextNotification = (settings: LocalNotificationSettings, medications: Medication[], sent = readNotificationSentRecord(), now = new Date()) => {
  if (!settings.enabled) return null;
  const today = getAppDateString(now);
  return getCandidates(settings, sent, [today, addDays(today, 1)], medications)
    .filter((candidate) => candidate.fireAt.getTime() > now.getTime())
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())[0] ?? null;
};

export const getRecentDueNotification = (settings: LocalNotificationSettings, medications: Medication[], sent = readNotificationSentRecord(), now = new Date(), lookBackMinutes = 60) => {
  if (!settings.enabled) return null;
  const today = getAppDateString(now);
  const nowTime = now.getTime();
  return getCandidates(settings, sent, [addDays(today, -1), today], medications)
    .filter((candidate) => candidate.fireAt.getTime() <= nowTime && nowTime - candidate.fireAt.getTime() <= lookBackMinutes * 60_000)
    .sort((a, b) => b.fireAt.getTime() - a.fireAt.getTime())[0] ?? null;
};
