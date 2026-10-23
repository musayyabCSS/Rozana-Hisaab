import { Modal } from '@/components/ui/Modal';
import { tr } from '@/lib/i18n';
import type { Language } from '@/types';

interface PrivacyConsentModalProps {
  open: boolean;
  onAccept: () => void;
  onCancel: () => void;
  language: Language;
  dir: 'ltr' | 'rtl';
}

export function PrivacyConsentModal({
  open,
  onAccept,
  onCancel,
  language,
  dir,
}: PrivacyConsentModalProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={tr('consentTitle', language)}
      dir={dir}
    >
      <div className="space-y-5">
        <p className="text-sm leading-relaxed text-slate-300">
          {tr('consentDescription', language)}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onAccept}
            className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-ink"
          >
            {tr('consentContinue', language)}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-slate-700 px-4 py-3 text-sm text-slate-200"
          >
            {tr('consentCancel', language)}
          </button>
        </div>
      </div>
    </Modal>
  );
}
