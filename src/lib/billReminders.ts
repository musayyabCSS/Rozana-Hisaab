import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

// Native notification ids for expected-bill reminders live in this range.
const REMINDER_ID_BASE = 40000;
const REMINDER_ID_RANGE = 10000;

export function billReminderId(consumerNumber: string): number {
  let hash = 0;
  for (const character of consumerNumber) {
    hash = (hash * 31 + character.charCodeAt(0)) % REMINDER_ID_RANGE;
  }
  return REMINDER_ID_BASE + hash;
}

function isBillReminderId(id: number): boolean {
  return id >= REMINDER_ID_BASE && id < REMINDER_ID_BASE + REMINDER_ID_RANGE;
}

export async function cancelNativeBillReminders(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const pending = await LocalNotifications.getPending();
  const reminders = pending.notifications.filter(({ id }) => isBillReminderId(id));
  if (reminders.length > 0) {
    await LocalNotifications.cancel({ notifications: reminders.map(({ id }) => ({ id })) });
  }
}
