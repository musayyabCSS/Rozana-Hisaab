import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { tr } from '@/lib/i18n';
import type { Language } from '@/types';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  language: Language;
  dir: 'ltr' | 'rtl';
  onDeleteMedia: () => Promise<void>;
  onDeleteData: () => Promise<void>;
}

type DeleteAction = 'media' | 'data';

export function SettingsModal({
  open,
  onClose,
  language,
  dir,
  onDeleteMedia,
  onDeleteData,
}: SettingsModalProps) {
  const [confirming, setConfirming] = useState<DeleteAction | null>(null);
  const [deleted, setDeleted] = useState<DeleteAction | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);

  const deleteItems = async (action: DeleteAction) => {
    setDeleting(true);
    setError(false);
    try {
      if (action === 'media') await onDeleteMedia();
      else await onDeleteData();
      setDeleted(action);
      setConfirming(null);
    } catch (deleteError) {
      console.error(`Could not delete local ${action}:`, deleteError);
      setError(true);
    } finally {
      setDeleting(false);
    }
  };

  const handleClose = () => {
    setConfirming(null);
    setDeleted(null);
    setError(false);
    onClose();
  };

  const renderDeleteAction = (
    action: DeleteAction,
    titleKey: string,
    helpKey: string,
    successKey: string,
  ) => (
    <section className="space-y-2 border-t border-slate-800 pt-4">
      <h3 className="font-semibold text-slate-100">{tr(titleKey, language)}</h3>
      <p className="text-xs text-slate-400">{tr(helpKey, language)}</p>
      {deleted === action ? (
        <p role="status" className="text-xs text-emerald-300">{tr(successKey, language)}</p>
      ) : confirming === action ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void deleteItems(action)}
            disabled={deleting}
            className="flex-1 rounded-lg bg-rose-600 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-60"
          >
            {tr('settingsConfirmDeleteMedia', language)}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(null)}
            className="flex-1 rounded-lg border border-slate-700 px-3 py-2.5 text-xs text-slate-200"
          >
            {tr('settingsCancel', language)}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setConfirming(action);
            setDeleted(null);
            setError(false);
          }}
          className="w-full rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs font-semibold text-rose-300"
        >
          {tr(titleKey, language)}
        </button>
      )}
    </section>
  );

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={tr('settingsTitle', language)}
      dir={dir}
    >
      <div className="space-y-5 text-sm">
        <div className="space-y-3 text-slate-300">
          <p>{tr('privacyDeviceTransactions', language)}</p>
          <p>{tr('privacyMediaProcessing', language)}</p>
          <p>{tr('privacyDeleteSettings', language)}</p>
        </div>
        {error && (
          <p role="alert" className="text-xs text-rose-300">
            {tr('settingsDeletionFailed', language)}
          </p>
        )}
        {renderDeleteAction('data', 'settingsDeleteData', 'settingsDeleteDataHelp', 'settingsDataDeleted')}
        {renderDeleteAction('media', 'settingsDeleteMedia', 'settingsDeleteMediaHelp', 'settingsMediaDeleted')}
      </div>
    </Modal>
  );
}
