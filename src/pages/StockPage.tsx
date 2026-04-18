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
  const [selectedCyl, setSelectedCyl] = useState('0.00');
  const [selectedAxis, setSelectedAxis] = useState<number | undefined>(undefined);
  const [customCoating, setCustomCoating] = useState('');
  const [availableCoatings, setAvailableCoatings] = useState(DEFAULT_COATINGS);
  const [stock, setStock] = useState<Record<string, number>>({});
  const [originalStock, setOriginalStock] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const powerList = generatePowerList();

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
    setStock({ ...stockMap });
    setOriginalStock({ ...stockMap });
    setLoading(false);
  }

  const handleQuantityChange = (sph: string, cyl: string, axis: number | undefined, delta: number) => {
    const key = `${parseFloat(sph).toFixed(2)}-${parseFloat(cyl).toFixed(2)}-${axis || ''}`;
    const currentQty = stock[key] || (originalStock[key] || 0);
    const newQty = Math.max(0, currentQty + delta);
    setStock({ ...stock, [key]: newQty });
  };

  const saveStock = async () => {
    if (isDemo) {
      alert('Demo Mode: Stock changes are not saved to the database.');
      return;
    }
    setLoading(true);

    const entries = Object.entries(stock);
    let updatedCount = 0;

    for (const [key, quantity] of entries) {
      if (quantity === originalStock[key]) continue;

      const [sphStr, cylStr, axisStr] = key.split('-');
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
        quantity
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
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Stock Management</h1>
        <button
          onClick={saveStock}
          disabled={loading}
          className="bg-green-600 text-white px-4 py-2 rounded-md flex items-center hover:bg-green-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4 mr-2" /> Save Changes
        </button>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-md space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Shop</label>
            <div className="flex flex-wrap gap-2">
              {shops.map(shop => (
                <button
                  key={shop.id}
                  onClick={() => setSelectedShop(shop.id)}
                  className={`px-4 py-2 rounded-md border text-sm font-medium transition-colors ${selectedShop === shop.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100'}`}
                >
                  {shop.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Material</label>
            <div className="flex space-x-2">
              {MATERIALS.map(m => (
                <button
                  key={m}
                  onClick={() => setMaterial(m)}
                  className={`px-3 py-1 rounded-md border text-sm ${material === m ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 text-gray-700 border-gray-300'}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vision</label>
            <select
              value={vision}
              onChange={(e) => {
                  const newVision = e.target.value as Vision;
                  setVision(newVision);
                  setSelectedAxis(undefined);
              }}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border text-sm"
            >
              {VISIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
                <label className="block text-sm font-medium text-gray-700">Power Type</label>
                <select
                    value={powerType}
                    onChange={(e) => {
                        setPowerType(e.target.value as PowerType);
                        if (e.target.value === 'SPH') setSelectedAxis(undefined);
                    }}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border text-sm"
                >
                    <option value="SPH">SPH</option>
                    <option value="CYL">CYL</option>
                    <option value="Compound">Compound</option>
                    <option value="Cross Compound">Cross Compound</option>
                </select>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Sign</label>
                <div className="flex space-x-2 mt-1">
                    <button onClick={() => setSign('+')} className={`px-4 py-1 rounded-md border text-sm ${sign === '+' ? 'bg-indigo-600 text-white' : 'bg-gray-50'}`}>+</button>
                    <button onClick={() => setSign('-')} className={`px-4 py-1 rounded-md border text-sm ${sign === '-' ? 'bg-indigo-600 text-white' : 'bg-gray-50'}`}>-</button>
                </div>
            </div>
            {showCylSelector && (
                <div>
                    <label className="block text-sm font-medium text-gray-700">CYL Power</label>
                    <select
                        value={selectedCyl}
                        onChange={(e) => setSelectedCyl(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border text-sm"
                    >
                        {powerList.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
            )}
            {showAxis && (
                <div>
                    <label className="block text-sm font-medium text-gray-700">Axis</label>
                    <select
                        value={selectedAxis || ''}
                        onChange={(e) => setSelectedAxis(e.target.value ? parseInt(e.target.value) : undefined)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border text-sm"
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
          <label className="block text-sm font-medium text-gray-700 mb-2">Coatings</label>
          <div className="flex flex-wrap gap-2">
            {availableCoatings.map(c => (
              <button
                key={c}
                onClick={() => toggleCoating(c)}
                className={`px-3 py-1 rounded-full text-xs border ${coatings.includes(c) ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="mt-3 flex space-x-2">
            <input
              type="text"
              value={customCoating}
              onChange={(e) => setCustomCoating(e.target.value)}
              placeholder="Add custom coating..."
              className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border text-sm"
            />
            <button
              onClick={addCustomCoating}
              className="bg-indigo-500 text-white px-3 py-1 rounded-md text-sm hover:bg-indigo-600"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lens Description</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Current Quantity</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity (Pairs)</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {powerList.map((p) => {
              const name = formatLensName(material, vision, sign, powerType, p, selectedCyl, coatings, selectedAxis);
              const key = `${parseFloat(p).toFixed(2)}-${parseFloat(selectedCyl).toFixed(2)}-${selectedAxis || ''}`;
              const qty = stock[key] || originalStock[key] || 0;
              const origQty = originalStock[key] || 0;
              const delta = qty - origQty;

              return (
                <tr key={p}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-medium text-gray-500">{origQty.toFixed(2)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-bold text-indigo-600">{delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => handleQuantityChange(p, selectedCyl, selectedAxis, -0.5)}
                        className="p-1 rounded-full bg-red-100 text-red-600 hover:bg-red-200"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleQuantityChange(p, selectedCyl, selectedAxis, 0.5)}
                        className="p-1 rounded-full bg-green-100 text-green-600 hover:bg-green-200"
                      >
                        <Plus className="w-4 h-4" />
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
  );
}
