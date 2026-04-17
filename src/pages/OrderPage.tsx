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
import { Plus } from 'lucide-react';

export default function OrderPage({ isDemo = false }: { isDemo?: boolean }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState('');
  const [material, setMaterial] = useState<Material>('CR');
  const [vision, setVision] = useState<Vision>('single vision');
  const [coatings, setCoatings] = useState<string[]>(['HC']);
  const [sign, setSign] = useState<Sign>('-');
  const [powerType, setPowerType] = useState<PowerType>('SPH');
  const [selectedCyl, setSelectedCyl] = useState('0.00');
  const [selectedAxis, setSelectedAxis] = useState<number | undefined>(undefined);
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

  const placeOrder = async (sph: string, name: string) => {
    if (isDemo) {
      alert(`Demo Mode: Order simulation successful for ${name}`);
      return;
    }
    setLoading(true);
    const { error } = await supabase.from('orders').insert({
      shop_id: selectedShop,
      lens_details: { name, sph, cyl: selectedCyl, axis: selectedAxis, material, vision, coatings, sign, powerType },
      quantity: 1.0
    });

    if (error) {
      alert('Error placing order: ' + error.message);
    } else {
      alert('Order placed successfully for ' + name);
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

  const showAxis = (vision === 'KT' || vision === 'Prograssive') && (powerType !== 'SPH');
  const showCylSelector = powerType !== 'SPH';

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Place Order</h1>

      <div className="bg-white p-6 rounded-lg shadow-md space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Shop</label>
            <select
              value={selectedShop}
              onChange={(e) => setSelectedShop(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
            >
              {shops.map(shop => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Material</label>
            <div className="flex space-x-2 mt-1">
              {MATERIALS.map(m => (
                <button
                  key={m}
                  onClick={() => setMaterial(m)}
                  className={`px-3 py-1 rounded-md border ${material === m ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Vision</label>
            <select
              value={vision}
              onChange={(e) => {
                  setVision(e.target.value as Vision);
                  setSelectedAxis(undefined);
              }}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
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
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
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
                    <button onClick={() => setSign('+')} className={`px-4 py-1 rounded-md border ${sign === '+' ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}>+</button>
                    <button onClick={() => setSign('-')} className={`px-4 py-1 rounded-md border ${sign === '-' ? 'bg-indigo-600 text-white' : 'bg-gray-100'}`}>-</button>
                </div>
            </div>
            {showCylSelector && (
                <div>
                    <label className="block text-sm font-medium text-gray-700">CYL Power</label>
                    <select
                        value={selectedCyl}
                        onChange={(e) => setSelectedCyl(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
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
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border"
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
            {DEFAULT_COATINGS.map(c => (
              <button
                key={c}
                onClick={() => toggleCoating(c)}
                className={`px-3 py-1 rounded-full text-xs border ${coatings.includes(c) ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Lens Description</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Order</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {powerList.map((p) => {
              const name = formatLensName(material, vision, sign, powerType, p, selectedCyl, coatings, selectedAxis);
              return (
                <tr key={p}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => placeOrder(p, name)}
                      disabled={loading}
                      className="p-2 rounded-full bg-indigo-100 text-indigo-600 hover:bg-indigo-200 disabled:opacity-50"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
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
