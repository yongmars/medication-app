"use client";

import { useEffect, useRef } from "react";
import {
  getNextNotification,
  getRecentDueNotification,
  isNotificationSupported,
  markNotificationSent,
  NOTIFICATION_BODY,
  NOTIFICATION_SETTINGS_CHANGED_EVENT,
  NOTIFICATION_SETTINGS_STORAGE_KEY,
  NOTIFICATION_TITLE,
  readNotificationSentRecord,
  readNotificationSettings,
  ScheduledNotification,
} from "../lib/localNotifications";
import { MEDICATIONS_STORAGE_KEY, MEDICATION_DATA_CHANGED_EVENT, readMedications, SCHEDULED_TIMINGS } from "../lib/medications";

const MAX_TIMEOUT_MS = 2_147_000_000;

export default function LocalNotificationScheduler() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    let active = true;
    const clearTimer = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    };

    const settingsForRegisteredMedications = () => {
      const settings = readNotificationSettings();
      const medications = readMedications();
      return {
        ...settings,
        slots: SCHEDULED_TIMINGS.reduce((slots, timing) => {
          slots[timing] = {
            ...settings.slots[timing],
            enabled: settings.slots[timing].enabled && medications.some((medication) => medication.timings.includes(timing)),
          };
          return slots;
        }, { ...settings.slots }),
      };
    };

    const show = async (scheduled: ScheduledNotification) => {
      if (!isNotificationSupported() || Notification.permission !== "granted") return;
      const options: NotificationOptions = {
        body: NOTIFICATION_BODY,
        icon: `${basePath}/medicine192.png`,
        badge: `${basePath}/medicine192.png`,
        tag: `medication-${scheduled.appDate}-${scheduled.timing}`,
      };
      if (registrationRef.current?.showNotification) await registrationRef.current.showNotification(NOTIFICATION_TITLE, options);
      else new Notification(NOTIFICATION_TITLE, options);
      markNotificationSent(scheduled.timing, scheduled.appDate);
    };

    const schedule = () => {
      clearTimer();
      if (!active || !isNotificationSupported()) return;
      const next = getNextNotification(settingsForRegisteredMedications(), readNotificationSentRecord());
      if (!next) return;
      const delay = Math.max(0, next.fireAt.getTime() - Date.now());
      timeoutRef.current = setTimeout(async () => { await show(next); schedule(); }, Math.min(delay, MAX_TIMEOUT_MS));
    };

    const checkDue = async () => {
      if (!active || !isNotificationSupported()) return;
      const recent = getRecentDueNotification(settingsForRegisteredMedications(), readNotificationSentRecord());
      if (recent) await show(recent);
      schedule();
    };

    const handleChange = () => schedule();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === NOTIFICATION_SETTINGS_STORAGE_KEY || event.key === MEDICATIONS_STORAGE_KEY) schedule();
    };
    const handleFocus = () => { if (document.visibilityState === "visible") void checkDue(); };

    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register(`${basePath}/sw.js`).then((registration) => {
        registrationRef.current = registration;
      }).catch((error) => console.error("Service Worker registration failed:", error)).finally(schedule);
    } else schedule();

    window.addEventListener(NOTIFICATION_SETTINGS_CHANGED_EVENT, handleChange);
    window.addEventListener(MEDICATION_DATA_CHANGED_EVENT, handleChange);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("visibilitychange", handleFocus);
    window.addEventListener("focus", handleFocus);
    return () => {
      active = false;
      clearTimer();
      window.removeEventListener(NOTIFICATION_SETTINGS_CHANGED_EVENT, handleChange);
      window.removeEventListener(MEDICATION_DATA_CHANGED_EVENT, handleChange);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("visibilitychange", handleFocus);
      window.removeEventListener("focus", handleFocus);
    };
  }, [basePath]);

  return null;
}
