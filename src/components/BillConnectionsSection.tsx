import { useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { tr } from '@/lib/i18n';
import { formatDate, getLocalDateKey } from '@/lib/format';
import { BILLING_INTERVAL_OPTIONS, getConnectionLabel, getNextExpectedIssueDate } from '@/lib/billConnections';
import type { BillConnection, Language } from '@/types';

interface BillConnectionsSectionProps {
  connections: BillConnection[];
  language: Language;
  onRename: (id: string, nickname: string) => Promise<boolean>;
  onSetInterval: (id: string, months: number) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

export function BillConnectionsSection({
  connections,
  language,
  onRename,
  onSetInterval,
  onDelete,
}: BillConnectionsSectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const today = getLocalDateKey();

  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    setFailed(false);
    const ok = await action();
    setBusy(false);
    if (!ok) setFailed(true);
    return ok;
  };

  return (
    <section className="space-y-2 border-t border-slate-800 pt-4">
      <h3 className="font-semibold text-slate-100">{tr('myBillsTitle', language)}</h3>
      <p className="text-xs text-slate-400">{tr('myBillsHelp', language)}</p>
      {connections.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-700 px-3 py-3 text-center text-xs text-slate-500">
          {tr('myBillsEmpty', language)}
        </p>
      ) : (
        <ul className="space-y-2">
          {connections.map((connection) => {
            const expected = getNextExpectedIssueDate(connection.last_issue_date, connection.billing_interval_months);
            const isEditing = editingId === connection.id;
            return (
              <li key={connection.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={nickname}
                      onChange={(event) => setNickname(event.target.value)}
                      placeholder={connection.provider}
                      aria-label={tr('billNickname', language)}
                      className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                      autoFocus
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() => onRename(connection.id, nickname)).then((ok) => ok && setEditingId(null))
                      }
                      aria-label={tr('myBillsSave', language)}
                      className="rounded-lg bg-emerald-500 p-2 text-white disabled:opacity-60"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      aria-label={tr('settingsCancel', language)}
                      className="rounded-lg border border-slate-700 p-2 text-slate-300"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-100">{getConnectionLabel(connection)}</p>
                      <p className="truncate text-xs text-slate-500" dir="ltr">
                        {connection.nickname ? `${connection.provider} · ` : ''}
                        {connection.consumer_number}
                      </p>
                      {expected && (
                        <p className={`mt-1 text-xs ${expected < today ? 'text-amber-300' : 'text-emerald-300'}`}>
                          {tr(expected < today ? 'myBillsOverdue' : 'myBillsNextExpected', language).replace(
                            '{date}',
                            formatDate(expected),
                          )}
                        </p>
                      )}
                      <label className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                        {tr('myBillsInterval', language)}
                        <select
                          value={connection.billing_interval_months}
                          disabled={busy}
                          onChange={(event) =>
                            void run(() => onSetInterval(connection.id, Number(event.target.value)))
                          }
                          className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100 focus:border-emerald-500 focus:outline-none"
                        >
                          {BILLING_INTERVAL_OPTIONS.map((months) => (
                            <option key={months} value={months}>
                              {tr(`myBillsEvery${months}`, language)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(connection.id);
                          setNickname(connection.nickname ?? '');
                          setConfirmDeleteId(null);
                        }}
                        aria-label={tr('myBillsRename', language)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(connection.id)}
                        aria-label={tr('myBillsDelete', language)}
                        className="rounded-lg p-2 text-rose-400 hover:bg-rose-500/10"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                )}
                {confirmDeleteId === connection.id && !isEditing && (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(() => onDelete(connection.id)).then((ok) => ok && setConfirmDeleteId(null))
                      }
                      className="flex-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {tr('myBillsConfirmDelete', language)}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200"
                    >
                      {tr('settingsCancel', language)}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {failed && (
        <p role="alert" className="text-xs text-rose-300">{tr('myBillsFailed', language)}</p>
      )}
    </section>
  );
}
