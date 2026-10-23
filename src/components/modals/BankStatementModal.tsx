import { useRef, useState } from 'react';
import { AlertCircle, Check, FileCheck, Loader2, UploadCloud } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Modal } from '@/components/ui/Modal';
import { getLocalDateKey } from '@/lib/format';
import type { Category, Language, NewTransaction, PaymentMethod } from '@/types';
import { CATEGORIES, EXPENSE_CATEGORIES, INCOME_CATEGORIES, getCategoryLabel } from '@/lib/categories';
import { tr } from '@/lib/i18n';

interface BankStatementModalProps {
  open: boolean;
  onClose: () => void;
  language: Language;
  dir: 'ltr' | 'rtl';
  onImport: (txns: NewTransaction[]) => void;
}

interface ParsedLine {
  id: string;
  date: string;
  title: string;
  amount: number;
  type: 'income' | 'expense';
  category: Category;
  paymentMethod: PaymentMethod | null;
  selected: boolean;
}

const CATEGORY_RULES: { keywords: string[]; category: Category }[] = [
  // Before salary, whose 'pay' keyword would otherwise match "office payment".
  { keywords: ['office fund', 'petty cash', 'imprest', 'office expense advance'], category: 'office_funds' },
  { keywords: ['salary', 'payroll', 'wage', 'pay'], category: 'salary' },
  { keywords: ['rent received', 'rental income'], category: 'rental_income' },
  { keywords: ['commission'], category: 'commission' },
  { keywords: ['school fee', 'school fees'], category: 'school_fee' },
  { keywords: ['mechanic', 'car repair'], category: 'mechanic' },
  { keywords: ['transport', 'taxi', 'ride', 'careem', 'bykea', 'bus', 'train'], category: 'transport' },
  { keywords: ['rent', 'house rent'], category: 'rent' },
  { keywords: ['loan repayment', 'loan payment'], category: 'udhaar' },
  { keywords: ['misc', 'other expense'], category: 'misc_expense' },
  { keywords: ['fuel', 'petrol', 'diesel', 'pso', 'shell', 'caltex'], category: 'fuel' },
  { keywords: ['bill', 'electric', 'lesco', 'k-electric', 'gas', 'water', 'internet', 'ptcl', 'wifi'], category: 'bills' },
  { keywords: ['grocery', 'groceries', 'rashan', 'market', 'store', 'carrefour', 'naheed', 'imtiaz'], category: 'groceries' },
  { keywords: ['food', 'foodpanda', 'restaurant', 'cafe', 'dhaba', 'kfc', 'mcdonald', 'pizza', 'burger', 'bakery'], category: 'food' },
  { keywords: ['medical', 'doctor', 'hospital', 'pharmacy', 'clinic', 'medicine', 'lab'], category: 'medical' },
  { keywords: ['business', 'sale', 'sales', 'profit', 'revenue'], category: 'business' },
  { keywords: ['freelance', 'project', 'client', 'upwork', 'fiverr'], category: 'freelance' },
  { keywords: ['loan', 'udhaar', 'borrow', 'lend'], category: 'udhaar' },
];

const CATEGORY_LABEL_LOOKUP: Record<string, Category> = {};
for (const [key, meta] of Object.entries(CATEGORIES)) {
  CATEGORY_LABEL_LOOKUP[meta.label.en.toLowerCase()] = key as Category;
}

function guessCategory(title: string, type: 'income' | 'expense'): Category {
  const lower = title.toLowerCase();
  // Only accept categories matching the line's direction, so e.g. an outgoing
  // "petty cash" debit isn't tagged with the Office Funds income category.
  const allowed = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const matched = CATEGORY_RULES.find((rule) =>
    allowed.includes(rule.category) && rule.keywords.some((keyword) => lower.includes(keyword)),
  )?.category;
  if (matched) return matched;
  return type === 'income' ? 'business' : 'misc_expense';
}

function mapCategoryFromColumn(raw: string, type: 'income' | 'expense'): Category {
  const lower = raw.toLowerCase().trim();
  if (!lower) return guessCategory('', type);
  if (CATEGORY_LABEL_LOOKUP[lower]) return CATEGORY_LABEL_LOOKUP[lower];
  for (const [label, key] of Object.entries(CATEGORY_LABEL_LOOKUP)) {
    if (lower.includes(label)) return key;
  }
  return guessCategory('', type);
}

function mapPaymentMethod(raw: string): PaymentMethod | null {
  const lower = raw.toLowerCase().trim();
  if (!lower) return null;
  if (lower.includes('credit card') || lower === 'card') return 'card';
  if (lower.includes('cash')) return 'cash';
  if (lower.includes('easypaisa')) return 'easypaisa';
  if (lower.includes('jazzcash')) return 'jazzcash';
  if (lower.includes('bank')) return 'bank';
  return null;
}

