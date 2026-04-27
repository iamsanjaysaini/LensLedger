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
import { Plus, Minus, ShoppingCart, FileText, X } from 'lucide-react';
import { Plus, Minus, ShoppingCart, FileText, X, Settings, Database } from 'lucide-react';

const DB_PROTECTED = ['HC', 'HMC', 'Bluecut Green'];

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
  const [availableCoatings, setAvailableCoatings] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('availableCoatings');
      return saved ? JSON.parse(saved) : DEFAULT_COATINGS;
    } catch { return DEFAULT_COATINGS; }
  });
  const [isEditingCoatings, setIsEditingCoatings] = useState(false);
  const [savingCoatings, setSavingCoatings] = useState(false);
  const [deltas, setDeltas] = useState<Record<string, { qty: number, name: string }>>({});
  const [loading, setLoading] = useState(false);
  const [customRows, setCustomRows] = useState<CustomLensRow[]>([]);

  const isKTOrProg = vision === 'KT' || vision === 'Prograssive';

  useEffect(() => { fetchCoatingsFromDB(); }, []);

  async function fetchCoatingsFromDB() {
    try {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'available_coatings').single();
      if (data?.value) {
        const c = data.value as string[];
        setAvailableCoatings(c);
        localStorage.setItem('availableCoatings', JSON.stringify(c));
      }
    } catch {}
  }

  async function saveCoatingsToDB() {
    setSavingCoatings(true);
    try {
      const { error } = await supabase.from('app_settings').upsert(
        { key: 'available_coatings', value: availableCoatings },
        { onConflict: 'key' }
      );
      if (!error) {
        localStorage.setItem('availableCoatings', JSON.stringify(availableCoatings));
        alert('Coatings saved to database!');
        setIsEditingCoatings(false);
      } else { alert('Failed to save: ' + error.message); }
    } catch { alert('Error saving coatings.'); }
    finally { setSavingCoatings(false); }
  }

  useEffect(() => {
    async function loadRows() {
      setLoading(true);
      const custom = await fetchCustomLensRows(material, vision, sign, powerType, compoundLimit, coatings);
      if (custom) {
        setCustomRows(custom);
      } else {
        setCustomRows(generateLensRows(powerType, compoundLimit, vision));
      }
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
    } else { setRowAxes({}); }
  }, [vision, sign, powerType, lensRows]);

  useEffect(() => {
    async function fetchShops() {
      if (isDemo) {
        const demoShops = [{ id: '1', name: 'SS Opticals' }, { id: '2', name: 'Narbada Eye Care' }];
        setShops(demoShops);
        setSelectedShop(demoShops[0].id);
        return;
        setShops(demoShops); setSelectedShop(demoShops[0].id); return;
      }
      const { data } = await supabase.from('shops').select('*');
      if (data && data.length > 0) {
        setShops(data);
        setSelectedShop(data[0].id);
      }
      if (data && data.length > 0) { setShops(data); setSelectedShop(data[0].id); }
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
    if (newQty === 0) { const nd = { ...deltas }; delete nd[key]; setDeltas(nd); }
    else { setDeltas({ ...deltas, [key]: { qty: newQty, name } }); }
  };

  const saveOrder = async () => {
    if (isDemo) { alert('Demo Mode: Orders are not saved.'); return; }
    const entries = Object.entries(deltas);
    if (entries.length === 0) { alert('Please add items to order.'); return; }
    setLoading(true);
    let successCount = 0;
    let lastError = null;
    let successCount = 0; let lastError = null;
    for (const [_, data] of entries) {
      const { error } = await supabase.from('orders').insert({
        shop_id: selectedShop,
        lens_details: { name: data.name },
        quantity: data.qty
        shop_id: selectedShop, lens_details: { name: data.name }, quantity: data.qty
      });
      if (error) { console.error(error); lastError = error; }
      else { successCount++; }
      if (error) { lastError = error; } else { successCount++; }
    }
    setLoading(false);
    if (successCount > 0) { alert(`Orders saved successfully! (${successCount} items)`); setDeltas({}); }
    else if (lastError) { alert('Failed to save orders. Error: ' + (lastError as any).message); }
    if (successCount > 0) { alert(`Orders saved! (${successCount} items)`); setDeltas({}); }
    else if (lastError) { alert('Failed: ' + (lastError as any).message); }
  };

  const toggleCoating = (c: string) => {
    if (isEditingCoatings) return;
    if (c === 'Photo Grey') {
      if (coatings.includes(c)) { setCoatings(coatings.filter(item => item !== c)); }
      else { setCoatings([...coatings, c]); }
      setCoatings(coatings.includes(c) ? coatings.filter(i => i !== c) : [...coatings, c]);
    } else {
      const photoGreySelected = coatings.includes('Photo Grey');
      setCoatings(photoGreySelected ? ['Photo Grey', c] : [c]);
      const pg = coatings.includes('Photo Grey');
      setCoatings(pg ? ['Photo Grey', c] : [c]);
    }
  };

  const addCustomCoating = () => {
    if (customCoating && !availableCoatings.includes(customCoating)) {
      const updated = [...availableCoatings, customCoating];
      setAvailableCoatings(updated);
      localStorage.setItem('availableCoatings', JSON.stringify(updated));
      const photoGreySelected = coatings.includes('Photo Grey');
      setCoatings(photoGreySelected ? ['Photo Grey', customCoating] : [customCoating]);
      setAvailableCoatings([...availableCoatings, customCoating]);
      setCustomCoating('');
    }
  };

  const deleteCoating = (c: string) => {
    const updated = availableCoatings.filter(item => item !== c);
    setAvailableCoatings(updated);
    localStorage.setItem('availableCoatings', JSON.stringify(updated));
    setCoatings(coatings.filter(item => item !== c));
    if (DB_PROTECTED.includes(c)) return;
    setAvailableCoatings(availableCoatings.filter(i => i !== c));
    setCoatings(coatings.filter(i => i !== c));
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

    const { data: orders } = await supabase.from('orders').select('lens_details, quantity').gte('created_at', today);
    if (!orders || orders.length === 0) { setLoading(false); alert('No orders found for today.'); return; }
    const summary: Record<string, number> = {};
    orders.forEach(o => {
        let name = o.lens_details.name;
        summary[name] = (summary[name] || 0) + Number(o.quantity);
    });

    orders.forEach(o => { summary[o.lens_details.name] = (summary[o.lens_details.name] || 0) + Number(o.quantity); });
    const items = Object.entries(summary).sort((a, b) => sortLensNames(a[0], b[0]));
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
              .columns { display: flex; gap: 10px; }
              .column { flex: 1; }
              table { width: 100%; border-collapse: collapse; }
              td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
              .qty-col { width: 40px; text-align: center; font-weight: bold; }
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
                    ${col1.map(item => `<tr><td>${item[0]}</td><td class="qty-col">${formatReportQty(item[1])}</td></tr>`).join('')}
                  </tbody></table>
                </div>
                <div class="column">
                  <table><tbody>
                    ${col2.map(item => `<tr><td>${item[0]}</td><td class="qty-col">${formatReportQty(item[1])}</td></tr>`).join('')}
                  </tbody></table>
                </div>
              </div>
            </div>
            <script>
              function downloadJPG() {
                const btn = document.querySelector('button[onclick="downloadJPG()"]');
                if (btn) { btn.disabled = true; btn.innerText = 'Generating...'; }
                const a4Width = 794; const a4Height = 1123;
                html2canvas(document.querySelector("#capture"), { scale: 2, width: a4Width, height: a4Height, windowWidth: a4Width, windowHeight: a4Height }).then(canvas => {
                  const finalCanvas = document.createElement('canvas');
                  finalCanvas.width = a4Width * 2; finalCanvas.height = a4Height * 2;
                  const ctx = finalCanvas.getContext('2d');
                  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
                  ctx.drawImage(canvas, 0, 0);
                  const link = document.createElement('a');
                  link.download = 'Order_${dateStr.replace(/\//g, '-')}.jpg';
                  link.href = finalCanvas.toDataURL('image/jpeg', 0.9);
                  link.click();
                  if (btn) { btn.disabled = false; btn.innerText = 'Download JPG'; }
                });
              }
            </script>
          </body>
        </html>
      `);
      win.document.write(`<html><head><title>Order Report - ${dateStr}</title><script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script><style>@page{size:A4;margin:0}*{box-sizing:border-box}body{font-family:'Courier New',Courier,monospace;font-size:11px;margin:0;padding:0;background:white}.controls{padding:8px 16px;display:flex;gap:10px;justify-content:center;background:white;border-bottom:1px solid #eee}.btn{background:#4f46e5;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-family:sans-serif;font-size:14px}.btn:hover{background:#4338ca}.page-container{background:white;width:794px;min-height:1123px;padding:10mm;margin:0 auto}.header{border-bottom:2px solid black;padding-bottom:10px;margin-bottom:20px;text-align:center;font-weight:bold;font-size:16px}.columns{display:flex;gap:10px}.column{flex:1}table{width:100%;border-collapse:collapse}td{border:1px solid #ccc;padding:6px 8px;text-align:left}.qty-col{width:40px;text-align:center;font-weight:bold}@media print{.controls{display:none}body{background:white}}</style></head><body><div class="controls"><button class="btn" onclick="window.print()">Print / Save PDF</button><button class="btn" onclick="downloadJPG()">Download JPG</button></div><div id="capture" class="page-container"><div class="header">DATE: ${dateStr}</div><div class="columns"><div class="column"><table><tbody>${col1.map(item => `<tr><td>${item[0]}</td><td class="qty-col">${formatReportQty(item[1])}</td></tr>`).join('')}</tbody></table></div><div class="column"><table><tbody>${col2.map(item => `<tr><td>${item[0]}</td><td class="qty-col">${formatReportQty(item[1])}</td></tr>`).join('')}</tbody></table></div></div></div><script>function downloadJPG(){const btn=document.querySelector('button[onclick="downloadJPG()"]');if(btn){btn.disabled=true;btn.innerText='Generating...';}html2canvas(document.querySelector("#capture"),{scale:2,width:794,height:1123,windowWidth:794,windowHeight:1123}).then(canvas=>{const fc=document.createElement('canvas');fc.width=1588;fc.height=2246;const ctx=fc.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,fc.width,fc.height);ctx.drawImage(canvas,0,0);const link=document.createElement('a');link.download='Order_${dateStr.replace(/\//g, '-')}.jpg';link.href=fc.toDataURL('image/jpeg',0.9);link.click();if(btn){btn.disabled=false;btn.innerText='Download JPG';}});}</script></body></html>`);
      win.document.close();
    }
  };

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
              {shops.map(shop => (<button key={shop.id} onClick={() => setSelectedShop(shop.id)} className={`flex-1 py-1.5 px-2 rounded-md border text-[10px] font-medium transition-all ${selectedShop === shop.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>{shop.name}</button>))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Material</label>
            <div className="flex gap-1.5">
              {MATERIALS.map(m => (
                <button key={m} onClick={() => setMaterial(m)} className={`flex-1 py-1.5 px-2 rounded-md border text-[10px] font-medium transition-all ${material === m ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>{m}</button>
              ))}
              {MATERIALS.map(m => (<button key={m} onClick={() => setMaterial(m)} className={`flex-1 py-1.5 px-2 rounded-md border text-[10px] font-medium transition-all ${material === m ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>{m}</button>))}
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
              {['SPH', 'CYL', 'Compound', 'Cross Compound'].map((type) => (<button key={type} onClick={() => setPowerType(type as PowerType)} className={`px-2 py-1.5 rounded-md border text-[10px] font-medium transition-all ${powerType === type ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100'}`}>{type}</button>))}
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

        {/* COATINGS SECTION */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Coatings</label>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Coatings</label>
            <button
              onClick={() => isEditingCoatings ? saveCoatingsToDB() : setIsEditingCoatings(true)}
              disabled={savingCoatings}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all disabled:opacity-50 ${
                isEditingCoatings
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {isEditingCoatings
                ? <><Database className="w-3 h-3" /> {savingCoatings ? 'Saving...' : 'Save Coatings to Database'}</>
                : <><Settings className="w-3 h-3" /> Edit Coatings</>
              }
            </button>
          </div>
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
                      coatings.includes(c) ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                    } ${isEditingCoatings && !DB_PROTECTED.includes(c) ? 'pr-5' : ''}`}
                  >
                    {c}
                  </button>
                  {!PROTECTED_COATINGS.includes(c) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteCoating(c); }}
                      className={`absolute right-1 transition-colors ${coatings.includes(c) ? 'text-indigo-200 hover:text-white' : 'text-gray-400 hover:text-red-500'}`}
                      title="Delete coating"
                    >
                  {isEditingCoatings && !DB_PROTECTED.includes(c) && (
                    <button onClick={() => deleteCoating(c)} className="absolute right-1 text-gray-400 hover:text-red-500 transition-colors" title="Delete coating">
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
            {isEditingCoatings && (
              <div className="flex items-center gap-1.5 ml-auto">
                <input
                  type="text" value={customCoating}
                  onChange={(e) => setCustomCoating(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCustomCoating()}
                  placeholder="Add coating..."
                  className="text-[10px] bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 w-24 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button onClick={addCustomCoating} className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 p-1 rounded-md hover:bg-indigo-200 transition-colors"><Plus className="w-3.5 h-3.5" /></button>
              </div>
            )}
          </div>
          {isEditingCoatings && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1.5">
              ⚠️ HC, HMC, Bluecut Green protected hain — delete nahi ho sakte. "Save Coatings to Database" click karo changes save karne ke liye.
            </p>
          )}
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
