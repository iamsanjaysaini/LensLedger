import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Shop, formatReportQty, sortLensNames } from '../utils/lensUtils';
import { FileText, ChevronRight, ChevronLeft, ShoppingCart, Tag, Layers, Database, Download, Upload, Loader2 } from 'lucide-react';
import { showToast } from '../components/Toast';
import {
  TABLES, LAST_BACKUP_KEY, MAX_BACKUP_FILE_BYTES, RestoreError, buildBackup, downloadBackup, parseBackup,
  loadPreview, restoreBackup, requireSession, saveCoatings, errMsg, sumCounts, dateStamp, timeStamp,
} from '../utils/backup';
import type { BackupFile, RestorePreview } from '../utils/backup';

type ReportView =
  | 'individual_shop'
  | 'individual_orders'
  | 'individual_orders_date'
  | 'individual_sale'
  | 'individual_orderedlensqty'
  | 'individual_orderedlensqty_date';

function DateRangeForm({ onSearch, buttonText = "Show Report" }: { onSearch: (start: string, end: string) => void; buttonText?: string }) {
  const [localStart, setLocalStart] = useState('');
  const [localEnd, setLocalEnd] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!localStart || !localEnd) {
      alert('Please select both From and To dates');
      return;
    }
    if (localStart > localEnd) {
      alert('From date cannot be after To date');
      return;
    }
    onSearch(localStart, localEnd);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm mb-5">
      <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">Custom Date Range</h3>
      <div className="flex flex-col sm:flex-row items-end gap-3">
        <div className="w-full sm:w-auto flex-1">
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">From Date</label>
          <input
            type="date"
            value={localStart}
            onChange={(e) => setLocalStart(e.target.value)}
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <div className="w-full sm:w-auto flex-1">
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">To Date</label>
          <input
            type="date"
            value={localEnd}
            onChange={(e) => setLocalEnd(e.target.value)}
            className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <button
          type="submit"
          className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer"
        >
          {buttonText}
        </button>
      </div>
    </form>
  );
}

type PendingRestore = { file: BackupFile; name: string } & RestorePreview;

