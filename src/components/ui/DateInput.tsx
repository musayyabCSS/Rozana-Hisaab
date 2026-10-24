import { useRef } from 'react';
import { CalendarDays } from 'lucide-react';
import { formatDate } from '@/lib/format';

interface DateInputProps {
  id?: string;
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  className?: string;
  'aria-label'?: string;
}

// A native date input displays dates in the device's locale (e.g. mm/dd/yyyy),
// which pages cannot change. This shows the value as dd/mm/yyyy and opens the
// native calendar picker from a hidden input when tapped.
export function DateInput({ id, value, onChange, min, max, className = '', ...rest }: DateInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const openPicker = () => {
    const input = inputRef.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      // Older WebViews without showPicker(): focusing and clicking opens the picker.
      input.focus();
      input.click();
    }
  };

  return (
    <div className="relative">
      <button
        id={id}
        type="button"
        onClick={openPicker}
        aria-label={rest['aria-label']}
        className={`flex w-full items-center justify-between gap-2 text-start ${className}`}
      >
        <span dir="ltr" className="tabular-nums">{value ? formatDate(value) : 'dd/mm/yyyy'}</span>
        <CalendarDays size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
      </button>
      <input
        ref={inputRef}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
      />
    </div>
  );
}
