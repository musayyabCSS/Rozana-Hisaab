import { useState } from 'react';
import { FileText, FileSpreadsheet, FileJson, Share2, TrendingUp, TrendingDown, Wallet, Check } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Modal } from '@/components/ui/Modal';
import type { Language, Transaction } from '@/types';
import { tr } from '@/lib/i18n';
import { formatPKR, getLocalDateKey } from '@/lib/format';
import { getCategoryLabel } from '@/lib/categories';

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  language: Language;
  dir: 'ltr' | 'rtl';
  transactions: Transaction[];
}

type Period = 'day' | 'week' | 'month' | 'custom' | 'lifetime';
type Format = 'pdf' | 'excel' | 'csv';

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function writeAndShareNativeFile(content: string, filename: string, mime: string): Promise<void> {
  const bytes = new TextEncoder().encode(content);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  const base64Data = btoa(binary);
  const writeResult = await Filesystem.writeFile({
    path: filename,
    data: base64Data,
    directory: Directory.Cache,
    recursive: true,
  });
  await Share.share({
    title: 'Rozana Hisaab Statement',
    text: 'Here is my exported statement from Rozana Hisaab.',
    url: writeResult.uri,
    dialogTitle: 'Save or Share Statement',
    ...(mime ? { files: [writeResult.uri] } : {}),
  });
}