function BackupSection({ isDemo }: { isDemo: boolean }) {
  const [busy, setBusy] = useState<'idle' | 'backup' | 'checking' | 'restore'>('idle');
  const [status, setStatus] = useState('');
  const [percent, setPercent] = useState<number | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(() => {
    try { return localStorage.getItem(LAST_BACKUP_KEY); } catch { return null; }
  });
  const [pending, setPending] = useState<PendingRestore | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (busy === 'idle') return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  async function handleBackup() {
    if (isDemo) { showToast('Demo mode mein Backup available nahi hai.', 'info'); return; }
    if (busy !== 'idle') return;
    setBusy('backup'); setMessage(null); setPercent(null);
    try {
      await requireSession();
      const file = await buildBackup(setStatus);
      downloadBackup(file, `LensLedger-backup-${dateStamp()}.json`);
      const now = new Date().toISOString();
      try { localStorage.setItem(LAST_BACKUP_KEY, now); } catch { /* ignore */ }
      setLastBackup(now);
      showToast(`Backup download ho gaya (${sumCounts(file.counts)} rows).`, 'success');
    } catch (e) {
      setMessage({ kind: 'error', text: `Backup fail hua, file download nahi hui. ${errMsg(e)}` });
      showToast('Backup fail hua. Details neeche dikhayi hain.', 'error');
    } finally {
      setBusy('idle'); setStatus('');
    }
  }

  function handleRestoreClick() {
    if (isDemo) { showToast('Demo mode mein Restore available nahi hai.', 'info'); return; }
    if (busy !== 'idle') return;
    fileRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setMessage(null); setPending(null); setConfirmText('');
    if (f.size > MAX_BACKUP_FILE_BYTES) {
      setMessage({ kind: 'error', text: 'File bahut badi hai (100 MB se zyada). Ye backup file nahi lagti.' });
      return;
    }
    setBusy('checking'); setStatus('File check ho rahi hai...');
    try {
      await requireSession();
      const parsed = parseBackup(await f.text());
      const preview = await loadPreview(parsed);
      setPending({ file: parsed, name: f.name, ...preview });
    } catch (err) {
      setMessage({ kind: 'error', text: `File reject hui: ${errMsg(err)}` });
      showToast('File reject hui.', 'error');
    } finally {
      setBusy('idle'); setStatus('');
    }
  }

  async function handleConfirmRestore() {
    if (!pending || confirmText !== 'RESTORE' || busy !== 'idle') return;
    const p = pending;
    setBusy('restore'); setMessage(null); setPercent(null);
    try {
      await requireSession();
      setStatus('Pehle current data ka safety backup ban raha hai...');
      const safety = await buildBackup(setStatus);
      downloadBackup(safety, `LensLedger-pre-restore-${timeStamp()}.json`);
      await restoreBackup(p.file, (pr) => { setStatus(pr.label); setPercent(pr.percent); });
      const coatingsOk = saveCoatings(p.file.local.availableCoatings);
      setPending(null); setConfirmText('');
      setMessage({
        kind: 'success',
        text: `Restore poora hua (${sumCounts(p.file.counts)} rows). ` +
          (coatingsOk ? 'Coatings list bhi wapas aa gayi.' : 'Par coatings list browser mein save nahi ho payi.') +
          ' Safety backup file bhi download hui hai, use sambhal kar rakhein.',
      });
      showToast('Restore poora hua.', 'success');
    } catch (err) {
      setPending(null); setConfirmText('');
      setMessage({
        kind: 'error',
        text: err instanceof RestoreError
          ? err.report()
          : `Restore shuru nahi hua: ${errMsg(err)} Database mein kuch nahi badla.`,
      });
      showToast('Restore fail hua. Details neeche dikhayi hain.', 'error');
    } finally {
      setBusy('idle'); setStatus(''); setPercent(null);
    }
  }

  const working = busy !== 'idle';
  const btn = 'flex items-center justify-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
          <Database className="w-5 h-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div>
          <p className="font-bold text-sm text-gray-800 dark:text-white">Backup &amp; Restore</p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            Last backup: {lastBackup ? new Date(lastBackup).toLocaleString('en-GB') : 'abhi tak nahi liya'}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <button onClick={handleBackup} disabled={working} className={`${btn} bg-indigo-600 hover:bg-indigo-700 text-white`}>
          {busy === 'backup' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          Download Backup (.json)
        </button>
        <button onClick={handleRestoreClick} disabled={working} className={`${btn} bg-white dark:bg-gray-700 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20`}>
          {busy === 'checking' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Restore from Backup
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" onChange={handleFile} className="hidden" />
      </div>

      {working && (
        <div className="space-y-1.5">
          <p className="text-xs text-gray-600 dark:text-gray-300">{status}</p>
          {percent !== null && (
            <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-600 transition-all" style={{ width: `${percent}%` }} />
            </div>
          )}
          {busy === 'restore' && <p className="text-[10px] text-red-500 font-semibold">Restore chal raha hai. Page band ya refresh mat karein, aur kisi aur page par kaam na karein.</p>}
        </div>
      )}

      {pending && !working && (
        <div className="space-y-3 border-t border-gray-200 dark:border-gray-700 pt-4">
          <p className="text-xs text-gray-700 dark:text-gray-300">
            File: <b>{pending.name}</b> &middot; Backup ki date: <b>{new Date(pending.file.exported_at).toLocaleString('en-GB')}</b>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-gray-500 uppercase tracking-wider">
                  <th className="text-left py-1 pr-4">Table</th>
                  <th className="text-center py-1 px-4">Backup file mein</th>
                  <th className="text-center py-1 pl-4">Abhi database mein</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {TABLES.map((t) => (
                  <tr key={t} className="text-gray-700 dark:text-gray-300">
                    <td className="py-1 pr-4 font-medium">{t}</td>
                    <td className="py-1 px-4 text-center font-bold text-indigo-600 dark:text-indigo-400">{pending.file.counts[t]}</td>
                    <td className="py-1 pl-4 text-center">{pending.dbCounts[t]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 p-3 space-y-1">
            <p className="font-bold">Dhyan dein: abhi ka saara Stock, Orders, Sales, custom rows aur alert ignores delete ho jayenge, aur sirf is file ka data rahega.</p>
            <p>Restore se pehle current data ki ek safety backup file apne aap download hogi.</p>
            {pending.extraShops.length > 0 && (
              <p>Ye shops file mein nahi hain, unka naam rahega par unka saara data khaali ho jayega: <b>{pending.extraShops.join(', ')}</b></p>
            )}
            {pending.lostCoatings.length > 0 && (
              <p>Ye maujooda coatings file mein nahi hain, list badalne par hat jayengi: <b>{pending.lostCoatings.join(', ')}</b></p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Confirm karne ke liye RESTORE type karein</label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>
            <button onClick={handleConfirmRestore} disabled={confirmText !== 'RESTORE'} className={`${btn} bg-red-600 hover:bg-red-700 text-white`}>
              Restore (purana data delete hoga)
            </button>
            <button onClick={() => { setPending(null); setConfirmText(''); }} className={`${btn} bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600`}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className={`text-xs rounded-lg p-3 whitespace-pre-line border ${
          message.kind === 'error'
            ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
            : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
        }`}>
          {message.text}
        </div>
      )}
    </div>
  );
}

export default function ReportsPage({ isDemo = false }: { isDemo?: boolean }) {
  const [view, setView] = useState<ReportView>('individual_shop');
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [orderDates, setOrderDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [reportData, setReportData] = useState<{ name: string; qty: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchShops() {
      if (isDemo) {
        const demoShop = { id: '1', name: 'Narbada Eye Care' };
        setSelectedShop(demoShop);
        return;
      }
      const { data } = await supabase.from('shops').select('*');
      if (data && data.length > 0) {
        const narbada = data.find(s => s.name.toLowerCase().includes('narbada')) || data[0];
        setSelectedShop(narbada);
      }
    }
    fetchShops();
  }, [isDemo]);

  async function fetchOrderDates(shopId: string) {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('created_at')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });
    if (data) {
      setOrderDates(Array.from(new Set(data.map(o => o.created_at.split('T')[0]))));
    }
    setLoading(false);
  }

  async function fetchOrdersForRange(shopId: string, start: string, end: string) {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('lens_details, quantity')
      .eq('shop_id', shopId)
      .gte('created_at', `${start}T00:00:00`)
      .lte('created_at', `${end}T23:59:59`);
    if (data) {
      const summary: Record<string, number> = {};
      data.forEach(o => { summary[o.lens_details.name] = (summary[o.lens_details.name] || 0) + Number(o.quantity); });
      setReportData(Object.entries(summary).map(([name, qty]) => ({ name, qty })).sort((a, b) => sortLensNames(a.name, b.name)));
    }
    setLoading(false);
  }

  async function fetchOrdersForDate(shopId: string, date: string) {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('lens_details, quantity')
      .eq('shop_id', shopId)
      .gte('created_at', `${date}T00:00:00`)
      .lte('created_at', `${date}T23:59:59`);
    if (data) {
      const summary: Record<string, number> = {};
      data.forEach(o => { summary[o.lens_details.name] = (summary[o.lens_details.name] || 0) + Number(o.quantity); });
      setReportData(Object.entries(summary).map(([name, qty]) => ({ name, qty })).sort((a, b) => sortLensNames(a.name, b.name)));
    }
    setLoading(false);
  }

  async function fetchSalesForShop(shopId: string) {
    setLoading(true);
    const { data } = await supabase.from('sales').select('lens_details, quantity').eq('shop_id', shopId);
    if (data) {
      const summary: Record<string, number> = {};
      data.forEach(o => { summary[o.lens_details.name] = (summary[o.lens_details.name] || 0) + Number(o.quantity); });
      setReportData(Object.entries(summary).map(([name, qty]) => ({ name, qty })).sort((a, b) => sortLensNames(a.name, b.name)));
    }
    setLoading(false);
  }

  async function fetchLensQtyForShop(shopId: string) {
    setLoading(true);
    const { data } = await supabase.from('orders').select('lens_details, quantity').eq('shop_id', shopId);
    if (data) {
      const summary: Record<string, number> = {};
      data.forEach(item => {
        const name = item.lens_details?.name || '';
        summary[name] = (summary[name] || 0) + Number(item.quantity);
      });
      setReportData(Object.entries(summary).map(([name, qty]) => ({ name, qty })).sort((a, b) => sortLensNames(a.name, b.name)));
    }
    setLoading(false);
  }

  async function fetchLensQtyForShopRange(shopId: string, start: string, end: string) {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('lens_details, quantity')
      .eq('shop_id', shopId)
      .gte('created_at', `${start}T00:00:00`)
      .lte('created_at', `${end}T23:59:59`);
    if (data) {
      const summary: Record<string, number> = {};
      data.forEach(item => {
        const name = item.lens_details?.name || '';
        summary[name] = (summary[name] || 0) + Number(item.quantity);
      });
      setReportData(Object.entries(summary).map(([name, qty]) => ({ name, qty })).sort((a, b) => sortLensNames(a.name, b.name)));
    }
    setLoading(false);
  }

  async function fetchLensQtyForShopDate(shopId: string, date: string) {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('lens_details, quantity')
      .eq('shop_id', shopId)
      .gte('created_at', `${date}T00:00:00`)
      .lte('created_at', `${date}T23:59:59`);
    if (data) {
      const summary: Record<string, number> = {};
      data.forEach(item => {
        const name = item.lens_details?.name || '';
        summary[name] = (summary[name] || 0) + Number(item.quantity);
      });
      setReportData(Object.entries(summary).map(([name, qty]) => ({ name, qty })).sort((a, b) => sortLensNames(a.name, b.name)));
    }
    setLoading(false);
  }

  function openPrintWindow(title: string, items: { name: string; qty: number }[], dateStr?: string) {
    const MAX = 40;
    const col1 = items.slice(0, MAX);
    const col2 = items.slice(MAX);
    const displayDate = dateStr || new Date().toLocaleDateString('en-GB');
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>${title} - ${displayDate}</title>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
          <style>
            @page { size: A4; margin: 0; }
            * { box-sizing: border-box; }
            body { font-family: 'Courier New', Courier, monospace; font-size: 11px; margin: 0; padding: 0; background: white; }
            .controls { padding: 8px 16px; display: flex; gap: 10px; justify-content: center; background: white; border-bottom: 1px solid #eee; }
            .btn { background: #4f46e5; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-family: sans-serif; font-size: 14px; }
            .btn:hover { background: #4338ca; }
            .page-container { background: white; width: 794px; min-height: 1123px; padding: 10mm; margin: 0 auto; }
            .header { border-bottom: 2px solid black; padding-bottom: 10px; margin-bottom: 20px; text-align: center; font-weight: bold; font-size: 16px; }
            .subheader { font-size: 12px; color: #555; margin-top: 4px; }
            .columns { display: flex; gap: 10px; }
            .column { flex: 1; }
            table { width: 100%; border-collapse: collapse; }
            td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
            .qty-col { width: 40px; text-align: center; font-weight: bold; }
            .frac { display: inline-block; vertical-align: middle; text-align: center; font-size: 0.8em; line-height: 1; margin-left: 2px; }
            .frac span { display: block; padding: 0 2px; }
            .frac span.bottom { border-top: 1px solid black; }
            @media print { .controls { display: none; } body { background: white; } }
          </style>
        </head>
        <body>
          <div class="controls">
            <button class="btn" onclick="window.print()">Print / Save PDF</button>
            <button class="btn" onclick="downloadJPG()">Download JPG</button>
          </div>
          <div id="capture" class="page-container">
            <div class="header">
              ${title}
              <div class="subheader">DATE: ${displayDate}</div>
            </div>
            <div class="columns">
              <div class="column"><table><tbody>
                ${col1.map(item => `<tr><td>${item.name}</td><td class="qty-col">${formatReportQty(item.qty)}</td></tr>`).join('')}
              </tbody></table></div>
              <div class="column"><table><tbody>
                ${col2.map(item => `<tr><td>${item.name}</td><td class="qty-col">${formatReportQty(item.qty)}</td></tr>`).join('')}
              </tbody></table></div>
            </div>
          </div>
          <script>
            function downloadJPG() {
              const btn = document.querySelector('button[onclick="downloadJPG()"]');
              if (btn) { btn.disabled = true; btn.innerText = 'Generating...'; }
              html2canvas(document.querySelector("#capture"), { scale: 2 }).then(canvas => {
                const link = document.createElement('a');
                link.download = '${title.replace(/\s+/g, '_')}_${displayDate.replace(/\//g, '-')}.jpg';
                link.href = canvas.toDataURL('image/jpeg', 0.9);
                link.click();
                if (btn) { btn.disabled = false; btn.innerText = 'Download JPG'; }
              });
            }
          </script>
        </body>
      </html>
    `);
    win.document.close();
  }

  function formatDate(dateStr: string) {
    if (dateStr === 'All Time') {
      return 'All Time';
    }
    if (dateStr.includes(':')) {
      const [start, end] = dateStr.split(':');
      const startFormatted = new Date(start + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const endFormatted = new Date(end + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return `${startFormatted} to ${endFormatted}`;
    }
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function handleBack() {
    setReportData([]);
    const backMap: Partial<Record<ReportView, () => void>> = {
      individual_orders: () => { setView('individual_shop'); setOrderDates([]); },
      individual_orders_date: () => { setView('individual_orders'); setSelectedDate(null); },
      individual_sale: () => setView('individual_shop'),
      individual_orderedlensqty: () => { setView('individual_shop'); setOrderDates([]); },
      individual_orderedlensqty_date: () => { setView('individual_orderedlensqty'); setSelectedDate(null); },
    };
    backMap[view]?.();
  }

  const breadcrumbMap: Partial<Record<ReportView, string>> = {
    individual_shop: selectedShop?.name || 'Reports',
    individual_orders: 'Orders',
    individual_orders_date: selectedDate ? formatDate(selectedDate) : '',
    individual_sale: 'Sale',
    individual_orderedlensqty: 'Ordered lens quantity',
    individual_orderedlensqty_date: selectedDate ? formatDate(selectedDate) : '',
  };

  const breadcrumbFlow: ReportView[] = (() => {
    const singleFlows: Partial<Record<ReportView, ReportView[]>> = {
      individual_shop: ['individual_shop'],
      individual_orders: ['individual_shop', 'individual_orders'],
      individual_orders_date: ['individual_shop', 'individual_orders', 'individual_orders_date'],
      individual_sale: ['individual_shop', 'individual_sale'],
      individual_orderedlensqty: ['individual_shop', 'individual_orderedlensqty'],
      individual_orderedlensqty_date: ['individual_shop', 'individual_orderedlensqty', 'individual_orderedlensqty_date'],
    };
    return singleFlows[view] || ['individual_shop'];
  })();

  const CardButton = ({ label, desc, icon, iconBg, onClick }: {
    label: string; desc?: string; icon: React.ReactNode; iconBg: string; onClick: () => void;
  }) => (
    <button onClick={onClick} className="p-5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:border-indigo-400 hover:shadow-md transition-all text-left flex justify-between items-center group">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>{icon}</div>
        <div>
          <p className="font-bold text-sm text-gray-800 dark:text-white">{label}</p>
          {desc && <p className="text-[10px] text-gray-400 mt-0.5">{desc}</p>}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 transition-colors flex-shrink-0 ml-2" />
    </button>
  );

  const ReportTable = ({ items, title, dateStr }: { items: { name: string; qty: number }[]; title: string; dateStr?: string }) => (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300">{title}</h2>
        <button onClick={() => openPrintWindow(title, items, dateStr)} className="flex items-center text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md transition-colors">
          <FileText className="w-3.5 h-3.5 mr-1" /> Print / Download
        </button>
      </div>
      {items.length === 0
        ? <div className="text-center text-sm text-gray-400 py-10">No data found.</div>
        : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800/80">
                <tr>
                  <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Lens</th>
                  <th className="px-4 py-2 text-center text-[10px] font-bold text-gray-500 uppercase tracking-widest w-24">Qty (Pairs)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {items.map((item, i) => (
                  <tr key={i} className="even:bg-gray-50 dark:even:bg-gray-700/40 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10">
                    <td className="px-4 py-2 text-xs text-gray-700 dark:text-gray-300 font-medium">{item.name}</td>
                    <td className="px-4 py-2 text-center text-xs font-bold text-indigo-600 dark:text-indigo-400">
                      <span dangerouslySetInnerHTML={{ __html: formatReportQty(item.qty) }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );

  const DateGrid = ({ dates, onSelect, iconColor = 'text-indigo-400' }: { dates: string[]; onSelect: (d: string) => void; iconColor?: string }) => (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300">Select Date</h2>
      {loading
        ? <div className="text-center text-sm text-gray-400 py-10">Loading...</div>
        : dates.length === 0
          ? <div className="text-center text-sm text-gray-400 py-10">No orders found.</div>
          : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {dates.map(date => (
                <button key={date} onClick={() => onSelect(date)}
                  className="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all text-center">
                  <ShoppingCart className={`w-4 h-4 ${iconColor} mx-auto mb-1`} />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{formatDate(date)}</span>
                </button>
              ))}
            </div>
          )}
    </div>
  );

  const Loader = () => <div className="text-center text-sm text-gray-400 py-10">Loading...</div>;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">Reports</h1>

      {/* Breadcrumb + Back */}
      <div className="flex items-center gap-1 flex-wrap text-xs text-gray-500 dark:text-gray-400">
        {view !== 'individual_shop' && (
          <button onClick={handleBack} className="flex items-center mr-2 text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
            <ChevronLeft className="w-3.5 h-3.5" /> Back
          </button>
        )}
        {breadcrumbFlow.map((v, i) => (
          <span key={v} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3 h-3" />}
            <span className={i === breadcrumbFlow.length - 1 ? 'text-gray-800 dark:text-white font-semibold' : ''}>{breadcrumbMap[v]}</span>
          </span>
        ))}
      </div>

      {/* INDIVIDUAL SHOP MAIN REPORT CARD */}
      {view === 'individual_shop' && selectedShop && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CardButton label="Orders" icon={<ShoppingCart className="w-5 h-5 text-blue-600 dark:text-blue-400" />} iconBg="bg-blue-50 dark:bg-blue-900/30"
            onClick={() => { fetchOrderDates(selectedShop.id); setView('individual_orders'); }} />
          <CardButton label="Sale" icon={<Tag className="w-5 h-5 text-green-600 dark:text-green-400" />} iconBg="bg-green-50 dark:bg-green-900/30"
            onClick={() => { fetchSalesForShop(selectedShop.id); setView('individual_sale'); }} />
          <CardButton label="Ordered lens quantity" icon={<Layers className="w-5 h-5 text-purple-600 dark:text-purple-400" />} iconBg="bg-purple-50 dark:bg-purple-900/30"
            onClick={() => { fetchOrderDates(selectedShop.id); setView('individual_orderedlensqty'); }} />
        </div>
      )}

      {view === 'individual_shop' && <BackupSection isDemo={isDemo} />}

      {/* INDIVIDUAL ORDERS: Dates */}
      {view === 'individual_orders' && (
        <>
          <DateRangeForm onSearch={(start, end) => {
            const rangeKey = `${start}:${end}`;
            setSelectedDate(rangeKey);
            fetchOrdersForRange(selectedShop!.id, start, end);
            setView('individual_orders_date');
          }} />
          <DateGrid dates={orderDates} onSelect={(date) => { setSelectedDate(date); fetchOrdersForDate(selectedShop!.id, date); setView('individual_orders_date'); }} />
        </>
      )}

      {/* INDIVIDUAL ORDERS DATE */}
      {view === 'individual_orders_date' && selectedDate && (loading ? <Loader /> : <ReportTable items={reportData} title={`${selectedShop?.name} — Orders`} dateStr={formatDate(selectedDate)} />)}

      {/* INDIVIDUAL SALE */}
      {view === 'individual_sale' && (loading ? <Loader /> : <ReportTable items={reportData} title={`${selectedShop?.name} — Sale Report`} />)}

      {/* INDIVIDUAL LENS QTY */}
      {view === 'individual_orderedlensqty' && selectedShop && (
        <>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm mb-5 flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">All Time Report</h3>
              <p className="text-[10px] text-gray-400">View ordered lens quantity from all recorded history.</p>
            </div>
            <button
              onClick={() => { setSelectedDate('All Time'); fetchLensQtyForShop(selectedShop.id); setView('individual_orderedlensqty_date'); }}
              className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer"
            >
              Show All Time
            </button>
          </div>
          <DateRangeForm buttonText="Show Ordered Qty" onSearch={(start, end) => {
            const rangeKey = `${start}:${end}`;
            setSelectedDate(rangeKey);
            fetchLensQtyForShopRange(selectedShop.id, start, end);
            setView('individual_orderedlensqty_date');
          }} />
          <DateGrid dates={orderDates} onSelect={(date) => { setSelectedDate(date); fetchLensQtyForShopDate(selectedShop.id, date); setView('individual_orderedlensqty_date'); }} />
        </>
      )}

      {/* INDIVIDUAL LENS QTY DATE */}
      {view === 'individual_orderedlensqty_date' && selectedDate && (loading ? <Loader /> : <ReportTable items={reportData} title={`${selectedShop?.name} — Ordered lens quantity`} dateStr={formatDate(selectedDate)} />)}
    </div>
  );
}
