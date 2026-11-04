import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { showToast } from '../components/Toast';
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
  Shop
} from '../utils/lensUtils';
import { Plus, Tag, X, Edit2, Trash2, Check, Loader2 } from 'lucide-react';

interface SaleRecord {
  id: string;
  lens_details: { name: string };
  quantity: number;
  created_at: string;
  shop_id: string;
  material?: string;
  vision?: string;
  sign?: string;
  power_type?: string;
  sph?: number;
  cyl?: number;
  axis?: number | null;
  addition?: number | null;
  coatings?: string[];
}

// Stock row dhundhne ke liye key. sign / axis / addition NULL ho sakte hain.
interface StockLookup {
  shop_id: string;
  material: string;
  vision: string;
  sign: string | null;
  power_type: string;
  sph: number;
  cyl: number;
  axis: number | null;
  addition: number | null;
  coatings: string[];
}

// NULL columns ke liye .is(col, null) use hota hai (.eq(col, null) sahi match nahi karta).
async function findStockRow(k: StockLookup): Promise<{ id: string; quantity: number } | null> {
  let q: any = supabase
    .from('lens_stock')
    .select('id, quantity')
    .eq('shop_id', k.shop_id)
    .eq('material', k.material)
    .eq('vision', k.vision)
    .eq('power_type', k.power_type)
    .eq('sph', k.sph)
    .eq('cyl', k.cyl)
    .eq('coatings', `{${k.coatings.join(',')}}`);
  q = k.sign ? q.eq('sign', k.sign) : q.is('sign', null);
  q = k.axis != null ? q.eq('axis', k.axis) : q.is('axis', null);
  q = k.addition != null ? q.eq('addition', k.addition) : q.is('addition', null);
  const { data, error } = await q.limit(1);
  if (error) throw error;
  if (!data || !data.length) return null;
  return { id: data[0].id, quantity: Number(data[0].quantity) };
}

// Stock tabhi badlega jab beech me kisi ne quantity change na ki ho (expectedOld match kare).
async function setStockQuantity(id: string, expectedOld: number, newQty: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('lens_stock')
    .update({ quantity: newQty })
    .eq('id', id)
    .eq('quantity', expectedOld)
    .select('id');
  if (error) throw error;
  return !!data && data.length > 0;
}

function lookupFromRecord(r: SaleRecord): StockLookup {
  return {
    shop_id: r.shop_id,
    material: r.material || '',
    vision: r.vision || '',
    sign: r.sign || null,
    power_type: r.power_type || '',
    sph: Number(r.sph),
    cyl: Number(r.cyl),
    axis: r.axis ?? null,
    addition: r.addition ?? null,
    coatings: r.coatings || [],
  };
}

