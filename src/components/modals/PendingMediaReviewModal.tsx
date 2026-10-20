import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { formatPKR } from '@/lib/format';
import { tr } from '@/lib/i18n';
import type { Language, Transaction } from '@/types';
import type { PendingMedia } from '@/lib/localStore';

interface PendingMediaReviewModalProps {
  media: PendingMedia | null;
  language: Language;
  dir: 'ltr' | 'rtl';
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
  onSave: (media: PendingMedia, transaction: Transaction) => Promise<void>;
}

export function PendingMediaReviewModal({
  media,
  language,
  dir,
  onRetry,
  onDiscard,
  onSave,
}: PendingMediaReviewModalProps) {
  const transaction = media?.transaction;
  const isUrdu = language === 'ur';
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!media || media.type !== 'receipt') {
      setReceiptPreview(null);
      return;
    }
    const url = URL.createObjectURL(media.blob);
    setReceiptPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [media]);

  return (
    <Modal
      open={media !== null}
      onClose={() => media && onDiscard(media.id)}
      title={tr('mediaReviewTitle', language)}
      dir={dir}
    >
      {media?.status === 'failed' ? (
        <div className="space-y-4">
          <p role="alert" className="text-sm text-amber-300">
            {tr('mediaFailure', language)}
          </p>
          {media.error && <p className="break-words text-xs text-slate-400">{media.error}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => onRetry(media.id)}
              className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950"
            >
              {tr('mediaRetry', language)}
            </button>
            <button
              type="button"
              onClick={() => onDiscard(media.id)}
              className="flex-1 rounded-xl border border-slate-700 px-4 py-3 text-sm text-slate-200"
            >
              {tr('mediaDiscard', language)}
            </button>
          </div>
        </div>
      ) : transaction ? (
        <div className="space-y-4">
          {media.type === 'receipt' && receiptPreview && (
            <img
              src={receiptPreview}
              alt={isUrdu ? 'رسید کی تصویر' : 'Receipt photo'}
              className="max-h-48 w-full rounded-xl object-contain"
            />
          )}
          <dl className="space-y-2 rounded-xl bg-slate-950/60 p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">{isUrdu ? 'تفصیل' : 'Title'}</dt>
              <dd className="text-right font-medium text-slate-100">{transaction.title}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">{isUrdu ? 'رقم' : 'Amount'}</dt>
              <dd className="font-semibold text-emerald-300">{formatPKR(transaction.amount)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">{isUrdu ? 'تاریخ' : 'Date'}</dt>
              <dd className="text-slate-200">{transaction.transaction_date}</dd>
            </div>
          </dl>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => void onSave(media, transaction)}
              className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950"
            >
              {tr('mediaSaveTransaction', language)}
            </button>
            <button
              type="button"
              onClick={() => onDiscard(media.id)}
              className="flex-1 rounded-xl border border-slate-700 px-4 py-3 text-sm text-slate-200"
            >
              {tr('mediaDiscard', language)}
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
