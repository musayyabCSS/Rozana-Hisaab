import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, Square, Check, Pencil, AlertCircle, Loader2, Volume2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import type { Language, Category, NewTransaction, TransactionType, PaymentMethod } from '@/types';
import { tr } from '@/lib/i18n';
import { CATEGORIES, getCategoryLabel, INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '@/lib/categories';
import { formatPKR } from '@/lib/format';
import { isFutureDate } from '@/lib/format';
import { parseVoice, transcribeAudioWithWhisper } from '@/lib/ai';

interface VoiceModalProps {
  open: boolean;
  onClose: () => void;
  language: Language;
  dir: 'ltr' | 'rtl';
  onSave: (txn: NewTransaction) => void;
}

interface ParsedResult {
  amount: number;
  category: Category;
  title: string;
  type: TransactionType;
  paymentMethod: PaymentMethod | null;
  date: string;
}

const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  salary: ['salary', 'تنخواہ', 'tankhuwa', 'pay', 'wage'],
  business: ['business', 'کاروبار', 'karobar', 'sale', 'sales', 'profit'],
  freelance: ['freelance', 'فری لانس', 'project', 'client'],
  rental_income: ['rental income', 'rent received', 'کرایہ آمدنی', 'kiraya aaya'],
  commission: ['commission', 'کمیشن'],
  loan: ['loan received', 'قرض ملا', 'qarz mila'],
  scholarship: ['scholarship', 'وظیفہ'],
  fuel: ['petrol', 'پیٹرول', 'petro', 'fuel', 'gas', 'diesel', 'shell', 'pso', 'caltex'],
  bills: ['bill', 'بل', 'bijli', 'بجلی', 'electric', 'gas bill', 'water bill', 'internet', 'wifa', 'وائی فائی', 'wifi'],
  groceries: ['grocery', 'rashan', 'راشن', 'groceries', 'sabzi', 'سبزی', 'store', 'market'],
  medical: ['medical', 'علاج', 'ilaj', 'doctor', 'دوائ', 'dawai', 'medicine', 'hospital', 'pharmacy', 'clinic'],
  udhaar: ['loan repayment', 'udhaar', 'ادھار', 'قرض کی ادائیگی', 'qarz dena', 'repayment'],
  rent: ['rent', 'کرایہ', 'kiraya'],
  school_fee: ['school fee', 'school fees', 'اسکول فیس', 'fee'],
  mechanic: ['mechanic', 'مکینک', 'car repair', 'گاڑی کی مرمت'],
  misc_expense: ['misc', 'other expense', 'متفرق', 'دوسرا خرچ'],
};

const INCOME_KEYWORDS = ['salary', 'تنخواہ', 'business', 'کاروبار', 'freelance', 'فری لانس', 'rental income', 'commission', 'scholarship', 'income', 'آمدنی', 'earned', 'received', 'milega', 'پیسے ملے', 'payment received', 'payment aaya', 'qarz mila', 'قرض ملا'];

function fallbackParse(text: string): ParsedResult {
  const lower = text.toLowerCase().trim();
  const amountMatch = lower.match(/(\d[\d,]*)/);
  const amount = amountMatch ? parseInt(amountMatch[1].replace(/,/g, ''), 10) : 0;
  let matchedCategory: Category = 'bills';
  let bestScore = 0;
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        if (kw.length > bestScore) { bestScore = kw.length; matchedCategory = cat as Category; }
      }
    }
  }
  const isIncome = INCOME_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
  const type: TransactionType = isIncome ? 'income' : 'expense';
  const date = new Date();
  if (/\b(day before yesterday|parso)\b/.test(lower)) {
    date.setDate(date.getDate() - 2);
  } else if (/\b(yesterday|kal)\b/.test(lower)) {
    date.setDate(date.getDate() - 1);
  } else {
    const explicitDate = lower.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
    if (explicitDate) {
      const parsedDate = new Date(
        Number(explicitDate[1]),
        Number(explicitDate[2]) - 1,
        Number(explicitDate[3]),
      );
      if (!Number.isNaN(parsedDate.getTime())) {
        date.setTime(parsedDate.getTime());
      }
    }
  }
  let title = text.trim();
  if (title.length > 60) title = title.slice(0, 60) + '...';
  if (!title) title = getCategoryLabel(matchedCategory, 'en');
  return {
    amount,
    category: matchedCategory,
    title,
    type,
    paymentMethod: null,
    date: date.toISOString().split('T')[0],
  };
}

