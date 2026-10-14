import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications(userId?: string) {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      setIsSubscribed(true);
    }
  }, []);

  const subscribeToPush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Push notifications are not supported on this browser or platform.');
      return;
    }

    if (!userId) {
      alert('Please log in first to enable reminders.');
      return;
    }

    setLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setLoading(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const subData = subscription.toJSON();
      if (subData.endpoint && subData.keys) {
        await supabase.from('push_subscriptions').upsert(
          {
            user_id: userId,
            endpoint: subData.endpoint,
            p256dh: subData.keys.p256dh,
            auth: subData.keys.auth,
          },
          { onConflict: 'endpoint' }
        );
        setIsSubscribed(true);
      }
    } catch (err) {
      console.error('Push registration failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return { isSubscribed, subscribeToPush, loading };
}