import { TrendingUp, TrendingDown, Wallet } from 'lucide-react';
import type { Language } from '@/types';
import { tr } from '@/lib/i18n';
import { formatPKR } from '@/lib/format';

interface BudgetCardProps {
  availableFunds: number;
  totalIncome: number;
  totalExpenses: number;
  language: Language;
  dir: 'ltr' | 'rtl';
}

const now = new Date();

export function BudgetCard({ availableFunds, totalIncome, totalExpenses, language, dir }: BudgetCardProps) {
  const isPositive = availableFunds >= 0;

  return (
    <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-slate-900/80 border border-slate-800 p-5 shadow-xl">
      {/* Available Funds - Hero */}
      <div className={dir === 'rtl' ? 'text-right' : 'text-left'}>
        <div className={`flex items-center gap-2 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
          <Wallet size={18} className={isPositive ? 'text-emerald-400' : 'text-rose-400'} />
          <span className="text-slate-400 text-sm font-medium">{tr('availableFunds', language)}</span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-slate-400 text-sm font-medium">{tr('pkr', language)}</span>
          <span
            className={`text-4xl font-bold tracking-tight tabular-nums ${
              isPositive ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {formatPKR(availableFunds)}
          </span>
        </div>
        <p className="text-slate-500 text-xs mt-1">
          {language === 'ur'
            ? now.toLocaleDateString('ur-PK', { month: 'long', year: 'numeric' })
            : now.toLocaleDateString('en-PK', { month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Sub-counters */}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-slate-950/60 border border-slate-800/60 p-3.5">
          <div className={`flex items-center gap-1.5 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <TrendingUp size={14} className="text-emerald-400" />
            </div>
            <span className="text-slate-400 text-xs">{tr('totalIncome', language)}</span>
          </div>
          <p className="text-emerald-400 font-bold text-lg mt-2 tabular-nums">
            {formatPKR(totalIncome)}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-950/60 border border-slate-800/60 p-3.5">
          <div className={`flex items-center gap-1.5 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
            <div className="w-7 h-7 rounded-lg bg-rose-500/15 flex items-center justify-center">
              <TrendingDown size={14} className="text-rose-400" />
            </div>
            <span className="text-slate-400 text-xs">{tr('totalExpenses', language)}</span>
          </div>
          <p className="text-rose-400 font-bold text-lg mt-2 tabular-nums">
            {formatPKR(totalExpenses)}
          </p>
        </div>
      </div>
    </div>
  );
}
