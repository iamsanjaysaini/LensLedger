import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  generateLensRows,
  fetchCustomLensRows,
  CustomLensRow,
  getDefaultAxis,
  MATERIALS,
  VISIONS,
  DEFAULT_COATINGS,
  PROTECTED_COATINGS,
  formatLensName,
  Material,
  Vision,
  PowerType,
  Sign,
  KT_AXIS,
  PROGRESSIVE_AXIS,
  Shop,
  formatReportQty,
  sortLensNames
} from '../utils/lensUtils';
import { Plus, Minus, ShoppingCart, FileText, X, Loader2 } from 'lucide-react';

export default function OrderPage({ isDemo = false }: { isDemo?: boolean }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState('');
  const [material, setMaterial] = useState<Material>('CR');
  const [vision, setVision] = useState<Vision>('single vision');
  const [coatings, setCoatings] = useState<string[]>(['HC']);
  const [sign, setSign] = useState<Sign>('-');
  const [powerType, setPowerType] = useState<PowerType>('SPH');
  const [compoundLimit, setCompoundLimit] = useState('2.0');
  const [rowAxes, setRowAxes] = useState<Record<string, number>>({});
  const [customCoating, setCustomCoating] = useState('');
  const [customPower, setCustomPower] = useState('');
  const [customQty, setCustomQty] = useState('1.0');
  const [customSaving, setCustomSaving] = useState(false);
  const [availableCoatings, setAvailableCoatings] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('availableCoatings');
      if (saved) {
        let coatings = JSON.parse(saved);
        if (coatings.includes('Bluecut green')) {
          coatings = coatings.map((c: string) => c === 'Bluecut green' ? 'Bluecut' : c);
          localStorage.setItem('availableCoatings', JSON.stringify(coatings));
        }
        return coatings;
      }
      return DEFAULT_COATINGS;
    } catch { return DEFAULT_COATINGS; }
  });
  const [deltas, setDeltas] = useState<Record<string, { qty: number, name: string }>>({});
  const [loading, setLoading] = useState(false);
  const [customRows, setCustomRows] = useState<CustomLensRow[]>([]);

  const isKTOrProg = vision === 'KT' || vision === 'Prograssive';

  useEffect(() => {
    async function loadRows() {
      setLoading(true);
      const custom = await fetchCustomLensRows(material, vision, sign, powerType, compoundLimit, coatings);
      if (custom) {
        setCustomRows(custom);
      } else {
        setCustomRows(generateLensRows(powerType, compoundLimit, vision));
      }
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
        setSelectedShop(data[0].id);
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

  const saveOrder = async () => {
    if (isDemo) { alert('Demo Mode: Orders are not saved.'); return; }
    const entries = Object.entries(deltas);
    if (entries.length === 0) { alert('Please add items to order.'); return; }
    setLoading(true);
    let successCount = 0;
    let lastError = null;
    for (const [_, data] of entries) {
      const { error } = await supabase.from('orders').insert({
        shop_id: selectedShop,
        lens_details: { name: data.name },
        quantity: data.qty
      });
      if (error) { console.error(error); lastError = error; }
      else { successCount++; }
    }
    setLoading(false);
    if (successCount > 0) { alert(`Orders saved successfully! (${successCount} items)`); setDeltas({}); }
    else if (lastError) { alert('Failed to save orders. Error: ' + (lastError as any).message); }
  };

  // ✅ FIX 1: Custom power seedha DB mein save hota hai, list mein nahi dikhta
  const saveCustomPowerDirectly = async () => {
    if (!customPower.trim()) return;
    const qty = parseFloat(customQty) || 1.0;
    const name = customPower.trim();

    if (isDemo) {
      alert('Demo Mode: Custom orders are not saved.');
      return;
    }

    setCustomSaving(true);
    const { error } = await supabase.from('orders').insert({
      shop_id: selectedShop,
      lens_details: { name },
      quantity: qty
    });
    setCustomSaving(false);

    if (error) {
      alert('Failed to save custom order: ' + error.message);
    } else {
      setCustomPower('');
      setCustomQty('1.0');
      alert(`"${name}" (${qty} pair) saved successfully!`);
    }
  };

  const toggleCoating = (c: string) => {
    if (c === 'Photo Grey') {
      if (coatings.includes(c)) { setCoatings(coatings.filter(item => item !== c)); }
      else { setCoatings([...coatings, c]); }
    } else {
      const photoGreySelected = coatings.includes('Photo Grey');
      setCoatings(photoGreySelected ? ['Photo Grey', c] : [c]);
    }
  };

  const addCustomCoating = () => {
    if (customCoating && !availableCoatings.includes(customCoating)) {
      const updated = [...availableCoatings, customCoating];
      setAvailableCoatings(updated);
      localStorage.setItem('availableCoatings', JSON.stringify(updated));
      const photoGreySelected = coatings.includes('Photo Grey');
      setCoatings(photoGreySelected ? ['Photo Grey', customCoating] : [customCoating]);
      setCustomCoating('');
    }
  };

  const deleteCoating = (c: string) => {
    const updated = availableCoatings.filter(item => item !== c);
    setAvailableCoatings(updated);
    localStorage.setItem('availableCoatings', JSON.stringify(updated));
    setCoatings(coatings.filter(item => item !== c));
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
        alert('No orders found for today.');
        return;
    }

    const summary: Record<string, number> = {};
    orders.forEach(o => {
        let name = o.lens_details.name;
        summary[name] = (summary[name] || 0) + Number(o.quantity);
    });

    const items = Object.entries(summary).sort((a, b) => sortLensNames(a[0], b[0]));
    const dateStr = new Date().toLocaleDateString('en-GB');
    const MAX_ROWS_PER_COL = 40;
    const col1 = items.slice(0, MAX_ROWS_PER_COL);
    const col2 = items.slice(MAX_ROWS_PER_COL);
    setLoading(false);

    // ✅ FIX 2 & 3: Margins minimize + quantity fraction format fixed
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(`
        <html>
          <head>
            <title>Order Report - ${dateStr}</title>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
            <style>
              @page { size: 210mm 297mm; margin: 0; }
              * { box-sizing: border-box; }
              body { font-family: 'Courier New', Courier, monospace; font-size: 10px; margin: 0; padding: 0; background: white; }
              .controls { padding: 8px 16px; display: flex; gap: 10px; justify-content: center; background: white; border-bottom: 1px solid #eee; }
              .btn { background: #4f46e5; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-family: sans-serif; font-size: 14px; }
              .btn:hover { background: #4338ca; }
              .page-container { background: white; width: 595px; height: 842px; overflow: hidden; padding: 8px 6px; margin: 0 auto; }
              .header { border-bottom: 2px solid black; padding-bottom: 4px; margin-bottom: 8px; text-align: center; font-weight: bold; font-size: 12px; }
              .columns { display: flex; gap: 4px; }
              .column { flex: 1; }
              table { width: 100%; border-collapse: collapse; }
              td { border: 1px solid #ccc; padding: 2px 4px; text-align: left; line-height: 1.2; }
              .qty-col { width: 30px; text-align: center; font-weight: bold; white-space: nowrap; }
              .frac { display: inline-flex; flex-direction: column; align-items: center; vertical-align: middle; font-size: 0.75em; line-height: 1; margin: 0 1px; }
              .frac .num { display: block; border-bottom: 1px solid black; padding: 0 1px; line-height: 1.1; }
              .frac .den { display: block; padding: 0 1px; line-height: 1.1; }
              @media print { .controls { display: none; } body { background: white; } }
            </style>
          </head>
          <body>
            <div class="controls">
              <button class="btn" onclick="window.print()">Print / Save PDF</button>
              <button class="btn" onclick="downloadJPG()">Download JPG</button>
            </div>
            <div id="capture" class="page-container">
              <div class="header">DATE: ${dateStr}</div>
              <div class="columns">
                <div class="column">
                  <table><tbody>
                    ${col1.map(item => `<tr><td>${item[0]}</td><td class="qty-col">${formatQtyHTML(item[1])}</td></tr>`).join('')}
                  </tbody></table>
                </div>
                <div class="column">
                  <table><tbody>
                    ${col2.map(item => `<tr><td>${item[0]}</td><td class="qty-col">${formatQtyHTML(item[1])}</td></tr>`).join('')}
                  </tbody></table>
                </div>
              </div>
            </div>
            <script>
              function downloadJPG() {
                const btn = document.querySelector('button[onclick="downloadJPG()"]');
                if (btn) { btn.disabled = true; btn.innerText = 'Generating...'; }
                const a4Width = 595; const a4Height = 842;
                html2canvas(document.querySelector("#capture"), {
                  scale: 1,
                  width: a4Width,
                  height: a4Height,
                  windowWidth: a4Width,
                  windowHeight: a4Height,
                  backgroundColor: '#ffffff'
                }).then(canvas => {
                  const link = document.createElement('a');
                  link.download = 'Order_${dateStr.replace(/\//g, '-')}.jpg';
                  link.href = canvas.toDataURL('image/jpeg', 0.92);
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
  };

  // ✅ FIX 3: Proper inline fraction HTML — num/den vertically stacked with border
  function formatQtyHTML(qty: number): string {
    const whole = Math.floor(qty);
    const frac = qty % 1;
    if (frac === 0.5) {
      const wholePart = whole > 0 ? `${whole}` : '';
      return `${wholePart}<span class="frac"><span class="num">1</span><span class="den">2</span></span>`;
    }
    return qty.toString();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Place Order</h1>
        <div className="flex gap-2">
          <button onClick={generateOrderReport} className="bg-blue-600 text-white px-3 py-1.5 rounded-md flex items-center text-sm hover:bg-blue-700 shadow-sm transition-colors"><FileText className="w-4 h-4 mr-1" /> Generate Order</button>
          <button onClick={saveOrder} disabled={loading} className="bg-green-600 text-white px-3 py-1.5 rounded-md flex items-center text-sm hover:bg-green-700 disabled:opacity-50 shadow-sm transition-colors"><ShoppingCart className="w-4 h-4 mr-1" /> Save</button>
        </div>
      </div>

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
          {(powerType === 'Compound' || powerType === 'Cross Compound') && !isKTOrProg && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">CYL Range</label>
              <div className="flex gap-1.5 mt-1">
                <button onClick={() => setCompoundLimit('2.0')} className={`flex-1 py-1.5 px-1 rounded-md border text-[10px] font-medium transition-all ${compoundLimit === '2.0' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700'}`}>upto 2.0 cyl</button>
                <button onClick={() => setCompoundLimit('4.0')} className={`flex-1 py-1.5 px-1 rounded-md border text-[10px] font-medium transition-all ${compoundLimit === '4.0' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700'}`}>upto 4 cyl</button>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Coatings</label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {availableCoatings.map(c => (
                <div key={c} className="relative inline-flex items-center">
                  <button
                    onClick={() => toggleCoating(c)}
                    className={`px-2 py-1 rounded-full text-[10px] font-medium border transition-all ${
                      coatings.includes(c)
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                    } ${!PROTECTED_COATINGS.includes(c) ? 'pr-5' : ''}`}
                  >
                    {c}
                  </button>
                  {!PROTECTED_COATINGS.includes(c) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteCoating(c); }}
                      className={`absolute right-1 transition-colors ${coatings.includes(c) ? 'text-indigo-200 hover:text-white' : 'text-gray-400 hover:text-red-500'}`}
                      title="Delete coating"
                    >
                      <X className="w-3 h-3" />
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

        {/* ✅ FIX 1: Custom power — seedha DB save, list mein nahi */}
        <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">
            Custom Lens Power (Non-Stock)
            <span className="ml-2 text-[10px] text-indigo-400 normal-case font-normal">— directly saves to order</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customPower}
              onChange={(e) => setCustomPower(e.target.value)}
              placeholder="Enter power (e.g. +12.00 -4.50 x 90)"
              className="flex-[3] text-sm bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-700 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              onKeyPress={(e) => e.key === 'Enter' && saveCustomPowerDirectly()}
            />
            <div className="flex-[1] flex items-center bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md px-2">
              <span className="text-[10px] font-bold text-gray-400 mr-1">QTY:</span>
              <input
                type="number"
                step="0.5"
                min="0.5"
                value={customQty}
                onChange={(e) => setCustomQty(e.target.value)}
                className="w-full bg-transparent text-sm text-gray-900 dark:text-gray-100 focus:outline-none"
              />
            </div>
            <button
              onClick={saveCustomPowerDirectly}
              disabled={customSaving || !customPower.trim()}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md flex items-center text-sm font-medium hover:bg-indigo-700 shadow-sm transition-colors disabled:opacity-50"
            >
              {customSaving
                ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving...</>
                : <><ShoppingCart className="w-4 h-4 mr-1" /> Save</>
              }
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-gray-200 dark:divide-gray-700">
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
                    <td className={`px-1 py-1.5 whitespace-nowrap text-[10px] text-center font-bold ${qty > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-300 dark:text-gray-600'}`}>{qty.toFixed(2)}</td>
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
