import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  generatePowerList,
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
import { Plus, Minus, Save } from 'lucide-react';

export default function StockPage({ isDemo = false }: { isDemo?: boolean }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState('');
  const [material, setMaterial] = useState<Material>('CR');
  const [vision, setVision] = useState<Vision>('single vision');
  const [coatings, setCoatings] = useState<string[]>(['HC']);
  const [sign, setSign] = useState<Sign>('-');
  const [powerType, setPowerType] = useState<PowerType>('SPH');
  const [selectedCyl, setSelectedCyl] = useState('0.25');
  const [selectedAxis, setSelectedAxis] = useState<number | undefined>(undefined);
  const [customCoating, setCustomCoating] = useState('');
  const [availableCoatings, setAvailableCoatings] = useState(DEFAULT_COATINGS);
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [originalStock, setOriginalStock] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  // SPH power list (includes 0.00 if SPH type, but for Compound it should ideally be 0.25+)
  const sphList = generatePowerList(powerType === 'SPH');
  // CYL power list (always excludes 0.00 as per requirement)
  const cylList = generatePowerList(false);

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
    setDeltas({}); // Reset deltas when filters change
  }, [selectedShop, material, vision, coatings, sign, powerType, selectedCyl, selectedAxis, isDemo]);

  async function fetchStock() {
    setLoading(true);
    let query = supabase
      .from('lens_stock')
      .select('*')
      .eq('shop_id', selectedShop)
      .eq('material', material)
      .eq('vision', vision)
      .eq('sign', sign)
      .eq('power_type', powerType);

    if (coatings.length > 0) {
        query = query.contains('coatings', coatings);
    }

    if (powerType !== 'SPH') {
        query = query.eq('cyl', parseFloat(selectedCyl));
    } else {
        query = query.eq('cyl', 0);
    }

    if (selectedAxis !== undefined) {
        query = query.eq('axis', selectedAxis);
    } else {
        query = query.is('axis', null);
    }

    const { data, error } = await query;
    if (error) console.error("Fetch error:", error);

    const stockMap: Record<string, number> = {};
    if (data) {
      data.forEach((item) => {
        const key = `${item.sph.toFixed(2)}-${item.cyl.toFixed(2)}-${item.axis || ''}`;
        stockMap[key] = Number(item.quantity);
      });
    }
    setOriginalStock({ ...stockMap });
    setLoading(false);
  }

  const handleQuantityChange = (sph: string, cyl: string, axis: number | undefined, delta: number) => {
    const key = `${parseFloat(sph).toFixed(2)}-${parseFloat(cyl).toFixed(2)}-${axis || ''}`;
    const currentDelta = deltas[key] || 0;
    const newDelta = currentDelta + delta;
    setDeltas({ ...deltas, [key]: newDelta });
  };

  const saveStock = async () => {
    if (isDemo) {
      alert('Demo Mode: Stock changes are not saved to the database.');
      return;
    }
    setLoading(true);

    const entries = Object.entries(deltas);
    let updatedCount = 0;

    for (const [key, delta] of entries) {
      if (delta === 0) continue;

      const [sphStr, cylStr, axisStr] = key.split('-');
      const currentQty = originalStock[key] || 0;
      const newQty = Math.max(0, currentQty + delta);

      const update = {
        shop_id: selectedShop,
        material,
        vision,
        sign,
        power_type: powerType,
        sph: parseFloat(sphStr),
        cyl: parseFloat(cylStr),
        axis: axisStr ? parseInt(axisStr) : null,
        coatings,
        quantity: newQty
      };

      const { error } = await supabase.from('lens_stock').upsert(update, {
          onConflict: 'shop_id, material, vision, sign, power_type, sph, cyl, axis, coatings'
      });
      if (error) console.error("Save error:", error);
      else updatedCount++;
    }

    if (updatedCount > 0) {
        alert('Stock updated successfully!');
        await fetchStock();
        setDeltas({});
    } else {
        alert('No changes to save.');
    }
    setLoading(false);
  };

  const toggleCoating = (c: string) => {
    if (coatings.includes(c)) {
      setCoatings(coatings.filter(item => item !== c));
    } else {
      setCoatings([...coatings, c]);
    }
  };

  const addCustomCoating = () => {
    if (customCoating && !availableCoatings.includes(customCoating)) {
      setAvailableCoatings([...availableCoatings, customCoating]);
      setCoatings([...coatings, customCoating]);
      setCustomCoating('');
    }
  };

  const showAxis = (vision === 'KT' || vision === 'Prograssive') && (powerType !== 'SPH');
  const showCylSelector = powerType !== 'SPH';

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Stock Management</h1>
        <button
          onClick={saveStock}
          disabled={loading}
          className="bg-green-600 text-white px-3 py-1.5 rounded-md flex items-center hover:bg-green-700 disabled:opacity-50 text-sm shadow-sm transition-colors"
        >
          <Save className="w-4 h-4 mr-1" /> Save
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm space-y-3 border border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Shop</label>
            <div className="flex gap-1.5">
              {shops.map(shop => (
                <button
                  key={shop.id}
                  onClick={() => setSelectedShop(shop.id)}
                  className={`flex-1 py-1.5 px-2 rounded-md border text-[10px] font-medium transition-all ${selectedShop === shop.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                >
                  {shop.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Material</label>
            <div className="flex gap-1.5">
              {MATERIALS.map(m => (
                <button
                  key={m}
                  onClick={() => setMaterial(m)}
                  className={`flex-1 py-1.5 px-2 rounded-md border text-[10px] font-medium transition-all ${material === m ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Vision</label>
            <select
              value={vision}
              onChange={(e) => {
                  setVision(e.target.value as Vision);
                  setSelectedAxis(undefined);
              }}
              className="block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-1.5 border text-[10px]"
            >
              {VISIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-1">
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Power Type</label>
                <div className="flex flex-wrap gap-1 mt-1">
                    {['SPH', 'CYL', 'Compound', 'Cross Compound'].map((type) => (
                        <button
                            key={type}
                            onClick={() => {
                                setPowerType(type as PowerType);
                                if (type === 'SPH') setSelectedAxis(undefined);
                                if (type !== 'SPH' && selectedCyl === '0.00') setSelectedCyl('0.25');
                            }}
                            className={`px-2 py-1.5 rounded-md border text-[10px] font-medium transition-all ${powerType === type ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100'}`}
                        >
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
            {showCylSelector && (
                <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">CYL Power</label>
                    <select
                        value={selectedCyl}
                        onChange={(e) => setSelectedCyl(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-1.5 border text-[10px]"
                    >
                        {cylList.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
            )}
            {showAxis && (
                <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Axis</label>
                    <select
                        value={selectedAxis || ''}
                        onChange={(e) => setSelectedAxis(e.target.value ? parseInt(e.target.value) : undefined)}
                        className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-1.5 border text-[10px]"
                    >
                        <option value="">Select Axis</option>
                        {(vision === 'KT' ? KT_AXIS : PROGRESSIVE_AXIS).map(a => (
                            <option key={a} value={a}>{a}</option>
                        ))}
                    </select>
                </div>
            )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Coatings</label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {availableCoatings.map(c => (
                <button
                  key={c}
                  onClick={() => toggleCoating(c)}
                  className={`px-2 py-1 rounded-full text-[10px] font-medium border transition-all ${coatings.includes(c) ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'}`}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <input
                type="text"
                value={customCoating}
                onChange={(e) => setCustomCoating(e.target.value)}
                placeholder="Add coating..."
                className="text-[10px] bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 w-24 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
              />
              <button
                onClick={addCustomCoating}
                className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 p-1 rounded-md hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800/80 text-center">
              <tr>
                <th className="px-2 py-1.5 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Description</th>
                <th className="px-1 py-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-16">Stock</th>
                <th className="px-1 py-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-16">Update</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {sphList.map((p) => {
                const name = formatLensName(material, vision, sign, powerType, p, selectedCyl, coatings, selectedAxis);
                const key = `${parseFloat(p).toFixed(2)}-${parseFloat(selectedCyl).toFixed(2)}-${selectedAxis || ''}`;
                const delta = deltas[key] || 0;
                const origQty = originalStock[key] || 0;

                return (
                  <tr key={p} className="hover:bg-indigo-50/50 dark:hover:bg-gray-700/30 transition-colors even:bg-gray-100 dark:even:bg-gray-700/50">
                    <td className="px-2 py-1.5 whitespace-nowrap text-xs font-medium text-gray-700 dark:text-gray-300">{name}</td>
                    <td className="px-1 py-1.5 whitespace-nowrap text-[10px] text-center text-gray-400 dark:text-gray-500">{origQty.toFixed(2)}</td>
                    <td className={`px-1 py-1.5 whitespace-nowrap text-[10px] text-center font-bold ${delta === 0 ? 'text-gray-300 dark:text-gray-600' : 'text-indigo-600 dark:text-indigo-400'}`}>
                      {delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-right">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => handleQuantityChange(p, selectedCyl, selectedAxis, -0.5)}
                          className="p-1 rounded-md bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleQuantityChange(p, selectedCyl, selectedAxis, 0.5)}
                          className="p-1 rounded-md bg-green-50 dark:bg-green-900/20 text-green-500 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
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
    </div>
  );
}
