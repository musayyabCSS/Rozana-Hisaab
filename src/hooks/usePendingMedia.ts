import { useCallback, useEffect, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { supabase } from '@/lib/supabase';
import type { NewTransaction, Transaction } from '@/types';
import {
  deleteAllPendingMedia,
  deletePendingMedia,
  getPendingMediaForUser,
  setPendingMedia as storePendingMedia,
  type PendingMedia,
} from '@/lib/localStore';
import { AiRequestError, parseReceiptImage, parseVoice, transcribeAudioWithWhisper } from '@/lib/ai';
import { deleteAllReceiptImages } from '@/lib/receiptStorage';
import { EXPENSE_CATEGORIES } from '@/lib/categories';

function createId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the saved receipt photo.'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Could not encode the saved receipt photo.'));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

function isExpenseCategory(value: string): value is (typeof EXPENSE_CATEGORIES)[number] {
  return EXPENSE_CATEGORIES.some((category) => category === value);
}

function makeTransaction(
  media: PendingMedia,
  draft: NewTransaction,
): Transaction {
  const now = new Date().toISOString();
  return {
    id: media.id,
    type: draft.type,
    amount: draft.amount,
    category: draft.category,
    title: draft.title,
    payment_method: draft.payment_method ?? null,
    provider: draft.provider ?? null,
    due_date: draft.due_date ?? null,
    units_consumed: draft.units_consumed ?? null,
    source: draft.source ?? (media.type === 'voice' ? 'voice' : 'scan'),
    transaction_date: draft.transaction_date ?? now.slice(0, 10),
    created_at: now,
    ...(draft.has_receipt !== undefined ? { has_receipt: draft.has_receipt } : {}),
    ...(draft.is_paid !== undefined ? { is_paid: draft.is_paid } : {}),
    is_synced: false,
  };
}

async function processMedia(media: PendingMedia): Promise<Transaction> {
  if (media.type === 'voice') {
    const transcript = await transcribeAudioWithWhisper(media.blob);
    if (!transcript.trim()) throw new Error('No speech was detected in this recording.');
    const parsed = await parseVoice(transcript);
    return makeTransaction(media, {
      type: parsed.type,
      amount: parsed.amount,
      category: parsed.category,
      title: parsed.title,
      payment_method: parsed.paymentMethod,
      transaction_date: parsed.date,
      source: 'voice',
    });
  }

  const parsed = await parseReceiptImage(await blobToDataUrl(media.blob));
  const type = parsed.type === 'income' ? 'income' : 'expense';
  const category = type === 'income'
    ? 'freelance'
    : typeof parsed.category === 'string' && isExpenseCategory(parsed.category)
      ? parsed.category
      : 'bills';
  const transactionDate =
    [parsed.transaction_date, parsed.date, parsed.due_date].find(
      (date): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date),
    ) ?? new Date().toISOString().slice(0, 10);
  const parsedAmount = typeof parsed.amount === 'number'
    ? parsed.amount
    : typeof parsed.amount === 'string'
      ? Number(parsed.amount.replace(/,/g, ''))
      : 0;
  return makeTransaction(media, {
    type,
    amount: Number.isFinite(parsedAmount) ? parsedAmount : 0,
    category,
    title: parsed.title || parsed.merchant || parsed.provider || parsed.vendor || 'Scanned Receipt',
    provider: parsed.provider || null,
    due_date: parsed.due_date || null,
    units_consumed: parsed.units_consumed || null,
    transaction_date: transactionDate,
    source: 'scan',
    has_receipt: true,
  });
}

