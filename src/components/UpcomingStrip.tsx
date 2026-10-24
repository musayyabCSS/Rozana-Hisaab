import { ChevronLeft, ChevronRight } from 'lucide-react';
import { tr } from '@/lib/i18n';
import { formatPKR } from '@/lib/format';
import { getUpcomingDateText, type UpcomingItem } from '@/lib/upcoming';
import type { Language } from '@/types';

interface UpcomingStripProps {
  items: UpcomingItem[];
  language: Language;
  dir: 'ltr' | 'rtl';
  onOpen: () => void;
}

// Dashboard row of what's due in the next 7 days (or overdue); renders nothing
// otherwise. The badge counts exactly the payments and income shown.
export function UpcomingStrip({ items, language, dir, onOpen }: UpcomingStripProps) {
  if (items.length === 0) return null;
  const dueCount = items.filter((item) => item.kind === 'pending').length;
  const Chevron = dir === 'rtl' ? ChevronLeft : ChevronRight;

  return (
    <section aria-label={tr('upcoming', language)} dir={dir}>
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-bold text-slate-100">{tr('upcoming', language)}</h2>
        <button type="button" onClick={onOpen} className="flex min-h-[32px] items-center gap-1 text-xs font-semibold text-emerald-400">
          {tr('upcomingViewAll', language)}
          {dueCount > 0 && (
            <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {dueCount}
            </span>
          )}
          <Chevron size={14} />
        </button>
      </div>
      <div className="-mx-4 mt-2 flex gap-2.5 overflow-x-auto px-4 pb-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isIncome = item.kind === 'pending' && item.transaction.type === 'income';
          const tone =
            item.kind === 'expected'
              ? { border: 'border-slate-800', badge: 'bg-sky-500/10 text-sky-400', text: 'text-slate-400' }
              : isIncome
                ? { border: 'border-emerald-500/40', badge: 'bg-emerald-500/15 text-emerald-400', text: 'font-semibold text-emerald-400' }
                : { border: 'border-amber-500/50', badge: 'bg-amber-500/15 text-amber-400', text: 'font-semibold text-amber-400' };
          const amount =
            item.kind === 'pending' ? ` · ${isIncome ? '+' : '−'}${formatPKR(item.amount)}` : '';
          return (
            <button
              key={item.key}
              type="button"
              onClick={onOpen}
              className={`flex shrink-0 items-center gap-2.5 rounded-2xl border bg-slate-900 px-3 py-2.5 text-start ${tone.border}`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone.badge}`}>
                <Icon size={18} />
              </span>
              <span>
                <span className="block max-w-[11rem] truncate text-[13px] font-bold text-slate-100">{item.label}</span>
                <span className={`block text-xs ${item.kind === 'pending' && item.overdue ? 'font-semibold text-rose-400' : tone.text}`}>
                  {getUpcomingDateText(item, language)}
                  <span dir="ltr">{amount}</span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