function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/wav'];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function VoiceModal({ open, onClose, language, dir, onSave }: VoiceModalProps) {
  const [transcript, setTranscript] = useState('');
  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState<Category>('bills');
  const [editTitle, setEditTitle] = useState('');
  const [editType, setEditType] = useState<TransactionType>('expense');
  const [editDate, setEditDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'transcribing' | 'transcript' | 'parsing' | 'result'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const releaseMicrophone = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
        track.enabled = false;
      });
      streamRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;
    releaseMicrophone();
    chunksRef.current = [];
  }, [releaseMicrophone]);

  useEffect(() => {
    if (!open) cleanup();
  }, [open, cleanup]);

  useEffect(() => {
    return () => { releaseMicrophone(); };
  }, [releaseMicrophone]);

  const startRecording = async () => {
    setError(null);
    setTranscript('');
    setParsed(null);
    setRecordSeconds(0);
    setPhase('recording');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => { void handleAudioReady(); };
      mediaRecorderRef.current = recorder;
      recorder.start();
      timerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch (err) {
      console.error('Mic access failed:', err);
      setPhase('idle');
      const msg = language === 'ur'
        ? 'براہ کرم سفاری کی سیٹنگز میں مائیکروفون تک رسائی کی اجازت دیں۔'
        : 'Please allow microphone access in Safari settings.';
      setError(msg);
    }
  };

  const stopRecording = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    releaseMicrophone();
  };

  const handleAudioReady = async () => {
    setPhase('transcribing');
    const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];
    if (blob.size === 0) {
      setError(language === 'ur' ? 'کوئی آواز ریکارڈ نہیں ہوئی۔' : 'No audio was recorded.');
      setPhase('idle');
      return;
    }
    try {
      const text = await transcribeAudioWithWhisper(blob);
      if (!text) {
        setError(language === 'ur' ? 'کوئی آواز نہیں سنی گئی۔ دوبارہ کوشش کریں۔' : 'No speech detected. Please try again.');
        setPhase('idle');
        return;
      }
      setTranscript(text);
      await analyzeTranscript(text);
    } catch (err) {
      console.error('Whisper transcription failed:', err);
      setError(language === 'ur' ? 'آواز تبدیل کرنے میں خرابی۔ دوبارہ کوشش کریں۔' : 'Transcription failed. Please try again.');
      setPhase('idle');
    } finally {
      releaseMicrophone();
    }
  };

  const analyzeTranscript = async (text: string) => {
    setPhase('parsing');
    setError(null);
    try {
      const result = await parseVoice(text);
      setParsed(result);
      setEditAmount(String(result.amount));
      setEditCategory(result.category);
      setEditTitle(result.title);
      setEditType(result.type);
      setEditDate(result.date);
      setPhase('result');
    } catch (err) {
      console.error('parseVoice failed:', err);
      const result = fallbackParse(text);
      setParsed(result);
      setEditAmount(String(result.amount));
      setEditCategory(result.category);
      setEditTitle(result.title);
      setEditType(result.type);
      setEditDate(result.date);
      setPhase('result');
    }
  };

  const handleTypeChange = (newType: TransactionType) => {
    setEditType(newType);
    if (newType === 'income' && EXPENSE_CATEGORIES.includes(editCategory)) {
      setEditCategory('business');
    } else if (newType === 'expense' && INCOME_CATEGORIES.includes(editCategory)) {
      setEditCategory('misc_expense');
    }
  };

  const handleSave = () => {
    if (!parsed) return;
    const finalAmount = editing ? Number(editAmount) : parsed.amount;
    const finalCategory = editing ? editCategory : parsed.category;
    const finalTitle = editing ? editTitle : parsed.title;
    const finalType = editType;
    if (finalAmount <= 0) return;

    onSave({
      type: finalType,
      amount: finalAmount,
      category: finalCategory,
      title: finalTitle,
      source: 'voice',
      payment_method: parsed.paymentMethod,
      transaction_date: editDate,
      is_paid: !isFutureDate(editDate),
    });
    handleClose();
  };

  const handleClose = () => {
    cleanup();
    setPhase('idle');
    setTranscript('');
    setParsed(null);
    setEditing(false);
    setEditDate(new Date().toISOString().split('T')[0]);
    setError(null);
    setRecordSeconds(0);
    onClose();
  };

  const isProcessing = phase === 'transcribing' || phase === 'parsing';
  const isRecording = phase === 'recording';

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={tr('voiceTitle', language)}
      subtitle={tr('voiceExample', language)}
      dir={dir}
    >
      {/* Voice visualization area */}
      <div className="flex flex-col items-center py-6">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isProcessing}
          className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all disabled:opacity-50 ${
            isRecording
              ? 'bg-rose-500/20 scale-110'
              : phase === 'result'
                ? 'bg-emerald-500/20'
                : 'bg-slate-800 hover:bg-slate-700'
          }`}
        >
          {isRecording && (
            <>
              <span className="absolute inset-0 rounded-full bg-rose-500/20 animate-ping" />
              <span className="absolute -inset-3 rounded-full border-2 border-rose-500/30 animate-pulse" />
            </>
          )}
          {isRecording ? (
            <Square size={28} className="text-rose-400 relative z-10" fill="currentColor" />
          ) : phase === 'result' ? (
            <Check size={32} className="text-emerald-400 relative z-10" />
          ) : (
            <Mic size={32} className="text-slate-300 relative z-10" />
          )}
        </button>

        {/* Recording timer */}
        {isRecording && (
          <p className="text-rose-400 text-lg font-bold tabular-nums mt-4">
            {formatTimer(recordSeconds)}
          </p>
        )}

        {/* Waveform animation */}
        {isRecording && (
          <div className="flex items-center gap-1 mt-4 h-12">
            {Array.from({ length: 24 }).map((_, i) => (
              <span
                key={i}
                className="w-1 bg-emerald-400 rounded-full"
                style={{
                  height: '100%',
                  animation: `wave 0.8s ease-in-out infinite`,
                  animationDelay: `${i * 0.06}s`,
                  transformOrigin: 'center',
                }}
              />
            ))}
          </div>
        )}

        {phase === 'idle' && !error && (
          <p className="text-slate-400 text-sm mt-4">
            {tr('voiceExample', language)}
          </p>
        )}

        {isRecording && (
          <p className="text-rose-400 text-sm font-medium mt-4 flex items-center gap-1.5">
            <Volume2 size={14} />
            {tr('voiceListening', language)}
          </p>
        )}

        {error && (
          <p className="text-amber-400 text-sm mt-4 flex items-center gap-1.5 text-center max-w-xs">
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </p>
        )}
      </div>

      {/* Transcribing & Parsing indicator */}
      {isProcessing && (
        <div className="flex flex-col items-center py-6">
          <Loader2 size={32} className="text-emerald-400 animate-spin" />
          <p className="text-emerald-400 text-sm font-medium mt-4">
            {phase === 'transcribing'
              ? (language === 'ur' ? 'آواز تحریر میں تبدیل ہو رہی ہے...' : 'Transcribing & Parsing...')
              : (language === 'ur' ? 'AI تجزیہ کر رہا ہے...' : 'Analyzing...')}
          </p>
        </div>
      )}

      {/* Transcript */}
      {transcript && !isProcessing && (
        <div className="mt-2 rounded-2xl bg-slate-950/60 border border-slate-800 p-4">
          <label htmlFor="voice-transcript" className="text-slate-500 text-xs block mb-1.5">
            {tr('voiceTranscript', language)}
          </label>
          <textarea
            id="voice-transcript"
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            rows={3}
            dir={dir}
            className="w-full resize-none bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 text-sm leading-relaxed focus:outline-none focus:border-emerald-500"
          />
          {phase === 'transcript' && (
            <button
              onClick={() => void analyzeTranscript(transcript)}
              className="w-full mt-3 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm hover:from-emerald-400 hover:to-teal-500 transition-all active:scale-[0.98]"
            >
              {language === 'ur' ? 'AI سے تجزیہ کریں' : 'Analyze with AI'}
            </button>
          )}
        </div>
      )}

      {/* AI Extracted Result */}
      {phase === 'result' && parsed && (
        <div className="mt-4 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-slate-900 border border-emerald-500/20 p-4">
          <div className={`flex items-center justify-between mb-3 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
            <p className="text-emerald-400 text-xs font-semibold flex items-center gap-1.5">
              <Check size={14} />
              {tr('voiceExtracted', language)}
            </p>
            <button
              onClick={() => setEditing(!editing)}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors ${
                editing
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Pencil size={12} />
              {tr('edit', language)}
            </button>
          </div>

          {!editing ? (
            <div className="space-y-2.5">
              {/* Expense / Income toggle */}
              <div className="flex gap-0 p-1 rounded-2xl bg-slate-900 border border-slate-800">
                <button
                  onClick={() => handleTypeChange('expense')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    editType === 'expense'
                      ? 'bg-rose-500 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {language === 'ur' ? '🔴 خرچہ' : '🔴 Expense'}
                </button>
                <button
                  onClick={() => handleTypeChange('income')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    editType === 'income'
                      ? 'bg-emerald-500 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {language === 'ur' ? '🟢 آمدنی' : '🟢 Income'}
                </button>
              </div>
              <div className={`flex items-center justify-between ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                <span className="text-slate-400 text-xs">{tr('amount', language)}</span>
                <span className="text-slate-100 font-bold tabular-nums">
                  {tr('pkr', language)} {formatPKR(parsed.amount)}
                </span>
              </div>
              <div className={`flex items-center justify-between ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                <span className="text-slate-400 text-xs">{tr('category', language)}</span>
                <span className="text-slate-100 text-sm">
                  {CATEGORIES[editCategory].emoji} {getCategoryLabel(editCategory, language)}
                </span>
              </div>
              <div className={`flex items-center justify-between ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                <span className="text-slate-400 text-xs">{tr('title', language)}</span>
                <span className="text-slate-100 text-sm">{parsed.title}</span>
              </div>
              <div className={`flex items-center justify-between gap-3 ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                <label htmlFor="voice-result-date" className="text-slate-400 text-xs">
                  {language === 'ur' ? 'تاریخ' : 'Date'}
                </label>
                <input
                  id="voice-result-date"
                  type="date"
                  value={editDate}
                  onChange={(event) => setEditDate(event.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Expense / Income toggle */}
              <div className="flex gap-0 p-1 rounded-2xl bg-slate-900 border border-slate-800">
                <button
                  onClick={() => handleTypeChange('expense')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    editType === 'expense'
                      ? 'bg-rose-500 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {language === 'ur' ? '🔴 خرچہ' : '🔴 Expense'}
                </button>
                <button
                  onClick={() => handleTypeChange('income')}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    editType === 'income'
                      ? 'bg-emerald-500 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {language === 'ur' ? '🟢 آمدنی' : '🟢 Income'}
                </button>
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">{tr('amount', language)}</label>
                <input
                  type="number"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">{tr('category', language)}</label>
                <div className="flex flex-wrap gap-1.5">
                  {(editType === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setEditCategory(cat)}
                      className={`px-2.5 py-1 rounded-lg text-xs transition-all ${
                        editCategory === cat
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {CATEGORIES[cat].emoji} {getCategoryLabel(cat, language)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-slate-400 text-xs block mb-1">{tr('title', language)}</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label htmlFor="voice-edit-date" className="text-slate-400 text-xs block mb-1">
                  {language === 'ur' ? 'تاریخ' : 'Date'}
                </label>
                <input
                  id="voice-edit-date"
                  type="date"
                  value={editDate}
                  onChange={(event) => setEditDate(event.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {phase === 'result' && (
        <button
          onClick={handleSave}
          className="w-full mt-4 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold text-sm hover:from-emerald-400 hover:to-teal-500 transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/20"
        >
          {tr('confirmSave', language)}
        </button>
      )}
    </Modal>
  );
}