export function usePendingMedia(userId?: string) {
  const [pendingMedia, setPendingMediaState] = useState<PendingMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);
  const processingEpochRef = useRef(0);
  const authPausedRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const refresh = useCallback(async () => {
    if (!userId) {
      setPendingMediaState([]);
      setLoading(false);
      return;
    }
    const items = await getPendingMediaForUser(userId);
    const cutoff = Date.now() - 30 * 60 * 1000;
    const validItems: PendingMedia[] = [];
    for (const item of items) {
      if (!item || typeof item.id !== 'string') continue;
      const createdAt = Date.parse(item.createdAt);
      const isQueued = item.status === 'pending_ai' || item.status === 'processing';
      if (
        !(item.blob instanceof Blob) ||
        item.blob.size === 0 ||
        item.attempts >= 2 ||
        !['pending_ai', 'processing', 'done', 'failed'].includes(item.status) ||
        !Number.isFinite(createdAt) ||
        (isQueued && createdAt < cutoff)
      ) {
        await deletePendingMedia(item.id);
        continue;
      }
      validItems.push(item);
    }
    const recovered = validItems.map((item) =>
      item.status === 'processing' ? { ...item, status: 'pending_ai' as const } : item,
    );
    for (let index = 0; index < validItems.length; index += 1) {
      if (validItems[index].status === 'processing') {
        await storePendingMedia(recovered[index]);
      }
    }
    setPendingMediaState(recovered.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    setLoading(false);
  }, [userId]);

  const updateMedia = useCallback(async (media: PendingMedia, requirePersistence = false) => {
    let persisted = true;
    try {
      await storePendingMedia(media);
    } catch (error) {
      persisted = false;
      console.error('Could not cache processed media locally:', error);
      if (requirePersistence) throw error;
    }
    setPendingMediaState((current) => {
      const next = current.filter((item) => item.id !== media.id);
      next.push(media);
      return next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
    return persisted;
  }, []);

  const processPending = useCallback(async () => {
    const activeUserId = userIdRef.current;
    if (!activeUserId || !navigator.onLine || processingRef.current || authPausedRef.current) return;
    processingRef.current = true;
    setIsProcessing(true);
    const processingEpoch = processingEpochRef.current;
    try {
      while (navigator.onLine) {
        if (processingEpoch !== processingEpochRef.current) break;
        const items = await getPendingMediaForUser(activeUserId);
        const now = Date.now();
        const media = items
          .filter((item) =>
            item.status === 'pending_ai' &&
            item.attempts < 2 &&
            (!item.nextRetryAt || Date.parse(item.nextRetryAt) <= now),
          )
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
        if (!media) break;

        if (!(media.blob instanceof Blob) || media.blob.size === 0) {
          await deletePendingMedia(media.id);
          setPendingMediaState((current) => current.filter((item) => item.id !== media.id));
          continue;
        }

        await updateMedia({
          ...media,
          status: 'processing',
          error: undefined,
          errorKind: undefined,
        });
        try {
          const transaction = await processMedia(media);
          if (processingEpoch !== processingEpochRef.current) break;
          await updateMedia({
            ...media,
            status: 'done',
            error: undefined,
            errorKind: undefined,
            nextRetryAt: undefined,
            transaction,
          });
          window.dispatchEvent(new CustomEvent<PendingMedia>('pending-media-processed', {
            detail: {
              ...media,
              status: 'done',
              error: undefined,
              errorKind: undefined,
              nextRetryAt: undefined,
              transaction,
            },
          }));
        } catch (error) {
          if (processingEpoch !== processingEpochRef.current) break;
          const aiError = error instanceof AiRequestError ? error : null;
          const kind = aiError?.kind ?? 'server';
          const attempts = media.attempts + 1;
          const message = aiError?.message ?? (error instanceof Error ? error.message : String(error));
          const failed = kind === 'too_large' || kind === 'invalid' ||
            attempts >= 2;
          if (failed) {
            await deletePendingMedia(media.id);
            setPendingMediaState((current) => current.filter((item) => item.id !== media.id));
            if (kind === 'auth') authPausedRef.current = true;
            break;
          }
          if (kind === 'auth') authPausedRef.current = true;
          const nextRetryAt = kind === 'limit'
            ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
            : undefined;
          await updateMedia({
            ...media,
            status: failed ? 'failed' : 'pending_ai',
            attempts,
            error: kind === 'limit' || kind === 'auth' ? undefined : message,
            errorKind: kind,
            nextRetryAt,
          });
          if (kind === 'limit') {
            if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
            retryTimerRef.current = window.setTimeout(() => {
              retryTimerRef.current = null;
              void processPending();
            }, 30 * 60 * 1000);
          }
          if (failed || kind !== 'server' || !navigator.onLine) break;
          await new Promise((resolve) => window.setTimeout(resolve, Math.min(60_000, 1000 * 2 ** (attempts - 1))));
        }
      }
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  }, [updateMedia]);

  useEffect(() => {
    let mounted = true;
    void refresh().then(() => {
      if (mounted) void processPending();
    }).catch((error: unknown) => {
      console.error('Could not load pending local media:', error);
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [refresh, processPending]);

  useEffect(() => {
    const handleOnline = () => void processPending();
    window.addEventListener('online', handleOnline);
    let mounted = true;
    let removeListener: (() => void) | null = null;
    void CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void processPending();
    }).then((listener) => {
      if (mounted) removeListener = () => void listener.remove();
      else void listener.remove();
    }).catch((error: unknown) => {
      console.error('Could not register media processing resume listener:', error);
    });
    return () => {
      mounted = false;
      window.removeEventListener('online', handleOnline);
      removeListener?.();
    };
  }, [processPending]);

  useEffect(() => () => {
    if (retryTimerRef.current !== null) window.clearTimeout(retryTimerRef.current);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        userIdRef.current = session.user.id;
        authPausedRef.current = false;
        window.setTimeout(() => void processPending(), 0);
      } else if (
        session?.user.id === userIdRef.current &&
        (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')
      ) {
        authPausedRef.current = false;
        window.setTimeout(() => void processPending(), 0);
      }
    });
    return () => subscription.unsubscribe();
  }, [processPending]);

  const queueMedia = useCallback(async (
    type: PendingMedia['type'],
    blob: Blob,
  ): Promise<boolean> => {
    if (!userId) throw new Error('Sign in before saving media to this device.');
    if (!(blob instanceof Blob) || blob.size === 0) {
      throw new Error('The captured media is empty or invalid.');
    }
    const item: PendingMedia = {
      id: createId(),
      type,
      blob,
      mimeType: blob.type || (type === 'voice' ? 'audio/webm' : 'image/jpeg'),
      createdAt: new Date().toISOString(),
      status: 'pending_ai',
      attempts: 0,
      userId,
    };
    if (!navigator.onLine) {
      await updateMedia(item, true);
      return false;
    }

    processingRef.current = true;
    setIsProcessing(true);
    try {
      const transaction = await processMedia(item);
      const completedItem = {
        ...item,
        status: 'done',
        transaction,
      } satisfies PendingMedia;
      await updateMedia(completedItem);
      window.dispatchEvent(new CustomEvent<PendingMedia>('pending-media-processed', {
        detail: completedItem,
      }));
      return true;
    } catch (error) {
      const aiError = error instanceof AiRequestError ? error : null;
      const kind = aiError?.kind ?? 'server';
      const failed = kind === 'too_large' || kind === 'invalid';
      const message = aiError?.message ?? (error instanceof Error ? error.message : String(error));
      const attempts = item.attempts + 1;
      if (failed || attempts >= 2) {
        await deletePendingMedia(item.id);
        setPendingMediaState((current) => current.filter((media) => media.id !== item.id));
        throw error;
      }
      await updateMedia({
        ...item,
        status: 'pending_ai',
        attempts,
        error: kind === 'limit' || kind === 'auth' ? undefined : message,
        errorKind: kind,
        nextRetryAt: kind === 'limit'
          ? new Date(Date.now() + 30 * 60 * 1000).toISOString()
          : undefined,
      });
      if (kind === 'auth') authPausedRef.current = true;
      throw error;
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
      if (navigator.onLine) void processPending();
    }
  }, [processPending, updateMedia, userId]);

  const retryMedia = useCallback(async (id: string) => {
    const item = (await getPendingMediaForUser(userId ?? '')).find((media) => media.id === id);
    if (!item) return;
    await updateMedia({
      ...item,
      attempts: 0,
      status: 'pending_ai',
      error: undefined,
      errorKind: undefined,
      nextRetryAt: undefined,
    });
    if (navigator.onLine) void processPending();
  }, [processPending, updateMedia, userId]);

  const removeMedia = useCallback(async (id: string) => {
    await deletePendingMedia(id);
    setPendingMediaState((current) => current.filter((item) => item.id !== id));
  }, []);

  const deleteMyMedia = useCallback(async () => {
    processingEpochRef.current += 1;
    await deleteAllPendingMedia();
    await deleteAllReceiptImages();
    setPendingMediaState([]);
  }, []);

  const clearAllPending = useCallback(async () => {
    processingEpochRef.current += 1;
    await deleteAllPendingMedia();
    setPendingMediaState([]);
    setIsProcessing(false);
  }, []);

  const pendingCount = pendingMedia.filter(
    (media) => media.status === 'pending_ai' || media.status === 'processing',
  ).length;

  return {
    pendingMedia,
    pendingCount,
    isProcessing,
    loading,
    queueMedia,
    retryMedia,
    removeMedia,
    deleteMyMedia,
    clearAllPending,
    refresh,
  };
}
