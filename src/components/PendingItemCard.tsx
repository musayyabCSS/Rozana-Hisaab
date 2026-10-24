import { useState } from 'react';
import { Check } from 'lucide-react';
import { DateInput } from '@/components/ui/DateInput';
import { tr } from '@/lib/i18n';
import { formatPKR, getLocalDateKey } from '@/lib/format';
import { getUpcomingDateText, type UpcomingItem } from '@/lib/upcoming';
import type { Language, NewTransaction } from '@/types';

interface PendingItemCardProps {
  item: Extract<UpcomingItem, { kind: 'pending' }>;
  language: Language;
  onConfirm: (id: string, updates: Partial<NewTransaction>) => Promise<boolean>;
}

// A not-yet-settled expense or income with its Mark Paid / Mark Received action.
export function PendingItemCard({ item, language, onConfirm }: PendingItemCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [confirmDate, setConfirmDate] = useState(getLocalDateKey());
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const Icon = item.icon;
  const isIncome = item.transaction.type === 'income';
  const actionLabel = tr(isIncome ? 'upcomingMarkReceived' : 'billsMarkPaid', language);
  const dateLabel = tr(isIncome ? 'upcomingReceivedDate' : 'billsPaymentDate', language);
  const accent = isIncome
    ? { border: 'border-emerald-500/40', badge: 'bg-emerald-500/15 text-emerald-400', button: 'bg-emerald-500 text-white', soft: 'bg-emerald-500/15 text-emerald-300' }
    : { border: 'border-amber-500/40', badge: 'bg-amber-500/15 text-amber-400', button: 'bg-amber-500 text-ink', soft: 'bg-amber-500/15 text-amber-300' };

  const confirm = async () => {
    setSaving(true);
    setFailed(false);
    // Marking paid/received records it on the day it actually happened.
    const ok = await onConfirm(item.transaction.id, { is_paid: true, transaction_date: confirmDate });
    setSaving(false);
    if (ok) setConfirming(false);
    else setFailed(true);
  };

  return (
    <li className={`rounded-2xl border bg-slate-950/40 p-3 ${item.overdue ? 'border-rose-500/50' : accent.border}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accent.badge}`}>
          <Icon size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-100">{item.label}</p>
          <p className={`text-xs font-semibold ${item.overdue ? 'text-rose-400' : 'text-slate-400'}`}>
            {getUpcomingDateText(item, language)}
          </p>
        </div>
        <p dir="ltr" className={`font-bold tabular-nums ${isIncome ? 'text-emerald-400' : 'text-slate-100'}`}>
          {isIncome ? '+' : '−'}{formatPKR(item.amount)}
        </p>
      </div>
      {confirming ? (
        <div className="mt-3 space-y-2">
          <label className="block text-xs text-slate-400">{dateLabel}</label>
          <DateInput
            value={confirmDate}
            max={getLocalDateKey()}
            onChange={setConfirmDate}
            aria-label={dateLabel}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving || !confirmDate}
              onClick={() => void confirm()}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-bold disabled:opacity-60 ${accent.button}`}
            >
              <Check size={14} />
              {actionLabel}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-xl border border-slate-700 px-3 py-2.5 text-xs text-slate-200"
            >
              {tr('settingsCancel', language)}
            </button>
          </div>
          {failed && <p role="alert" className="text-xs text-rose-300">{tr('upcomingConfirmFailed', language)}</p>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setConfirming(true);
            setConfirmDate(getLocalDateKey());
            setFailed(false);
          }}
          className={`mt-3 w-full rounded-xl px-3 py-2.5 text-xs font-bold ${accent.soft}`}
        >
          {actionLabel}
        </button>
      )}
    </li>
  );
}