function buildCSV(txns: Transaction[], lang: Language): string {
  const headers = ['Date', 'Type', 'Category', 'Title', 'Amount (PKR)', 'Payment Method', 'Source'];
  const rows = txns.map((t) => [
    t.transaction_date,
    t.type,
    getCategoryLabel(t.category, lang),
    `"${t.title.replace(/"/g, '""')}"`,
    String(t.amount),
    t.payment_method || '',
    t.source,
  ]);
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

function buildExcelHTML(txns: Transaction[], lang: Language, income: number, expenses: number, net: number): string {
  const rows = txns
    .map(
      (t) => `<tr>
      <td>${t.transaction_date}</td>
      <td>${t.type}</td>
      <td>${getCategoryLabel(t.category, lang)}</td>
      <td>${t.title.replace(/</g, '&lt;')}</td>
      <td style="text-align:right">${t.amount}</td>
      <td>${t.payment_method || ''}</td>
      <td>${t.source}</td>
    </tr>`,
    )
    .join('');
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"></head>
<body>
<table>
  <tr><th colspan="7" style="font-size:16px;font-weight:bold">Rozana Hisaab - Transaction Report</th></tr>
  <tr><td colspan="4"><b>Total Income:</b></td><td style="text-align:right">${income}</td></tr>
  <tr><td colspan="4"><b>Total Expenses:</b></td><td style="text-align:right">${expenses}</td></tr>
  <tr><td colspan="4"><b>Net Balance:</b></td><td style="text-align:right">${net}</td></tr>
  <tr></tr>
  <tr><th>Date</th><th>Type</th><th>Category</th><th>Title</th><th>Amount (PKR)</th><th>Payment</th><th>Source</th></tr>
  ${rows}
</table>
</body></html>`;
}

function buildPrintableHTML(txns: Transaction[], lang: Language, income: number, expenses: number, net: number): string {
  const isUrdu = lang === 'ur';
  const rows = txns
    .map(
      (t) => `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${t.transaction_date}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${t.type}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${getCategoryLabel(t.category, lang)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee">${t.title.replace(/</g, '&lt;')}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:600">${formatPKR(Number(t.amount))}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="${isUrdu ? 'ur' : 'en'}" dir="${isUrdu ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rozana Hisaab Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; padding: 24px; max-width: 800px; margin: 0 auto; background: #fff; }
    h1 { font-size: 24px; margin: 0 0 4px 0; color: #0f172a; }
    .subtitle { color: #64748b; font-size: 13px; margin: 0 0 20px 0; }
    .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
    .summary div { padding: 14px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0; }
    .summary .label { font-size: 11px; color: #64748b; text-transform: uppercase; margin-bottom: 4px; font-weight: 600; }
    .summary .value { font-size: 18px; font-weight: 700; }
    .income .value { color: #059669; }
    .expense .value { color: #e11d48; }
    .net .value { color: ${net >= 0 ? '#059669' : '#e11d48'}; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
    th { text-align: ${isUrdu ? 'right' : 'left'}; padding: 10px 12px; background: #f1f5f9; font-weight: 600; color: #475569; }
    .footer { margin-top: 24px; font-size: 11px; color: #94a3b8; text-align: center; }
    .print-bar { margin-bottom: 20px; display: flex; justify-content: flex-end; }
    .print-btn { background: #059669; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="print-bar no-print">
    <button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
  </div>
  <h1>Rozana Hisaab</h1>
  <p class="subtitle">Transaction Report &bull; Generated ${new Date().toLocaleDateString('en-PK')}</p>
  <div class="summary">
    <div class="income"><div class="label">Total Income</div><div class="value">PKR ${formatPKR(income)}</div></div>
    <div class="expense"><div class="label">Total Expenses</div><div class="value">PKR ${formatPKR(expenses)}</div></div>
    <div class="net"><div class="label">Net Balance</div><div class="value">PKR ${formatPKR(net)}</div></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Category</th>
        <th>Title</th>
        <th style="text-align:right">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="footer">Generated by Rozana Hisaab</p>
</body>
</html>`;
}

export function ExportModal({ open, onClose, language, dir, transactions }: ExportModalProps) {
  const now = new Date();
  const todayStr = getLocalDateKey(now);
  const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const [period, setPeriod] = useState<Period>('month');
  const [startDate, setStartDate] = useState(monthStartStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [format, setFormat] = useState<Format>('csv');
  const [exported, setExported] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const getFilteredTxns = (): Transaction[] => {
    if (period === 'lifetime') return transactions;
    if (period === 'day') {
      return transactions.filter((t) => t.transaction_date === todayStr);
    }
    if (period === 'week') {
      const weekAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      const weekAgoStr = getLocalDateKey(weekAgo);
      return transactions.filter((t) => t.transaction_date >= weekAgoStr && t.transaction_date <= todayStr);
    }
    if (period === 'month') {
      const y = now.getFullYear();
      const m = now.getMonth();
      const monthStart = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      return transactions.filter((t) => t.transaction_date >= monthStart && t.transaction_date <= todayStr);
    }
    if (period === 'custom') {
      return transactions.filter((t) => t.transaction_date >= startDate && t.transaction_date <= endDate);
    }
    return transactions;
  };

  const filtered = getFilteredTxns();
  const totalIncome = filtered.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  const totalExpenses = filtered.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const netBalance = totalIncome - totalExpenses;

  const periods: { key: Period; label: string }[] = [
    { key: 'day', label: tr('exportDay', language) },
    { key: 'week', label: tr('exportWeek', language) },
    { key: 'month', label: tr('exportMonth', language) },
    { key: 'custom', label: tr('exportCustom', language) },
    { key: 'lifetime', label: tr('exportLifetime', language) },
  ];

  const formats: { key: Format; label: string; icon: typeof FileText }[] = [
    { key: 'csv', label: tr('exportCsv', language), icon: FileJson },
    { key: 'excel', label: tr('exportExcel', language), icon: FileSpreadsheet },
    { key: 'pdf', label: tr('exportPdf', language), icon: FileText },
  ];

  const handleGenerate = async () => {
    const timestamp = Date.now();
    const stamp = getLocalDateKey();
    setExporting(true);
    setExportError(null);
    try {
      if (format === 'csv') {
        const csv = buildCSV(filtered, language);
        const filename = Capacitor.isNativePlatform()
          ? `Rozana_Hisaab_Export_${timestamp}.csv`
          : `rozana-hisaab-${stamp}.csv`;
        if (Capacitor.isNativePlatform()) {
          await writeAndShareNativeFile(csv, filename, 'text/csv;charset=utf-8');
        } else {
          downloadBlob(csv, filename, 'text/csv;charset=utf-8');
        }
      } else if (format === 'excel') {
        const html = buildExcelHTML(filtered, language, totalIncome, totalExpenses, netBalance);
        const filename = Capacitor.isNativePlatform()
          ? `Rozana_Hisaab_Export_${timestamp}.xls`
          : `rozana-hisaab-${stamp}.xls`;
        if (Capacitor.isNativePlatform()) {
          await writeAndShareNativeFile(html, filename, 'application/vnd.ms-excel');
        } else {
          downloadBlob(html, filename, 'application/vnd.ms-excel');
        }
      } else if (format === 'pdf') {
        const html = buildPrintableHTML(filtered, language, totalIncome, totalExpenses, netBalance);
        const filename = Capacitor.isNativePlatform()
          ? `Rozana_Hisaab_Report_${timestamp}.html`
          : `rozana-hisaab-${stamp}.html`;
        if (Capacitor.isNativePlatform()) {
          await writeAndShareNativeFile(html, filename, 'text/html');
        } else {
          const w = window.open('', '_blank');
          if (w) {
            w.document.write(html);
            w.document.close();
          } else {
            downloadBlob(html, filename, 'text/html');
          }
        }
      }

      setExported(true);
      window.setTimeout(() => {
        setExported(false);
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Could not export the statement:', error);
      setExportError(
        error instanceof Error
          ? error.message
          : language === 'ur'
            ? 'فائل برآمد نہیں ہو سکی۔ دوبارہ کوشش کریں۔'
            : 'Could not export the file. Please try again.',
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tr('exportTitle', language)}
      subtitle={tr('exportSubtitle', language)}
      dir={dir}
    >
      <div className="mb-4">
        <label className="text-slate-400 text-xs block mb-2">{tr('exportPeriod', language)}</label>
        <div className="flex flex-wrap gap-2">
          {periods.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                period === p.key
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {period === 'custom' && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-slate-400 text-xs block mb-1">{tr('startDate', language)}</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="text-slate-400 text-xs block mb-1">{tr('endDate', language)}</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-slate-950/60 border border-slate-800 p-4 mb-4">
        <div className="space-y-2.5">
          <div className={`flex items-center gap-2 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
            <TrendingUp size={14} className="text-emerald-400" />
            <span className="text-slate-400 text-xs flex-1">{tr('totalIncome', language)}</span>
            <span className="text-emerald-400 font-bold text-sm tabular-nums">{formatPKR(totalIncome)}</span>
          </div>
          <div className={`flex items-center gap-2 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
            <TrendingDown size={14} className="text-rose-400" />
            <span className="text-slate-400 text-xs flex-1">{tr('totalExpenses', language)}</span>
            <span className="text-rose-400 font-bold text-sm tabular-nums">{formatPKR(totalExpenses)}</span>
          </div>
          <div className="border-t border-slate-800 pt-2.5">
            <div className={`flex items-center gap-2 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
              <Wallet size={14} className={netBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
              <span className="text-slate-300 text-xs font-medium flex-1">{tr('netBalance', language)}</span>
              <span
                className={`font-bold text-sm tabular-nums ${
                  netBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatPKR(netBalance)}
              </span>
            </div>
          </div>
        </div>
        <p className="text-slate-600 text-xs mt-3">
          {filtered.length} {language === 'ur' ? 'لین دین' : 'transactions'}
        </p>
      </div>

      <div className="mb-5">
        <label className="text-slate-400 text-xs block mb-2">{tr('exportFormat', language)}</label>
        <div className="space-y-2">
          {formats.map((f) => {
            const Icon = f.icon;
            return (
              <button
                key={f.key}
                onClick={() => setFormat(f.key)}
                className={`w-full flex items-center gap-3 rounded-xl border p-3 transition-all ${
                  format === f.key
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    format === f.key ? 'bg-emerald-500/20' : 'bg-slate-800'
                  }`}
                >
                  <Icon size={18} className={format === f.key ? 'text-emerald-400' : 'text-slate-400'} />
                </div>
                <span className={`text-sm ${format === f.key ? 'text-slate-100 font-medium' : 'text-slate-400'}`}>
                  {f.label}
                </span>
                <div
                  className={`ms-auto w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    format === f.key ? 'border-emerald-500 bg-emerald-500' : 'border-slate-600'
                  }`}
                >
                  {format === f.key && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <button
        onClick={handleGenerate}
        disabled={exported || exporting || filtered.length === 0}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm hover:from-emerald-400 hover:to-teal-500 transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {exporting ? (
          <span>{language === 'ur' ? 'فائل تیار ہو رہی ہے...' : 'Preparing export...'}</span>
        ) : exported ? (
          <>
            <Check size={16} />
            {language === 'ur' ? 'برآمد ہو گیا' : 'Exported!'}
          </>
        ) : (
          <>
            <Share2 size={16} />
            {tr('generateShare', language)}
          </>
        )}
      </button>
      {exportError && (
        <p role="alert" className="mt-3 text-center text-sm text-rose-300">
          {exportError}
        </p>
      )}
    </Modal>
  );
}