export default function SellPage({ isDemo = false }: { isDemo?: boolean }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState('');
  const [material, setMaterial] = useState<Material>('CR');
  const [vision, setVision] = useState<Vision>('single vision');
  const [coatings, setCoatings] = useState<string[]>(['HC']);
  const [sign, setSign] = useState<Sign>('-');
  const [powerType, setPowerType] = useState<PowerType>('SPH');
  const [rowAxes, setRowAxes] = useState<Record<string, number>>({});
  const [customCoating, setCustomCoating] = useState('');
  const [availableCoatings, setAvailableCoatings] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('availableCoatings');
      if (saved) {
        let c = JSON.parse(saved);
        if (c.includes('Bluecut green')) {
          c = c.map((x: string) => x === 'Bluecut green' ? 'Bluecut' : x);
          localStorage.setItem('availableCoatings', JSON.stringify(c));
        }
        return c;
      }
      return DEFAULT_COATINGS;
    } catch { return DEFAULT_COATINGS; }
  });
  const [deltas, setDeltas] = useState<Record<string, { qty: number; name: string }>>({});
  const [originalStock, setOriginalStock] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [customRows, setCustomRows] = useState<CustomLensRow[]>([]);

  // Edit Sale modal states
  const [showEditSale, setShowEditSale] = useState(false);
  const [saleRecords, setSaleRecords] = useState<SaleRecord[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingQty, setEditingQty] = useState('');
  const [editingName, setEditingName] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [filterShopId, setFilterShopId] = useState<string>('all');

  const isKTOrProg = vision === 'KT' || vision === 'Prograssive';

  useEffect(() => {
    async function loadRows() {
      setLoading(true);
      let custom = await fetchCustomLensRows(material, vision, sign, powerType, coatings);
      if (!custom) {
        custom = generateLensRows(powerType, vision, sign);
      }
      if (sign === '+' && powerType === 'SPH') {
        custom = custom.filter(row => parseFloat(row.sph) !== 0);
      }
      setCustomRows(custom);
      setLoading(false);
    }
    loadRows();
  }, [material, vision, sign, powerType, coatings]);

  const lensRows = customRows;

  const showAxis = powerType !== 'SPH' && powerType !== 'Cross Compound' && !(powerType === 'Compound' && vision === 'single vision');

  useEffect(() => {
    if (!showAxis) {
      setRowAxes({});
      return;
    }
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
  }, [vision, sign, powerType, lensRows, showAxis]);

  useEffect(() => {
    async function fetchShops() {
      if (isDemo) {
        const demo = [{ id: '1', name: 'Narbada Eye Care' }];
        setShops(demo); setSelectedShop(demo[0].id); return;
      }
      const { data } = await supabase.from('shops').select('*');
      if (data?.length) {
        const narbada = data.find(s => s.name.toLowerCase().includes('narbada')) || data[0];
        setShops([narbada]);
        setSelectedShop(narbada.id);
      }
    }
    fetchShops();
  }, [isDemo]);

  useEffect(() => {
    if (selectedShop && !isDemo) fetchStock();
    setDeltas({});
    setOriginalStock({});  // Clear stale stock on filter change
  }, [selectedShop, material, vision, coatings, sign, powerType, isDemo]);

  async function fetchStock() {
    setLoading(true);
    try {
      let query = supabase.from('lens_stock').select('*')
        .eq('shop_id', selectedShop).eq('material', material)
        .eq('vision', vision).eq('sign', sign).eq('power_type', powerType)
        .eq('coatings', `{${coatings.join(',')}}`);
      if (powerType === 'SPH') query = query.eq('cyl', 0);
      else if (powerType === 'CYL') query = query.gt('cyl', 0).lte('cyl', 6.0);
      else query = query.gte('cyl', 0.25);

      const { data, error } = await query;
      if (error) throw error;
      const stockMap: Record<string, number> = {};
      (data || []).forEach((item) => {
        const axisVal = item.axis ?? '';
        const addVal = item.addition != null ? item.addition.toFixed(2) : '';
        stockMap[`${item.sph.toFixed(2)}:${item.cyl.toFixed(2)}:${axisVal}:${addVal}`] = Number(item.quantity);
      });
      setOriginalStock(stockMap);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  // ── FETCH TODAY'S SALES ───────────────────────────────────────
  const fetchTodaySales = useCallback(async () => {
    if (isDemo) return;
    setEditLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('sales')
      .select('id, lens_details, quantity, created_at, shop_id, material, vision, sign, power_type, sph, cyl, axis, addition, coatings')
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`)
      .order('created_at', { ascending: false });
    setSaleRecords(data || []);
    setEditLoading(false);
  }, [isDemo]);

  const openEditModal = () => {
    setShowEditSale(true);
    setSelectedIds(new Set());
    setEditingId(null);
    setFilterShopId('all');
    fetchTodaySales();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const filteredRecords = filterShopId === 'all'
    ? saleRecords
    : saleRecords.filter(r => r.shop_id === filterShopId);

  const toggleSelectAll = () => {
    setSelectedIds(
      selectedIds.size === filteredRecords.length
        ? new Set()
        : new Set(filteredRecords.map(r => r.id))
    );
  };

  // Delete: stock wapas restore karo
  const deleteSelected = async () => {
    if (!selectedIds.size) return;
    if (!window.confirm(`${selectedIds.size} sale record(s) delete karna chahte ho? Stock wapas restore ho jayega.`)) return;
    setDeleteLoading(true);

    const toDelete = saleRecords.filter(r => selectedIds.has(r.id));
    const failed: string[] = [];

    for (const record of toDelete) {
      let restored: { id: string; from: number; to: number } | null = null;
      try {
        // Stock restore karo agar sale record me details hain
        if (record.material && record.sph != null && record.cyl != null) {
          const row = await findStockRow(lookupFromRecord(record));
          if (row) {
            const to = row.quantity + Number(record.quantity);
            const ok = await setStockQuantity(row.id, row.quantity, to);
            if (!ok) throw new Error('Stock beech me badal gaya, dobara try karo.');
            restored = { id: row.id, from: row.quantity, to };
          }
        }
        const { error } = await supabase.from('sales').delete().eq('id', record.id);
        if (error) throw error;
      } catch (e: any) {
        // Sale delete na hui to restore kiya hua stock wapas pehle jaisa kar do
        if (restored) {
          try { await setStockQuantity(restored.id, restored.to, restored.from); } catch (_) { /* ignore */ }
        }
        failed.push(`${record.lens_details?.name || record.id}: ${e?.message || e}`);
      }
    }

    setDeleteLoading(false);
    if (failed.length) alert('Ye sales delete nahi hui:\n' + failed.join('\n'));
    setSelectedIds(new Set());
    await fetchTodaySales();
    await fetchStock();
  };

  // Save edit: quantity update karo, stock difference adjust karo
  const saveEdit = async (record: SaleRecord) => {
    const newQty = parseFloat(editingQty);
    if (isNaN(newQty) || newQty <= 0) { alert('Valid quantity enter karo.'); return; }

    const oldQty = Number(record.quantity);
    const diff = newQty - oldQty; // positive = zyada sell, negative = kam sell
    let adjusted: { id: string; from: number; to: number } | null = null;

    try {
      // Stock update karo agar details available hain
      if (record.material && record.sph != null && record.cyl != null && diff !== 0) {
        const row = await findStockRow(lookupFromRecord(record));
        if (row) {
          if (diff > 0 && diff > row.quantity) {
            alert(`Stock kam hai: abhi sirf ${row.quantity} pair bacha hai, aap ${diff} pair aur badhana chahte ho.`);
            return;
          }
          const to = row.quantity - diff;
          const ok = await setStockQuantity(row.id, row.quantity, to);
          if (!ok) { alert('Stock beech me badal gaya, dobara try karo.'); return; }
          adjusted = { id: row.id, from: row.quantity, to };
        } else if (diff > 0) {
          alert('Is lens ka stock nahi mila, isliye quantity badhai nahi ja sakti.');
          return;
        }
      }

      const { error } = await supabase.from('sales')
        .update({ lens_details: { name: editingName }, quantity: newQty })
        .eq('id', record.id);
      if (error) throw error;
    } catch (e: any) {
      // Sale update fail hui to stock wapas pehle jaisa kar do
      if (adjusted) {
        try { await setStockQuantity(adjusted.id, adjusted.to, adjusted.from); } catch (_) { /* ignore */ }
      }
      alert('Update failed: ' + (e?.message || e));
      return;
    }

    setEditingId(null);
    await fetchTodaySales();
    await fetchStock();
  };

  const handleQuantityChange = (sph: string, cyl: string, name: string, delta: number, axis?: number, add?: string) => {
    const key = `${parseFloat(sph).toFixed(2)}:${parseFloat(cyl).toFixed(2)}:${axis || ''}:${add || ''}`;
    const current = deltas[key] || { qty: 0, name };
    const newQty = Math.max(0, current.qty + delta);

    // Stock page par jitna stock dikh raha hai, usse zyada sell nahi kar sakte
    const available = originalStock[key] || 0;
    if (delta > 0 && newQty > available) {
      showToast(available > 0 ? `Stock sirf ${available} pair hai.` : 'Stock 0 hai, sell nahi kar sakte.', 'error');
      return;
    }

    if (newQty === 0) { const d = { ...deltas }; delete d[key]; setDeltas(d); }
    else setDeltas({ ...deltas, [key]: { qty: newQty, name } });
  };

  const saveSale = async () => {
    if (isDemo) { showToast('Demo Mode: Sales are not saved.', 'info'); return; }
    const entries = Object.entries(deltas);
    if (!entries.length) { showToast('Please add items to sell.', 'info'); return; }
    setLoading(true);

    try {
      // Step 1: har item ka latest stock database se lo
      const prepared: {
        key: string;
        data: { qty: number; name: string };
        sphStr: string; cylStr: string; axisStr: string; addStr: string;
        row: { id: string; quantity: number } | null;
      }[] = [];

      for (const [key, data] of entries) {
        const [sphStr, cylStr, axisStr, addStr] = key.split(':');
        const row = await findStockRow({
          shop_id: selectedShop, material, vision, sign, power_type: powerType,
          sph: parseFloat(sphStr), cyl: parseFloat(cylStr),
          axis: axisStr ? parseInt(axisStr) : null,
          addition: addStr ? parseFloat(addStr) : null,
          coatings,
        });
        prepared.push({ key, data, sphStr, cylStr, axisStr, addStr, row });
      }

      // Step 2: kisi bhi item me stock kam ho to kuch bhi save nahi hoga
      const short = prepared.filter(p => (p.row?.quantity ?? 0) < p.data.qty);
      if (short.length) {
        const lines = short.map(p => `• ${p.data.name}: stock ${p.row?.quantity ?? 0}, sell ${p.data.qty}`);
        alert('Stock kam hai, sale save nahi hui:\n' + lines.join('\n'));
        return;
      }

      // Step 3: stock kam karo, phir sale record save karo
      let ok = 0;
      let lastErr: any = null;
      const failedKeys: string[] = [];

      for (const p of prepared) {
        const row = p.row!;
        const newStock = row.quantity - p.data.qty;

        const updated = await setStockQuantity(row.id, row.quantity, newStock);
        if (!updated) {
          lastErr = { message: `${p.data.name}: stock beech me badal gaya, dobara try karo.` };
          failedKeys.push(p.key);
          continue;
        }

        // Sale record me full details save karo (edit/delete ke liye)
        const { error: saleError } = await supabase.from('sales').insert({
          shop_id: selectedShop,
          lens_details: { name: p.data.name },
          quantity: p.data.qty,
          material, vision, sign,
          power_type: powerType,
          sph: parseFloat(p.sphStr),
          cyl: parseFloat(p.cylStr),
          axis: p.axisStr ? parseInt(p.axisStr) : null,
          addition: p.addStr ? parseFloat(p.addStr) : null,
          coatings
        });

        if (saleError) {
          lastErr = saleError;
          failedKeys.push(p.key);
          // Sale save nahi hui to stock wapas pehle jaisa kar do
          try { await setStockQuantity(row.id, newStock, row.quantity); } catch (_) { /* ignore */ }
        } else ok++;
      }

      if (ok > 0) {
        showToast(`Sales recorded! (${ok} items)`, 'success');
      }
      if (lastErr) alert('Failed: ' + (lastErr as any).message);

      setOriginalStock({});  // Clear before refetch so UI refreshes properly
      if (failedKeys.length) {
        const remaining: Record<string, { qty: number; name: string }> = {};
        failedKeys.forEach(k => { remaining[k] = deltas[k]; });
        setDeltas(remaining);
      } else {
        setDeltas({});
      }
      await fetchStock();
    } catch (e: any) {
      alert('Failed: ' + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  const toggleCoating = (c: string) => {
    if (c === 'Photo Grey') {
      coatings.includes(c) ? setCoatings(coatings.filter(i => i !== c)) : setCoatings([...coatings, c]);
    } else {
      setCoatings(coatings.includes('Photo Grey') ? ['Photo Grey', c] : [c]);
    }
  };

  const addCustomCoating = () => {
    if (customCoating && !availableCoatings.includes(customCoating)) {
      const updated = [...availableCoatings, customCoating];
      setAvailableCoatings(updated);
      localStorage.setItem('availableCoatings', JSON.stringify(updated));
      setCoatings(coatings.includes('Photo Grey') ? ['Photo Grey', customCoating] : [customCoating]);
      setCustomCoating('');
    }
  };

  const deleteCoating = (c: string) => {
    setAvailableCoatings(availableCoatings.filter(i => i !== c));
    setCoatings(coatings.filter(i => i !== c));
  };

  const getShopName = (id: string) => shops.find(s => s.id === id)?.name || id;

  return (
    <div className="space-y-4 pb-20">

      {/* Top bar */}
      <div className="sticky top-[137px] sm:top-16 z-40 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm -mx-4 px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center shadow-sm">
        <h1 className="text-sm font-bold text-gray-900 dark:text-white">Record Sale</h1>
        <div className="flex gap-2">
          <button onClick={openEditModal}
            className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-md flex items-center text-sm shadow-sm transition-colors">
            <Edit2 className="w-4 h-4 mr-1" /> Edit Sale
          </button>
          <button onClick={saveSale} disabled={loading}
            className="bg-indigo-600 text-white px-3 py-1.5 rounded-md flex items-center hover:bg-indigo-700 disabled:opacity-50 text-sm shadow-sm transition-colors">
            <Tag className="w-4 h-4 mr-1" /> Save Sale
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm space-y-3 border border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Material</label>
            <div className="flex gap-1.5">
              {MATERIALS.map(m => (
                <button key={m} onClick={() => setMaterial(m)}
                  className={`flex-1 py-1.5 px-2 rounded-md border text-[10px] font-medium transition-all ${material === m ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Vision</label>
            <select value={vision} onChange={(e) => { setVision(e.target.value as Vision); setRowAxes({}); }}
              className="block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-1.5 border text-[10px]">
              {VISIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Power Type</label>
            <div className="flex flex-wrap gap-1 mt-1">
              {(['SPH', 'CYL', 'Compound', 'Cross Compound'] as PowerType[]).map(type => (
                <button key={type} onClick={() => setPowerType(type)}
                  className={`px-2 py-1.5 rounded-md border text-[10px] font-medium transition-all ${powerType === type ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100'}`}>
                  {type}
                </button>
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

        {/* Coatings */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Coatings</label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {availableCoatings.map(c => (
                <div key={c} className="relative inline-flex items-center">
                  <button onClick={() => toggleCoating(c)}
                    className={`px-2 py-1 rounded-full text-[10px] font-medium border transition-all ${coatings.includes(c) ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'} ${!PROTECTED_COATINGS.includes(c) ? 'pr-5' : ''}`}>
                    {c}
                  </button>
                  {!PROTECTED_COATINGS.includes(c) && (
                    <button onClick={(e) => { e.stopPropagation(); deleteCoating(c); }}
                      className={`absolute right-1 transition-colors ${coatings.includes(c) ? 'text-indigo-200 hover:text-white' : 'text-gray-400 hover:text-red-500'}`}>
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <input type="text" value={customCoating} onChange={(e) => setCustomCoating(e.target.value)} placeholder="Add coating..."
                className="text-[10px] bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 w-24 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              <button onClick={addCustomCoating} className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 p-1 rounded-md hover:bg-indigo-200 transition-colors">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Lens rows table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800/80 text-center">
              <tr>
                <th className="px-2 py-1.5 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-48">Description</th>
                {showAxis && <th className="px-1 py-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-16">Axis</th>}
                <th className="px-1 py-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-16">Stock</th>
                <th className="px-1 py-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-16">Sell Qty</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {lensRows.map((row, index) => {
                const rowKey = `${row.sph}-${row.cyl}-${row.add || ''}-${index}`;
                const rowAxis = rowAxes[rowKey];
                const name = formatLensName(material, vision, sign, powerType, row.sph, row.cyl, coatings, rowAxis, row.add);
                const key = `${parseFloat(row.sph).toFixed(2)}:${parseFloat(row.cyl).toFixed(2)}:${rowAxis || ''}:${row.add || ''}`;
                const sellQty = deltas[key]?.qty || 0;
                const origQty = originalStock[key] || 0;
                return (
                  <tr key={rowKey} className="hover:bg-indigo-50/50 dark:hover:bg-gray-700/30 transition-colors even:bg-gray-100 dark:even:bg-gray-700/50">
                    <td className="px-2 py-1.5 whitespace-nowrap text-xs font-medium text-gray-700 dark:text-gray-300 w-48">{name}</td>
                    {showAxis && (
                      <td className="px-1 py-1.5 text-center">
                        <select value={rowAxis || ''} onChange={(e) => setRowAxes({ ...rowAxes, [rowKey]: parseInt(e.target.value) })}
                          className="bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-[10px] p-0.5 w-14">
                          <option value="">-</option>
                          {(vision === 'KT' ? KT_AXIS : PROGRESSIVE_AXIS).map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                      </td>
                    )}
                    <td className="px-1 py-1.5 whitespace-nowrap text-[10px] text-center text-gray-400 dark:text-gray-500">{origQty.toFixed(2)}</td>
                    <td className={`px-1 py-1.5 whitespace-nowrap text-[10px] text-center font-bold ${sellQty === 0 ? 'text-gray-300 dark:text-gray-600' : 'text-red-600 dark:text-red-400'}`}>
                      {sellQty > 0 ? `-${sellQty.toFixed(2)}` : sellQty.toFixed(2)}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => handleQuantityChange(row.sph, row.cyl, name, -0.5, rowAxis, row.add)}
                          className="p-3 rounded-md bg-gray-50 dark:bg-gray-900/40 text-gray-400 dark:text-gray-500 hover:bg-red-50 hover:text-red-500 transition-colors">
                          <Plus className="w-6 h-6 rotate-45" />
                        </button>
                        <button onClick={() => handleQuantityChange(row.sph, row.cyl, name, 0.5, rowAxis, row.add)}
                          className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 hover:bg-red-100 transition-colors">
                          <Plus className="w-6 h-6" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══ EDIT SALE MODAL ══ */}
      {showEditSale && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl mt-8 mb-8 flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Edit2 className="w-4 h-4 text-amber-500" /> Edit Sale
                </h2>
                <p className="text-[10px] text-gray-400 mt-0.5">Aaj ki sales — edit ya delete karo (stock auto-update hoga)</p>
              </div>
              <button onClick={() => setShowEditSale(false)} className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>


            {/* Action bar */}
            <div className="flex items-center justify-between px-5 py-2.5 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-700">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox"
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  checked={filteredRecords.length > 0 && selectedIds.size === filteredRecords.length}
                  onChange={toggleSelectAll} />
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
                </span>
              </label>
              <div className="flex items-center gap-2">
                {selectedIds.size > 0 && (
                  <button onClick={deleteSelected} disabled={deleteLoading}
                    className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 shadow-sm">
                    {deleteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Delete ({selectedIds.size})
                  </button>
                )}
                <button onClick={fetchTodaySales} disabled={editLoading}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50">
                  {editLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto max-h-[60vh]">
              {editLoading ? (
                <div className="flex items-center justify-center py-16 text-sm text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
                </div>
              ) : filteredRecords.length === 0 ? (
                <div className="text-center py-16 text-sm text-gray-400">Aaj koi sale nahi mili.</div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800/80 sticky top-0">
                    <tr>
                      <th className="w-10 px-3 py-2"></th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Lens Name</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24">Shop</th>
                      <th className="px-3 py-2 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider w-20">Qty</th>
                      <th className="px-3 py-2 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider w-20">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {filteredRecords.map(record => {
                      const isSelected = selectedIds.has(record.id);
                      const isEditing = editingId === record.id;
                      return (
                        <tr key={record.id}
                          className={`transition-colors ${isSelected ? 'bg-red-50 dark:bg-red-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 even:bg-gray-50/50 dark:even:bg-gray-800/20'}`}>
                          <td className="px-3 py-2 text-center">
                            <input type="checkbox"
                              className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-red-400 cursor-pointer"
                              checked={isSelected} onChange={() => toggleSelect(record.id)} />
                          </td>
                          <td className="px-3 py-2">
                            {isEditing ? (
                              <input type="text" value={editingName} onChange={(e) => setEditingName(e.target.value)}
                                className="w-full text-xs bg-white dark:bg-gray-900 border border-indigo-400 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                autoFocus />
                            ) : (
                              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{record.lens_details?.name}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-[10px] text-gray-400 whitespace-nowrap">{getShopName(record.shop_id)}</td>
                          <td className="px-3 py-2 text-center">
                            {isEditing ? (
                              <input type="number" step="0.5" min="0.5" value={editingQty} onChange={(e) => setEditingQty(e.target.value)}
                                className="w-16 text-xs text-center bg-white dark:bg-gray-900 border border-indigo-400 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                            ) : (
                              <span className="text-xs font-bold text-red-600 dark:text-red-400">{record.quantity}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => saveEdit(record)}
                                  className="p-1.5 rounded bg-green-100 dark:bg-green-900/30 text-green-600 hover:bg-green-200 transition-colors">
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setEditingId(null)}
                                  className="p-1.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 transition-colors">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => { setEditingId(record.id); setEditingQty(String(record.quantity)); setEditingName(record.lens_details?.name || ''); }}
                                className="p-1.5 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-600 hover:bg-amber-100 transition-colors">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <span className="text-[10px] text-gray-400">
                Total: <strong className="text-gray-600 dark:text-gray-300">{filteredRecords.length}</strong> sales aaj ki
              </span>
              <button onClick={() => setShowEditSale(false)}
                className="px-4 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
