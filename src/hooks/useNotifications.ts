import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { supabase } from '@/lib/supabase';
import type { Language } from '@/types';

const DAILY_REMINDER_ID = 21337;

type NotificationError =
  | 'notificationPermissionDenied'
  | 'notificationUnsupported'
  | 'notificationLoginRequired'
  | 'notificationVapidMissing'
  | 'notificationOperationFailed';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }
  return outputArray;
}

export function useNotifications(userId?: string, language: Language = 'en') {
  const isNative = Capacitor.isNativePlatform();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<NotificationError | null>(null);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      if (isNative) {
        const [permission, pending] = await Promise.all([
          LocalNotifications.checkPermissions(),
          LocalNotifications.getPending(),
        ]);
        setEnabled(
          permission.display === 'granted' &&
            pending.notifications.some((notification) => notification.id === DAILY_REMINDER_ID),
        );
        return;
      }

      if (
        !('Notification' in window) ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window)
      ) {
        setEnabled(false);
        setError('notificationUnsupported');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setEnabled(Notification.permission === 'granted' && subscription !== null);
    } catch (cause) {
      console.error('Could not read notification status:', cause);
      setError('notificationOperationFailed');
    } finally {
      setLoading(false);
    }
  }, [isNative]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus, userId]);

  const enable = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isNative) {
        const permission = await LocalNotifications.requestPermissions();
        if (permission.display !== 'granted') {
          setEnabled(false);
          setError('notificationPermissionDenied');
          return;
        }

        await LocalNotifications.schedule({
          notifications: [
            {
              id: DAILY_REMINDER_ID,
              title: 'Rozana Hisaab',
              body:
                language === 'ur'
                  ? 'آج کے اخراجات اور واجب الادا بل دیکھ لیں۔'
                  : 'Review today’s expenses and any bills due today.',
              isExactNotification: false,
              schedule: { on: { hour: 12, minute: 30 }, repeats: true },
            },
          ],
        });
        setEnabled(true);
        return;
      }

      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        setError('notificationUnsupported');
        return;
      }
      if (!userId) {
        setError('notificationLoginRequired');
        return;
      }

      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        setError('notificationVapidMissing');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setError('notificationPermissionDenied');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const subscriptionData = subscription.toJSON();
      if (!subscriptionData.endpoint || !subscriptionData.keys?.p256dh || !subscriptionData.keys.auth) {
        throw new Error('The browser returned an incomplete push subscription.');
      }

      const { error: saveError } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: userId,
          endpoint: subscriptionData.endpoint,
          p256dh: subscriptionData.keys.p256dh,
          auth: subscriptionData.keys.auth,
        },
        { onConflict: 'endpoint' },
      );
      if (saveError) throw saveError;
      setEnabled(true);
    } catch (cause) {
      console.error('Could not enable notifications:', cause);
      setError('notificationOperationFailed');
    } finally {
      setLoading(false);
    }
  };

  const disable = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isNative) {
        await LocalNotifications.cancel({
          notifications: [{ id: DAILY_REMINDER_ID }],
        });
        setEnabled(false);
        return;
      }

      if (!('serviceWorker' in navigator)) {
        setEnabled(false);
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        const unsubscribed = await subscription.unsubscribe();
        if (!unsubscribed) throw new Error('The browser could not unsubscribe from push notifications.');
        const { error: deleteError } = await supabase
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', endpoint);
        if (deleteError) throw deleteError;
      }
      setEnabled(false);
    } catch (cause) {
      console.error('Could not disable notifications:', cause);
      setError('notificationOperationFailed');
      await refreshStatus();
    } finally {
      setLoading(false);
    }
  };

  const toggle = async () => {
    if (loading) return;
    if (enabled) await disable();
    else await enable();
  };

  return { enabled, loading, error, toggle };
}