function normalizeDate(value: unknown): string {
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const raw = String(value ?? '').replace(/\s+00:00:00$/, '').trim();
  const iso = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const parts = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (parts) {
    const year = parts[3].length === 2 ? `20${parts[3]}` : parts[3];
    return `${year}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
  }
  return getLocalDateKey();
}

const TARGET_KEYWORDS = ['date', 'description', 'title', 'narration', 'details', 'money', 'credit', 'debit', 'amount', 'category', 'method', 'inward', 'outward', 'deposit', 'withdrawal'];

function findHeaderRow(rawGrid: unknown[][]): number {
  for (let i = 0; i < rawGrid.length; i++) {
    const row = rawGrid[i];
    if (!Array.isArray(row)) continue;
    let matches = 0;
    for (const cell of row) {
      const cellStr = String(cell || '').toLowerCase().trim();
      if (TARGET_KEYWORDS.some((kw) => cellStr.includes(kw))) matches++;
    }
    if (matches >= 2) return i;
  }
  return -1;
}

function parseCleanNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const str = String(val)
    .replace(/,/g, '')
    .replace(/PKR|Rs|\$|—|–|N\/A|nil/gi, '')
    .trim();
  if (!str || str === '-') return null;
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function shouldIgnoreRow(rowObj: Record<string, unknown>): boolean {
  const values = Object.values(rowObj).map((v) => String(v ?? '').toLowerCase());
  return values.some((v) =>
    v.includes('beginning balance') ||
    v.includes('ending balance') ||
    v.includes('daily ending balance'),
  );
}

function parseRows(rawGrid: unknown[][]): ParsedLine[] {
  const headerRowIndex = findHeaderRow(rawGrid);
  if (headerRowIndex === -1) return [];

  const headers = (rawGrid[headerRowIndex] ?? []).map((h) => String(h || '').trim());
  const dataRows = rawGrid.slice(headerRowIndex + 1);

  return dataRows.flatMap((row, index) => {
    if (!Array.isArray(row) || row.every((c) => !String(c ?? '').trim())) return [];

    const rowObj: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      if (h) rowObj[h] = row[idx];
    });

    if (shouldIgnoreRow(rowObj)) return [];

    const findVal = (keywords: string[]): unknown => {
      for (const [key, val] of Object.entries(rowObj)) {
        const kLower = key.toLowerCase();
        if (keywords.some((kw) => kLower.includes(kw))) return val;
      }
      return null;
    };

    const dateVal = findVal(['date']) ?? getLocalDateKey();
    const titleVal = findVal(['description', 'title', 'narration', 'details']) ?? 'Imported Transaction';
    const title = String(titleVal).trim();
    if (!title) return [];

    const catVal = findVal(['category']);
    const methodVal = findVal(['method', 'payment']);

    const moneyInVal = parseCleanNumber(findVal(['money in', 'money_in', 'credit', 'deposit', 'income', 'inward']));
    const moneyOutVal = parseCleanNumber(findVal(['money out', 'money_out', 'debit', 'withdrawal', 'expense', 'outward']));
    const genericVal = parseCleanNumber(findVal(['amount']));

    let type: 'income' | 'expense' = 'expense';
    let rawAmount = 0;

    if (moneyInVal !== null && moneyInVal > 0) {
      type = 'income';
      rawAmount = moneyInVal;
    } else if (moneyOutVal !== null && moneyOutVal > 0) {
      type = 'expense';
      rawAmount = moneyOutVal;
    } else if (genericVal !== null) {
      type = genericVal >= 0 ? 'income' : 'expense';
      rawAmount = Math.abs(genericVal);
    } else {
      return [];
    }

    if (!Number.isFinite(rawAmount) || rawAmount <= 0) return [];

    const category = catVal ? mapCategoryFromColumn(String(catVal).trim(), type) : guessCategory(title, type);
    const paymentMethod = methodVal ? mapPaymentMethod(String(methodVal).trim()) : null;

    return [{
      id: `parsed-${index}`,
      date: normalizeDate(dateVal),
      title,
      amount: rawAmount,
      type,
      category,
      paymentMethod,
      selected: true,
    }];
  });
}

async function readSpreadsheet(file: File): Promise<ParsedLine[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', raw: false });
  return workbook.SheetNames.flatMap((sheetName) =>
    parseRows(XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: '' })),
  );
}

export function BankStatementModal({ open, onClose, language, dir, onImport }: BankStatementModalProps) {
  const [phase, setPhase] = useState<'upload' | 'parsing' | 'result' | 'error'>('upload');
  const [fileName, setFileName] = useState('');
  const [lines, setLines] = useState<ParsedLine[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File) => {
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
      setFileName(file.name);
      setErrorMsg(
        language === 'ur'
          ? 'صرف CSV یا Excel فائلیں (XLSX, XLS) قبول کی جاتی ہیں۔'
          : 'Unsupported file format. Please upload a CSV or Excel file (XLSX, XLS).',
      );
      setPhase('error');
      return;
    }

    setFileName(file.name);
    setPhase('parsing');
    setErrorMsg('');
    try {
      const parsed = await readSpreadsheet(file);
      if (!parsed.length) throw new Error('No transactions found');
      setLines(parsed);
      setPhase('result');
    } catch (error) {
      console.error('Statement import failed:', error);
      setErrorMsg(tr('bankParseError', language));
      setPhase('error');
    }
  };

  const handleImport = () => {
    onImport(lines.filter((line) => line.selected).map((line) => ({ type: line.type, amount: line.amount, category: line.category, title: line.title, source: 'bank' as const, payment_method: line.paymentMethod ?? 'bank', transaction_date: line.date })));
    handleClose();
  };

  const handleClose = () => {
    setPhase('upload'); setFileName(''); setLines([]); setErrorMsg(''); onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title={phase === 'result' ? 'Review Import' : tr('bankTitle', language)} subtitle={phase === 'result' ? 'Check these transactions before saving' : tr('bankSubtitle', language)} dir={dir}>
      {phase === 'upload' && (
        <label className="block py-6 cursor-pointer">
          <div className="w-full rounded-2xl border-2 border-dashed border-slate-700 hover:border-emerald-500/50 transition-all p-8 flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center"><UploadCloud size={26} className="text-slate-400" /></div>
            <p className="text-slate-300 text-sm font-medium">{tr('bankDropzone', language)}</p>
            <p className="text-slate-500 text-xs">CSV, XLSX, XLS</p>
          </div>
          <input ref={fileRef} type="file" className="hidden" accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleFile(file); event.target.value = ''; }} />
        </label>
      )}
      {phase === 'parsing' && <div className="py-16 flex flex-col items-center"><Loader2 size={40} className="text-emerald-400 animate-spin" /><p className="text-slate-300 text-sm mt-4">AI Analyzing Statement...</p><p className="text-slate-500 text-xs mt-1">{fileName}</p></div>}
      {phase === 'error' && <div className="py-12 flex flex-col items-center gap-4"><AlertCircle size={28} className="text-rose-400" /><p className="text-rose-400 text-sm text-center">{errorMsg}</p><button onClick={() => { setPhase('upload'); fileRef.current?.click(); }} className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-medium">Try Again</button></div>}
      {phase === 'result' && <div>
        <div className="flex items-center justify-between mb-3"><div className="flex items-center gap-2"><FileCheck size={16} className="text-emerald-400" /><p className="text-slate-300 text-sm font-medium">{lines.length} transactions found</p></div><button onClick={() => setLines((current) => current.map((line) => ({ ...line, selected: !current.every((item) => item.selected) })))} className="text-xs text-emerald-400">{lines.every((line) => line.selected) ? 'Deselect All' : 'Select All'}</button></div>
        <div className="space-y-2 mb-4 max-h-[48vh] overflow-y-auto pr-1">{lines.map((line) => <button key={line.id} onClick={() => setLines((current) => current.map((item) => item.id === line.id ? { ...item, selected: !item.selected } : item))} className={`w-full grid grid-cols-[auto_1fr_auto] gap-3 items-center rounded-2xl border p-3 text-left ${line.selected ? 'bg-slate-950/60 border-slate-700' : 'bg-slate-950/30 border-slate-800/50 opacity-50'}`}><span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${line.selected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'}`}>{line.selected && <Check size={12} className="text-white" />}</span><span className="min-w-0"><span className="block text-slate-200 text-sm truncate">{line.title}</span><span className="block text-slate-500 text-[10px] mt-0.5">{line.date} · {getCategoryLabel(line.category, language)}</span></span><span className={`text-sm font-bold tabular-nums ${line.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>{line.type === 'income' ? '+' : '-'} {line.amount.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</span></button>)}</div>
        <button onClick={handleImport} disabled={!lines.some((line) => line.selected)} className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm disabled:opacity-40"><Check size={16} className="inline mr-2" />Confirm Import ({lines.filter((line) => line.selected).length})</button>
      </div>}
    </Modal>
  );
}
