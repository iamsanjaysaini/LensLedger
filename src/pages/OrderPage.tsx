import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  generateLensRows,
  fetchCustomLensRows,
  CustomLensRow,
  getDefaultAxis,
  MATERIALS,
  VISIONS,
  DEFAULT_COATINGS,
  formatLensName,
  Material,
  Vision,
  PowerType,
  Sign,
  KT_AXIS,
  PROGRESSIVE_AXIS,
  Shop,
  formatReportQty,
  sortLensNames,
  getDefaultShopId
} from '../utils/lensUtils';
import { Plus, Minus, ShoppingCart, FileText, Trash2, X } from 'lucide-react';

const NON_DELETABLE_COATINGS = ['HC', 'Bluecut green'];

interface CustomOrderEntry {
  id: string;
  name: string;
  qty: string;
}

export default function OrderPage({ isDemo = false }: { isDemo?: boolean }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState('');
  const [material, setMaterial] = useState<Material>('CR');
  const [vision, setVision] = useState<Vision>('single vision');
  const [coatings, setCoatings] = useState<string[]>(['HC']);
  const [sign, setSign] = useState<Sign>('-');
  const [powerType, setPowerType] = useState<PowerType>('SPH');
  const compoundLimit = '2.0';
  const [rowAxes, setRowAxes] = useState<Record<string, number>>({});
  const [customCoating, setCustomCoating] = useState('');
  const [availableCoatings, setAvailableCoatings] = useState(DEFAULT_COATINGS);
  const [deltas, setDeltas] = useState<Record<string, { qty: number, name: string }>>({});
  const [loading, setLoading] = useState(false);
  const [customRows, setCustomRows] = useState<CustomLensRow[]>([]);

  const [customEntries, setCustomEntries] = useState<CustomOrderEntry[]>([]);
  const [customName, setCustomName] = useState('');
  const [customQty, setCustomQty] = useState('');
  const customNameRef = useRef<HTMLInputElement>(null);

  const isKTOrProg = vision === 'KT' || vision === 'Prograssive';

  useEffect(() => {
    async function loadRows() {
      setLoading(true);
      const custom = await fetchCustomLensRows(material, vision, sign, powerType, compoundLimit, coatings);
      if (custom) setCustomRows(custom);
      else setCustomRows(generateLensRows(powerType, compoundLimit, vision));
      setLoading(false);
    }
    loadRows();
  }, [material, vision, sign, powerType, compoundLimit, coatings]);

  const lensRows = customRows;

  useEffect(() => {
    const defaultAxis = getDefaultAxis(vision, sign, powerType);
    if (defaultAxis !== undefined) {
      const newAxes: Record<string, number> = {};
      lensRows.forEach((row, index) => {
        newAxes[`${row.sph}-${row.cyl}-${row.add || ''}-${index}`] = defaultAxis;
      });
      setRowAxes(newAxes);
    } else {
      setRowAxes({});
    }
  }, [vision, sign, powerType, lensRows]);

  useEffect(() => {
    async function fetchShops() {
      if (isDemo) {
        const demoShops = [{ id: '1', name: 'SS Opticals' }, { id: '2', name: 'Narbada Eye Care' }];
        setShops(demoShops);
        setSelectedShop(demoShops[0].id);
        return;
      }
      const { data } = await supabase.from('shops').select('*');
      if (data && data.length > 0) {
        setShops(data);
        const { data: { user } } = await supabase.auth.getUser();
        const email = user?.email || '';
        setSelectedShop(getDefaultShopId(data, email));
      }
    }
    fetchShops();
  }, [isDemo]);

  const handleQuantityChange = (sph: string, cyl: string, name: string, delta: number, axis?: number, add?: string) => {
    const key = `${selectedShop}-${material}-${vision}-${sign}-${powerType}-${sph}-${cyl}-${axis || ''}-${coatings.join(',')}-${isKTOrProg ? add : ''}`;
    const current = deltas[key] || { qty: 0, name };
    const newQty = Math.max(0, current.qty + delta);
    if (newQty === 0) {
      const newDeltas = { ...deltas };
      delete newDeltas[key];
      setDeltas(newDeltas);
    } else {
      setDeltas({ ...deltas, [key]: { qty: newQty, name } });
    }
  };

  const handleAddCustomEntry = () => {
    const trimmedName = customName.trim();
    const trimmedQty = customQty.trim();
    if (!trimmedName) { customNameRef.current?.focus(); return; }
    if (!trimmedQty) return;
    setCustomEntries(prev => [
      ...prev,
      { id: Date.now().toString(), name: trimmedName, qty: trimmedQty }
    ]);
    setCustomName('');
    setCustomQty('');
    customNameRef.current?.focus();
  };

  const handleRemoveCustomEntry = (id: string) => {
    setCustomEntries(prev => prev.filter(e => e.id !== id));
  };

  const parseQtyString = (qty: string): number => {
    const trimmed = qty.trim();
    const mixed = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);
    const fraction = trimmed.match(/^(\d+)\/(\d+)$/);
    if (fraction) return parseInt(fraction[1]) / parseInt(fraction[2]);
    const num = parseFloat(trimmed);
    return isNaN(num) ? 0 : num;
  };

  const saveOrder = async () => {
    if (isDemo) { alert('Demo Mode: Orders are not saved.'); return; }
    const standardEntries = Object.entries(deltas);
    if (standardEntries.length === 0 && customEntries.length === 0) {
      alert('Please add items to order.');
      return;
    }
    setLoading(true);
    let successCount = 0;
    let lastError = null;

    for (const [_, data] of standardEntries) {
      const { error } = await supabase.from('orders').insert({
        shop_id: selectedShop,
        lens_details: { name: data.name },
        quantity: data.qty
      });
      if (error) { console.error(error); lastError = error; }
      else successCount++;
    }

    for (const entry of customEntries) {
      const qty = parseQtyString(entry.qty);
      const { error } = await supabase.from('orders').insert({
        shop_id: selectedShop,
        lens_details: { name: entry.name, is_custom: true },
        quantity: qty > 0 ? qty : 0.5
      });
      if (error) { console.error(error); lastError = error; }
      else successCount++;
    }

    setLoading(false);
    if (successCount > 0) {
      alert(`Orders saved successfully! (${successCount} items)`);
      setDeltas({});
      setCustomEntries([]);
    } else if (lastError) {
      alert('Failed to save orders. Error: ' + (lastError as any).message);
    }
  };

  const toggleCoating = (c: string) => {
    if (c === 'Photo Grey') {
      if (coatings.includes(c)) setCoatings(coatings.filter(item => item !== c));
      else setCoatings([...coatings, c]);
    } else {
      const photoGreySelected = coatings.includes('Photo Grey');
      setCoatings(photoGreySelected ? ['Photo Grey', c] : [c]);
    }
  };

  const deleteCoating = (c: string) => {
    setAvailableCoatings(prev => prev.filter(item => item !== c));
    setCoatings(prev => {
      const updated = prev.filter(item => item !== c);
      return updated.length > 0 ? updated : ['HC'];
    });
  };

  const addCustomCoating = () => {
    if (customCoating && !availableCoatings.includes(customCoating)) {
      setAvailableCoatings([...availableCoatings, customCoating]);
      const photoGreySelected = coatings.includes('Photo Grey');
      setCoatings(photoGreySelected ? ['Photo Grey', customCoating] : [customCoating]);
      setCustomCoating('');
    }
  };

  const toFracHTML = (n: number): string => {
    const whole = Math.floor(n);
    const dec = Math.round((n - whole) * 1000);
    const fracs: Record<number, [string, string]> = {500: ["1","2"], 250: ["1","4"], 750: ["3","4"], 333: ["1","3"], 667: ["2","3"]};
    if (dec === 0) return whole === 0 ? "" : String(whole);
    const f = fracs[dec];
    const fracHtml = f
      ? `<span class="frac"><sup>${f[0]}</sup><span></span><sub>${f[1]}</sub></span>`
      : `.${dec}`;
    return (whole > 0 ? String(whole) : "") + fracHtml;
  };

  const generateOrderReport = async () => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const { data: orders } = await supabase
      .from('orders')
      .select('lens_details, quantity')
      .gte('created_at', today);

    if (!orders || orders.length === 0) {
      setLoading(false);
      alert('No orders found for today to generate report.');
      return;
    }

    const pendingCustom = customEntries.map(e => ({
      lens_details: { name: e.name, is_custom: true },
      quantity: parseQtyString(e.qty) || 0.5
    }));

    const allOrders = [...pendingCustom, ...orders];

    const customItems: [string, number][] = [];
    const standardSummary: Record<string, number> = {};

    allOrders.forEach(o => {
      const name = o.lens_details.name;
      const qty = Number(o.quantity);
      if (o.lens_details.is_custom) {
        const existing = customItems.find(c => c[0] === name);
        if (existing) existing[1] += qty;
        else customItems.push([name, qty]);
      } else {
        standardSummary[name] = (standardSummary[name] || 0) + qty;
      }
    });

    const standardItems = Object.entries(standardSummary).sort((a, b) => sortLensNames(a[0], b[0]));
    const items = [...customItems, ...standardItems];

    const dateStr = new Date().toLocaleDateString('en-GB');
    const MAX_ROWS_PER_COL = 40;
    const col1 = items.slice(0, MAX_ROWS_PER_COL);
    const col2 = items.slice(MAX_ROWS_PER_COL);

    setLoading(false);

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(`
        <html>
          <head>
            <title>Order Report - ${dateStr}</title>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>
            <style>
              * { box-sizing: border-box; margin: 0; padding: 0; }
              body { font-family: 'Courier New', Courier, monospace; font-size: 11pt; background: #e5e7eb; }
              .controls { padding: 10px 16px; display: flex; gap: 10px; justify-content: center; background: #1e293b; position: sticky; top: 0; z-index: 10; }
              .btn { background: #4f46e5; color: white; border: none; padding: 8px 20px; border-radius: 5px; cursor: pointer; font-family: sans-serif; font-size: 13px; font-weight: 600; letter-spacing: 0.3px; }
              .btn:hover { background: #4338ca; }
              .btn.secondary { background: #0891b2; }
              .btn.secondary:hover { background: #0e7490; }
              .page-wrapper { display: flex; justify-content: center; padding: 24px 16px 48px; }
              .page-container {
                background: white;
                width: 210mm;
                height: 297mm;
                padding: 15mm 12mm 15mm 12mm;
                box-shadow: 0 4px 24px rgba(0,0,0,0.18);
                overflow: hidden;
              }
              .header { border-bottom: 2.5px solid black; padding-bottom: 8px; margin-bottom: 14px; text-align: center; font-weight: bold; font-size: 15pt; letter-spacing: 1px; }
              .columns { display: flex; gap: 8mm; align-items: flex-start; }
              .column { flex: 1; }
              table { width: 100%; border-collapse: collapse; }
              td { border: 0.5px solid #aaa; padding: 3.5px 6px; text-align: left; font-size: 12pt; font-weight: bold; line-height: 1.3; }
              .qty-col { width: 38px; text-align: center; font-weight: bold; font-size: 14pt; }
              .frac { display: inline-flex; flex-direction: column; align-items: center; vertical-align: middle; line-height: 1.1; margin: 0 1px; font-size: 0.82em; }
              .frac sup, .frac sub { display: block; line-height: 1.1; font-size: inherit; }
              .frac span { display: block; border-top: 1.5px solid black; width: 100%; }
              @media print {
                @page { size: A4 portrait; margin: 0; }
                * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                body { background: white; }
                .controls { display: none !important; }
                .page-wrapper { padding: 0; }
                .page-container {
                  width: 210mm;
                  height: 297mm;
                  padding: 15mm 12mm;
                  box-shadow: none;
                  overflow: hidden;
                }
                .header { font-size: 14pt; }
                td { font-size: 12pt; font-weight: bold; padding: 3px 5px; }
              }
            </style>
          </head>
          <body>
            <div class="controls">
              <button class="btn" onclick="window.print()">🖨️ Print / Save PDF</button>
              <button class="btn secondary" onclick="downloadJPG()">📥 Download JPG</button>
            </div>
            <div class="page-wrapper">
              <div id="capture" class="page-container">
                <div class="header">DATE: ${dateStr}</div>
                <div class="columns">
                  <div class="column">
                    <table><tbody>
                      ${col1.map(item => `<tr><td>${item[0]}</td><td class="qty-col">${toFracHTML(item[1])}</td></tr>`).join('')}
                    </tbody></table>
                  </div>
                  <div class="column">
                    <table><tbody>
                      ${col2.map(item => `<tr><td>${item[0]}</td><td class="qty-col">${toFracHTML(item[1])}</td></tr>`).join('')}
                    </tbody></table>
                  </div>
                </div>
              </div>
            </div>
            <script>
              function setJpegDPI(dataUrl, dpi) {
                const binary = atob(dataUrl.split(',')[1]);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                if (bytes[2] === 0xFF && bytes[3] === 0xE0) {
                  bytes[11] = 0x01;
                  bytes[12] = Math.floor(dpi / 256);
                  bytes[13] = dpi % 256;
                  bytes[14] = Math.floor(dpi / 256);
                  bytes[15] = dpi % 256;
                }
                let str = '';
                bytes.forEach(b => str += String.fromCharCode(b));
                return 'data:image/jpeg;base64,' + btoa(str);
              }
              function downloadJPG() {
                const btn = event.target;
                btn.disabled = true; btn.innerText = 'Generating...';
                const A4_W = 595; const A4_H = 842;
                html2canvas(document.querySelector('#capture'), {
                  scale: 4,
                  useCORS: true,
                  width: 794,
                  height: 1123,
                  windowWidth: 794,
                  windowHeight: 1123,
                  scrollX: 0,
                  scrollY: 0
                }).then(canvas => {
                  const finalCanvas = document.createElement('canvas');
                  finalCanvas.width = A4_W; finalCanvas.height = A4_H;
                  const ctx = finalCanvas.getContext('2d');
                  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
                  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, A4_W, A4_H);
                  ctx.drawImage(canvas, 0, 0, A4_W, A4_H);
                  const rawDataUrl = finalCanvas.toDataURL('image/jpeg', 0.95);
                  const dpiDataUrl = setJpegDPI(rawDataUrl, 72);
                  const link = document.createElement('a');
                  link.download = 'Order_${dateStr.replace(/\//g, '-')}.jpg';
                  link.href = dpiDataUrl; link.click();
                  btn.disabled = false; btn.innerText = '📥 Download JPG';
                });
              }
            <\/script>
          </body>
        </html>
      `);
      win.document.close();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Place Order</h1>
        <div className="flex gap-2">
          <button onClick={generateOrderReport} className="bg-blue-600 text-white px-3 py-1.5 rounded-md flex items-center text-sm hover:bg-blue-700 shadow-sm transition-colors">
            <FileText className="w-4 h-4 mr-1" /> Generate Order
          </button>
          <button onClick={saveOrder} disabled={loading} className="bg-green-600 text-white px-3 py-1.5 rounded-md flex items-center text-sm hover:bg-green-700 disabled:opacity-50 shadow-sm transition-colors">
            <ShoppingCart className="w-4 h-4 mr-1" /> Save
          </button>
        </div>
      </div>

      {/* Filter Controls */}
      <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm space-y-3 border border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Shop</label>
            <div className="flex gap-1.5">
              {shops.map(shop => (
                <button key={shop.id} onClick={() => setSelectedShop(shop.id)} className={`flex-1 py-1.5 px-2 rounded-md border text-[10px] font-medium transition-all ${selectedShop === shop.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>{shop.name}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Material</label>
            <div className="flex gap-1.5">
              {MATERIALS.map(m => (
                <button key={m} onClick={() => setMaterial(m)} className={`flex-1 py-1.5 px-2 rounded-md border text-[10px] font-medium transition-all ${material === m ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>{m}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Vision</label>
            <select value={vision} onChange={(e) => { setVision(e.target.value as Vision); setRowAxes({}); }} className="block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-1.5 border text-[10px]">
              {VISIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Power Type</label>
            <div className="flex flex-wrap gap-1 mt-1">
              {['SPH', 'CYL', 'Compound', 'Cross Compound'].map((type) => (
                <button key={type} onClick={() => setPowerType(type as PowerType)} className={`px-2 py-1.5 rounded-md border text-[10px] font-medium transition-all ${powerType === type ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100'}`}>{type}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sign</label>
            <div className="flex gap-1.5 mt-1">
              <button onClick={() => setSign('+')} className={`flex-1 py-1.5 rounded-md border text-[10px] font-medium transition-all ${sign === '+' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700'}`}>+</button>
              <button onClick={() => setSign('-')} className={`flex-1 py-1.5 rounded-md border text-[10px] font-medium transition-all ${sign === '-' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700'}`}>-</button>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Coatings</label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {availableCoatings.map(c => (
                <div key={c} className="relative group flex items-center">
                  <button
                    onClick={() => toggleCoating(c)}
                    className={`px-2 py-1 rounded-full text-[10px] font-medium border transition-all ${coatings.includes(c) ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'} ${!NON_DELETABLE_COATINGS.includes(c) ? 'pr-5' : ''}`}
                  >
                    {c}
                  </button>
                  {!NON_DELETABLE_COATINGS.includes(c) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteCoating(c); }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors"
                      title={`Remove ${c}`}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <input type="text" value={customCoating} onChange={(e) => setCustomCoating(e.target.value)} placeholder="Add coating..." className="text-[10px] bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 w-24 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all" />
              <button onClick={addCustomCoating} className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 p-1 rounded-md hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition-colors"><Plus className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </div>
      </div>

      {/* Custom Order Entry Section */}
      <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/50 rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-amber-200 dark:border-amber-700/50 bg-amber-100/60 dark:bg-amber-900/20">
          <h3 className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wider">Custom Order</h3>
        </div>
        <div className="p-3 flex flex-col sm:flex-row gap-2">
          <input ref={customNameRef} type="text" value={customName} onChange={(e) => setCustomName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustomEntry(); }} placeholder="Lens power / description (e.g. -0.50/-2.50 CYL BLUECUT POLY)" className="flex-1 text-xs bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-amber-300 dark:border-amber-700 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-600 placeholder:text-gray-400 transition-all" />
          <input type="text" value={customQty} onChange={(e) => setCustomQty(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustomEntry(); }} placeholder="Qty (e.g. 1, 1/2, 1 1/2)" className="w-full sm:w-36 text-xs bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-amber-300 dark:border-amber-700 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-600 placeholder:text-gray-400 transition-all" />
          <button onClick={handleAddCustomEntry} className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-4 py-2 rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap"><Plus className="w-3.5 h-3.5" /> Add</button>
        </div>
        {customEntries.length > 0 && (
          <div className="border-t border-amber-200 dark:border-amber-700/50">
            <table className="w-full">
              <tbody>
                {customEntries.map((entry) => (
                  <tr key={entry.id} className="border-b border-amber-100 dark:border-amber-800/30 last:border-b-0 even:bg-amber-50/50 dark:even:bg-amber-900/10">
                    <td className="px-4 py-2 text-xs font-medium text-gray-800 dark:text-gray-200">{entry.name}</td>
                    <td className="px-4 py-2 text-center text-xs font-bold text-amber-700 dark:text-amber-400 w-20">{entry.qty}</td>
                    <td className="px-3 py-2 text-right w-12">
                      <button onClick={() => handleRemoveCustomEntry(entry.id)} className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Standard Lens Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="w-full md:w-auto divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800/80 text-center">
              <tr>
                <th className="px-2 py-1.5 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Description</th>
                {powerType !== 'SPH' && <th className="px-1 py-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-16">Axis</th>}
                <th className="px-1 py-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-16">Qty</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {lensRows.map((row, index) => {
                const rowKey = `${row.sph}-${row.cyl}-${row.add || ''}-${index}`;
                const rowAxis = rowAxes[rowKey];
                const name = formatLensName(material, vision, sign, powerType, row.sph, row.cyl, coatings, rowAxis, row.add);
                const stateKey = `${selectedShop}-${material}-${vision}-${sign}-${powerType}-${row.sph}-${row.cyl}-${rowAxis || ''}-${coatings.join(',')}-${isKTOrProg ? row.add : ''}`;
                const qty = deltas[stateKey]?.qty || 0;
                return (
                  <tr key={rowKey} className="hover:bg-indigo-50/50 dark:hover:bg-gray-700/30 transition-colors even:bg-gray-100 dark:even:bg-gray-700/50">
                    <td className="px-2 py-1.5 whitespace-nowrap text-xs font-medium text-gray-700 dark:text-gray-300">{name}</td>
                    {powerType !== 'SPH' && (
                      <td className="px-1 py-1.5 text-center">
                        <select value={rowAxis || ''} onChange={(e) => setRowAxes({ ...rowAxes, [rowKey]: parseInt(e.target.value) })} className="bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-[10px] p-0.5 w-14">
                          <option value="">-</option>
                          {(vision === 'KT' ? KT_AXIS : PROGRESSIVE_AXIS).map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                      </td>
                    )}
                    <td className={`px-1 py-1.5 whitespace-nowrap text-sm text-center font-extrabold ${qty > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500'}`}>{qty.toFixed(2)}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => handleQuantityChange(row.sph, row.cyl, name, -0.5, rowAxis, row.add)} className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"><Minus className="w-6 h-6" /></button>
                        <button onClick={() => handleQuantityChange(row.sph, row.cyl, name, 0.5, rowAxis, row.add)} className="p-3 rounded-md bg-green-50 dark:bg-green-900/20 text-green-500 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"><Plus className="w-6 h-6" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
