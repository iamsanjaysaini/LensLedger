import { useState, useEffect, useMemo } from 'react';
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
  Shop
} from '../utils/lensUtils';
import { Plus, Tag } from 'lucide-react';

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
  const [availableCoatings, setAvailableCoatings] = useState(DEFAULT_COATINGS);
  const [deltas, setDeltas] = useState<Record<string, { qty: number, name: string }>>({});
  const [originalStock, setOriginalStock] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [customRows, setCustomRows] = useState<CustomLensRow[]>([]);

  const isKTOrProg = vision === 'KT' || vision === 'Prograssive';

  useEffect(() => {
    async function loadRows() {
      setLoading(true);
      const custom = await fetchCustomLensRows(material, vision, sign, powerType, compoundLimit, coatings); // ✅
      if (custom) {
        setCustomRows(custom);
      } else {
        setCustomRows(generateLensRows(powerType, compoundLimit, vision));
      }
      setLoading(false);
    }
    loadRows();
  }, [material, vision, sign, powerType, compoundLimit, coatings]); // ✅

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
        const demoShops = [
          { id: '1', name: 'SS Opticals' },
          { id: '2', name: 'Narbada Eye Care' }
        ];
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

  useEffect(() => {
    if (selectedShop && !isDemo) {
      fetchStock();
    }
    setDeltas({});
  }, [selectedShop, material, vision, coatings, sign, powerType, compoundLimit, isDemo]);

  async function fetchStock() {
    setLoading(true);
    try {
      let query = supabase
        .from('lens_stock')
        .select('*')
        .eq('shop_id', selectedShop)
        .eq('material', material)
        .eq('vision', vision)
        .eq('sign', sign)
        .eq('power_type', powerType);

      query = query.eq('coatings', `{${coatings.join(',')}}`);

      if (powerType === 'SPH') {
        query = query.eq('cyl', 0);
      } else if (powerType === 'CYL') {
        query = query.gt('cyl', 0).lte('cyl', 6.0);
      } else {
        if (compoundLimit === '2.0') {
          query = query.gte('cyl', 0.25).lte('cyl', 2.0);
        } else {
          query = query.gte('cyl', 2.25).lte('cyl', 4.0);
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      const stockMap: Record<string, number> = {};
      if (data) {
        data.forEach((item) => {
          const axisVal = item.axis !== null && item.axis !== undefined ? item.axis : '';
          const addVal = item.addition !== null && item.addition !== undefined ? item.addition.toFixed(2) : '';
          const key = `${item.sph.toFixed(2)}:${item.cyl.toFixed(2)}:${axisVal}:${addVal}`;
          stockMap[key] = Number(item.quantity);
        });
      }
      setOriginalStock(stockMap);
    } catch (error) {
      console.error("Fetch error:", error);
    } finally {
      setLoading(false);
    }
  }

  const handleQuantityChange = (sph: string, cyl: string, name: string, delta: number, axis?: number, add?: string) => {
    const key = `${parseFloat(sph).toFixed(2)}:${parseFloat(cyl).toFixed(2)}:${axis || ''}:${add || ''}`;
    const current = deltas[key] || { qty: 0, name };
    const newQty = Math.max(0, current.qty + delta);
    if (newQty === 0) { const newDeltas = { ...deltas }; delete newDeltas[key]; setDeltas(newDeltas); }
    else { setDeltas({ ...deltas, [key]: { qty: newQty, name } }); }
  };

  const saveSale = async () => {
    if (isDemo) { alert('Demo Mode: Sales are not saved to the database.'); return; }
    const entries = Object.entries(deltas);
    if (entries.length === 0) { alert('Please add items to sell.'); return; }

    setLoading(true);
    let successCount = 0;
    let lastError = null;

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

      if (stockError) { console.error("Stock update error:", stockError); lastError = stockError; continue; }

      const { error: saleError } = await supabase.from('sales').insert({
        shop_id: selectedShop,
        lens_details: { name: data.name },
        quantity: data.qty
      });

      if (saleError) { console.error("Sale record error:", saleError); lastError = saleError; }
      else { successCount++; }
    }

    setLoading(false);
    if (successCount > 0) { alert(`Sales recorded successfully! (${successCount} items)`); await fetchStock(); setDeltas({}); }
    else if (lastError) { alert('Failed to record sales. Error: ' + (lastError as any).message); }
    else { alert('No sales were recorded.'); }
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
      setAvailableCoatings([...availableCoatings, customCoating]);
      const photoGreySelected = coatings.includes('Photo Grey');
      setCoatings(photoGreySelected ? ['Photo Grey', customCoating] : [customCoating]);
      setCustomCoating('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Record Sale</h1>
        <button onClick={saveSale} disabled={loading} className="bg-indigo-600 text-white px-3 py-1.5 rounded-md flex items-center hover:bg-indigo-700 disabled:opacity-50 text-sm shadow-sm transition-colors">
          <Tag className="w-4 h-4 mr-1" /> Save Sale
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm space-y-3 border border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Shop</label>
            <div className="flex gap-1.5">
              {shops.map(shop => (<button key={shop.id} onClick={() => setSelectedShop(shop.id)} className={`flex-1 py-1.5 px-2 rounded-md border text-[10px] font-medium transition-all ${selectedShop === shop.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>{shop.name}</button>))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Material</label>
            <div className="flex gap-1.5">
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

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Power Type</label>
            <div className="flex flex-wrap gap-1 mt-1">
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

        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Coatings</label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {availableCoatings.map(c => (<button key={c} onClick={() => toggleCoating(c)} className={`px-2 py-1 rounded-full text-[10px] font-medium border transition-all ${coatings.includes(c) ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'}`}>{c}</button>))}
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <input type="text" value={customCoating} onChange={(e) => setCustomCoating(e.target.value)} placeholder="Add coating..." className="text-[10px] bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 w-24 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all" />
              <button onClick={addCustomCoating} className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 p-1 rounded-md hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition-colors"><Plus className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="w-full md:w-auto divide-y divide-gray-200 dark:divide-gray-700">
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
                        <select value={rowAxis || ''} onChange={(e) => setRowAxes({ ...rowAxes, [rowKey]: parseInt(e.target.value) })} className="bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-[10px] p-0.5 w-14">
                          <option value="">-</option>
                          {(vision === 'KT' ? KT_AXIS : PROGRESSIVE_AXIS).map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                      </td>
                    )}
                    <td className="px-1 py-1.5 whitespace-nowrap text-sm font-bold text-center text-gray-600 dark:text-gray-300">{origQty.toFixed(2)}</td>
                    <td className={`px-1 py-1.5 whitespace-nowrap text-sm text-center font-extrabold ${sellQty === 0 ? 'text-gray-400 dark:text-gray-500' : 'text-red-600 dark:text-red-400'}`}>
                      {sellQty > 0 ? `-${sellQty.toFixed(2)}` : sellQty.toFixed(2)}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => handleQuantityChange(row.sph, row.cyl, name, 0.5, rowAxis, row.add)} className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"><Plus className="w-6 h-6" /></button>
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
