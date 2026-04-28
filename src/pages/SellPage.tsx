import { useState, useEffect, useCallback } from 'react';
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

export default function SellPage({ isDemo = false }: { isDemo?: boolean }) {
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
      const custom = await fetchCustomLensRows(material, vision, sign, powerType, compoundLimit, coatings);
      setCustomRows(custom || generateLensRows(powerType, compoundLimit, vision));
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
        const demo = [{ id: '1', name: 'SS Opticals' }, { id: '2', name: 'Narbada Eye Care' }];
        setShops(demo); setSelectedShop(demo[0].id); return;
      }
      const { data } = await supabase.from('shops').select('*');
      if (data?.length) { setShops(data); setSelectedShop(data[0].id); }
    }
    fetchShops();
  }, [isDemo]);

  useEffect(() => {
    if (selectedShop && !isDemo) fetchStock();
    setDeltas({});
  }, [selectedShop, material, vision, coatings, sign, powerType, compoundLimit, isDemo]);

  async function fetchStock() {
    setLoading(true);
    try {
      let query = supabase.from('lens_stock').select('*')
        .eq('shop_id', selectedShop).eq('material', material)
        .eq('vision', vision).eq('sign', sign).eq('power_type', powerType)
        .eq('coatings', `{${coatings.join(',')}}`);
      if (powerType === 'SPH') query = query.eq('cyl', 0);
      else if (powerType === 'CYL') query = query.gt('cyl', 0).lte('cyl', 6.0);
      else if (compoundLimit === '2.0') query = query.gte('cyl', 0.25).lte('cyl', 2.0);
      else query = query.gte('cyl', 2.25).lte('cyl', 4.0);

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

    for (const record of toDelete) {
      // Stock restore karo agar sale record me details hain
      if (record.material && record.sph != null && record.cyl != null) {
        const { data: existing } = await supabase
          .from('lens_stock')
          .select('quantity')
          .eq('shop_id', record.shop_id)
          .eq('material', record.material)
          .eq('vision', record.vision || '')
          .eq('sign', record.sign || '')
          .eq('power_type', record.power_type || '')
          .eq('sph', record.sph)
          .eq('cyl', record.cyl)
          .eq('axis', record.axis ?? null)
          .eq('addition', record.addition ?? null)
          .eq('coatings', `{${(record.coatings || []).join(',')}}`)
          .maybeSingle();

        if (existing) {
          await supabase.from('lens_stock').update({
            quantity: (existing.quantity || 0) + record.quantity
          }).eq('shop_id', record.shop_id)
            .eq('material', record.material)
            .eq('vision', record.vision || '')
            .eq('sign', record.sign || '')
            .eq('power_type', record.power_type || '')
            .eq('sph', record.sph)
            .eq('cyl', record.cyl)
            .eq('axis', record.axis ?? null)
            .eq('addition', record.addition ?? null)
            .eq('coatings', `{${(record.coatings || []).join(',')}}`);
        }
      }
    }

    const { error } = await supabase.from('sales').delete().in('id', Array.from(selectedIds));
    setDeleteLoading(false);
    if (error) { alert('Delete failed: ' + error.message); return; }
    setSelectedIds(new Set());
    await fetchTodaySales();
    await fetchStock();
  };

  // Save edit: quantity update karo, stock difference adjust karo
  const saveEdit = async (record: SaleRecord) => {
    const newQty = parseFloat(editingQty);
    if (isNaN(newQty) || newQty <= 0) { alert('Valid quantity enter karo.'); return; }

    const oldQty = record.quantity;
    const diff = newQty - oldQty; // positive = zyada sell, negative = kam sell

    // Stock update karo agar details available hain
    if (record.material && record.sph != null && record.cyl != null && diff !== 0) {
      const { data: existing } = await supabase
        .from('lens_stock')
        .select('quantity')
        .eq('shop_id', record.shop_id)
        .eq('material', record.material)
        .eq('vision', record.vision || '')
        .eq('sign', record.sign || '')
        .eq('power_type', record.power_type || '')
        .eq('sph', record.sph)
        .eq('cyl', record.cyl)
        .eq('axis', record.axis ?? null)
        .eq('addition', record.addition ?? null)
        .eq('coatings', `{${(record.coatings || []).join(',')}}`)
        .maybeSingle();

      if (existing) {
        const newStock = Math.max(0, (existing.quantity || 0) - diff);
        await supabase.from('lens_stock').update({ quantity: newStock })
          .eq('shop_id', record.shop_id)
          .eq('material', record.material)
          .eq('vision', record.vision || '')
          .eq('sign', record.sign || '')
          .eq('power_type', record.power_type || '')
          .eq('sph', record.sph)
          .eq('cyl', record.cyl)
          .eq('axis', record.axis ?? null)
          .eq('addition', record.addition ?? null)
          .eq('coatings', `{${(record.coatings || []).join(',')}}`);
      }
    }

    const { error } = await supabase.from('sales')
      .update({ lens_details: { name: editingName }, quantity: newQty })
      .eq('id', record.id);
    if (error) { alert('Update failed: ' + error.message); return; }
    setEditingId(null);
    await fetchTodaySales();
    await fetchStock();
  };

  const handleQuantityChange = (sph: string, cyl: string, name: string, delta: number, axis?: number, add?: string) => {
    const key = `${parseFloat(sph).toFixed(2)}:${parseFloat(cyl).toFixed(2)}:${axis || ''}:${add || ''}`;
    const current = deltas[key] || { qty: 0, name };
    const newQty = Math.max(0, current.qty + delta);
    if (newQty === 0) { const d = { ...deltas }; delete d[key]; setDeltas(d); }
    else setDeltas({ ...deltas, [key]: { qty: newQty, name } });
  };

  const saveSale = async () => {
    if (isDemo) { alert('Demo Mode: Sales are not saved.'); return; }
    const entries = Object.entries(deltas);
    if (!entries.length) { alert('Please add items to sell.'); return; }
    setLoading(true);
    let ok = 0, lastErr = null;

    for (const [key, data] of entries) {
      const [sphStr, cylStr, axisStr, addStr] = key.split(':');
      const currentStock = originalStock[key] || 0;

      const { error: stockError } = await supabase.from('lens_stock').upsert({
        shop_id: selectedShop, material, vision, sign, power_type: powerType,
        sph: parseFloat(sphStr), cyl: parseFloat(cylStr),
        axis: axisStr ? parseInt(axisStr) : null,
        addition: addStr ? parseFloat(addStr) : null,
        coatings, quantity: Math.max(0, currentStock - data.qty)
      }, { onConflict: 'shop_id, material, vision, sign, power_type, sph, cyl, axis, addition, coatings' });

      if (stockError) { lastErr = stockError; continue; }

      // Sale record me full details save karo (edit/delete ke liye)
      const { error: saleError } = await supabase.from('sales').insert({
        shop_id: selectedShop,
        lens_details: { name: data.name },
        quantity: data.qty,
        material, vision, sign,
        power_type: powerType,
        sph: parseFloat(sphStr),
        cyl: parseFloat(cylStr),
        axis: axisStr ? parseInt(axisStr) : null,
        addition: addStr ? parseFloat(addStr) : null,
        coatings
      });

      if (saleError) lastErr = saleError;
      else ok++;
    }

    setLoading(false);
    if (ok > 0) { alert(`Sales recorded! (${ok} items)`); await fetchStock(); setDeltas({}); }
    else if (lastErr) alert('Failed: ' + (lastErr as any).message);
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
    <div className="space-y-4">

      {/* Top bar */}
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Record Sale</h1>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Shop</label>
            <div className="flex gap-1.5">
              {shops.map(shop => (
                <button key={shop.id} onClick={() => setSelectedShop(shop.id)}
                  className={`flex-1 py-1.5 px-2 rounded-md border text-[10px] font-medium transition-all ${selectedShop === shop.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                  {shop.name}
                </button>
              ))}
            </div>
          </div>
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
          {(powerType === 'Compound' || powerType === 'Cross Compound') && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">CYL Range</label>
              <div className="flex gap-1.5 mt-1">
                <button onClick={() => setCompoundLimit('2.0')} className={`flex-1 py-1.5 px-1 rounded-md border text-[10px] font-medium transition-all ${compoundLimit === '2.0' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700'}`}>upto 2.0 cyl</button>
                <button onClick={() => setCompoundLimit('4.0')} className={`flex-1 py-1.5 px-1 rounded-md border text-[10px] font-medium transition-all ${compoundLimit === '4.0' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700'}`}>upto 4 cyl</button>
              </div>
            </div>
          )}
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
                <th className="px-2 py-1.5 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Description</th>
                {powerType !== 'SPH' && <th className="px-1 py-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-16">Axis</th>}
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
                    <td className="px-2 py-1.5 whitespace-nowrap text-xs font-medium text-gray-700 dark:text-gray-300">{name}</td>
                    {powerType !== 'SPH' && (
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

            {/* Shop filter */}
            <div className="px-5 py-2.5 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mr-1">Shop:</span>
              <button onClick={() => setFilterShopId('all')}
                className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all ${filterShopId === 'all' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700'}`}>
                All
              </button>
              {shops.map(s => (
                <button key={s.id} onClick={() => setFilterShopId(s.id)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-medium border transition-all ${filterShopId === s.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700'}`}>
                  {s.name}
                </button>
              ))}
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
