import { ScanLine, Mic, Plus, ReceiptText } from 'lucide-react';
import type { Language } from '@/types';
import { tr } from '@/lib/i18n';

interface BottomBarProps {
  language: Language;
  dir: 'ltr' | 'rtl';
  onScan: () => void;
  onVoice: () => void;
  onAdd: () => void;
  onBills: () => void;
  // Unpaid bills due within 7 days or overdue; shown as a badge on the Bills button.
  billsBadge: number;
}

export function BottomBar({ language, dir, onScan, onVoice, onAdd, onBills, billsBadge }: BottomBarProps) {
  const actions = [
    { key: 'scan', label: tr('scan', language), icon: ScanLine, onClick: onScan },
    { key: 'voice', label: tr('voice', language), icon: Mic, onClick: onVoice },
    { key: 'add', label: tr('add', language), icon: Plus, onClick: onAdd },
    { key: 'bills', label: tr('bills', language), icon: ReceiptText, onClick: onBills },
  ];

  // For RTL, we don't reverse since flex handles it, but we want the order to mirror
  const orderedActions = dir === 'rtl' ? [...actions].reverse() : actions;

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-md mx-auto px-4 pb-3 pt-2">
        <div className="flex items-end justify-around gap-2 bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl px-3 py-2.5 shadow-2xl shadow-black/50">
          {orderedActions.map((action) => {
            const Icon = action.icon;
            // All actions look alike at rest; the green highlight only shows while pressed.
            return (
              <button
                key={action.key}
                onClick={action.onClick}
                className="group relative flex flex-col items-center gap-1 active:scale-95 transition-transform focus:outline-none"
              >
                {action.key === 'bills' && billsBadge > 0 && (
                  <span className="absolute -top-1 -end-1.5 z-10 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-slate-900 bg-rose-500 px-1 text-[10px] font-bold text-white">
                    {billsBadge}
                  </span>
                )}
                <div className="w-11 h-11 rounded-2xl bg-slate-800/80 flex items-center justify-center transition-colors group-hover:bg-slate-700 group-active:bg-emerald-500 group-active:shadow-lg group-active:shadow-emerald-500/30 group-focus-visible:ring-2 group-focus-visible:ring-emerald-500/60">
                  <Icon size={21} className="text-slate-300 transition-colors group-active:text-white" />
                </div>
                <span className="text-slate-400 text-[10px] font-medium transition-colors group-active:text-emerald-400">{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
