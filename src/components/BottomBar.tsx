import { ScanLine, Mic, Plus, FileDown } from 'lucide-react';
import type { Language } from '@/types';
import { tr } from '@/lib/i18n';

interface BottomBarProps {
  language: Language;
  dir: 'ltr' | 'rtl';
  onScan: () => void;
  onVoice: () => void;
  onAdd: () => void;
  onExport: () => void;
}

export function BottomBar({ language, dir, onScan, onVoice, onAdd, onExport }: BottomBarProps) {
  const actions = [
    { key: 'scan', label: tr('scan', language), icon: ScanLine, onClick: onScan, highlight: false },
    { key: 'voice', label: tr('voice', language), icon: Mic, onClick: onVoice, highlight: true },
    { key: 'add', label: tr('add', language), icon: Plus, onClick: onAdd, highlight: false },
    { key: 'export', label: tr('export', language), icon: FileDown, onClick: onExport, highlight: false },
  ];

  // For RTL, we don't reverse since flex handles it, but we want the order to mirror
  const orderedActions = dir === 'rtl' ? [...actions].reverse() : actions;

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 pb-[env(safe-area-inset-bottom)]">
      <div className="max-w-md mx-auto px-4 pb-3 pt-2">
        <div className="flex items-end justify-around gap-2 bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl px-3 py-2.5 shadow-2xl shadow-black/50">
          {orderedActions.map((action) => {
            const Icon = action.icon;
            if (action.highlight) {
              return (
                <button
                  key={action.key}
                  onClick={action.onClick}
                  className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
                >
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30 -mt-5 border-4 border-slate-900">
                    <Icon size={24} className="text-white" />
                  </div>
                  <span className="text-emerald-400 text-[10px] font-medium">{action.label}</span>
                </button>
              );
            }
            return (
              <button
                key={action.key}
                onClick={action.onClick}
                className="flex flex-col items-center gap-1 active:scale-95 transition-transform"
              >
                <div className="w-11 h-11 rounded-2xl bg-slate-800/80 flex items-center justify-center hover:bg-slate-700 transition-colors">
                  <Icon size={19} className="text-slate-300" />
                </div>
                <span className="text-slate-400 text-[10px] font-medium">{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
