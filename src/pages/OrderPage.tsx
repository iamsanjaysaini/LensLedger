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
import { Plus, Minus, ShoppingCart, FileText } from 'lucide-react';

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
  const [deltas, setDeltas] = useState<Record<string, { qty: number, name: string }>>({});
  const [loading, setLoading] = useState(false);

  const powerList = generatePowerList();

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

  const handleQuantityChange = (sph: string, name: string, delta: number) => {
    const key = `${selectedShop}-${material}-${vision}-${sign}-${powerType}-${sph}-${selectedCyl}-${selectedAxis || ''}-${coatings.join(',')}`;
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
    if (isDemo) {
      alert('Demo Mode: Orders are not saved.');
      return;
    }
    setLoading(true);
    const entries = Object.entries(deltas);
    if (entries.length === 0) {
        alert('Please add items to order.');
        setLoading(false);
        return;
    }

    for (const [_, data] of entries) {
      const { error } = await supabase.from('orders').insert({
        shop_id: selectedShop,
        lens_details: { name: data.name },
        quantity: data.qty
      });
      if (error) console.error(error);
    }

    alert('Orders saved successfully!');
    setDeltas({});
    setLoading(false);
  };

  const generateReport = async () => {
    setLoading(true);
    // Fetch all orders from both shops (normally you'd filter by date)
    const { data: orders } = await supabase.from('orders').select('lens_details, quantity');

    if (!orders || orders.length === 0) {
        alert('No orders found to generate report.');
        setLoading(false);
        return;
    }

    // Consolidate orders by lens name
    const summary: Record<string, number> = {};
    orders.forEach(o => {
        const name = o.lens_details.name;
        summary[name] = (summary[name] || 0) + Number(o.quantity);
    });

    const reportLines = Object.entries(summary)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, qty]) => `${name}  ${qty} pair`);

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(`
            <html>
                <head>
                    <title>Order Report</title>
                    <style>
                        body { font-family: monospace; padding: 40px; }
                        pre { font-size: 16px; line-height: 1.5; }
                    </style>
                </head>
                <body onload="window.print()">
                    <pre>${reportLines.join('\n')}</pre>
                </body>
            </html>
        `);
        win.document.close();
    }
    setLoading(false);
  };

  const showAxis = (vision === 'KT' || vision === 'Prograssive') && (powerType !== 'SPH');
  const showCylSelector = powerType !== 'SPH';

  return (
    <div className="space-y-4 px-2 md:px-0">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">Place Order</h1>
        <div className="flex gap-2">
            <button onClick={generateReport} className="bg-blue-600 text-white px-3 py-1.5 rounded-md flex items-center text-sm hover:bg-blue-700">
                <FileText className="w-4 h-4 mr-1" /> Report
            </button>
            <button onClick={saveOrder} disabled={loading} className="bg-green-600 text-white px-3 py-1.5 rounded-md flex items-center text-sm hover:bg-green-700 disabled:opacity-50">
                <ShoppingCart className="w-4 h-4 mr-1" /> Save
            </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Shop</label>
            <div className="flex gap-2">
              {shops.map(shop => (
                <button
                  key={shop.id}
                  onClick={() => setSelectedShop(shop.id)}
                  className={`flex-1 py-1.5 px-2 rounded-md border text-xs font-medium transition-colors ${selectedShop === shop.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 text-gray-600 border-gray-300'}`}
                >
                  {shop.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Material</label>
            <div className="flex gap-2">
              {MATERIALS.map(m => (
                <button
                  key={m}
                  onClick={() => setMaterial(m)}
                  className={`flex-1 py-1.5 px-2 rounded-md border text-xs ${material === m ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-gray-50 text-gray-600 border-gray-300'}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Vision</label>
            <select value={vision} onChange={(e) => { setVision(e.target.value as Vision); setSelectedAxis(undefined); }} className="block w-full rounded-md border-gray-300 p-1.5 border text-xs">
              {VISIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
                <label className="block text-xs font-medium text-gray-500">Power Type</label>
                <select value={powerType} onChange={(e) => { setPowerType(e.target.value as PowerType); if (e.target.value === 'SPH') setSelectedAxis(undefined); }} className="mt-1 block w-full rounded-md border-gray-300 p-1.5 border text-xs">
                    <option value="SPH">SPH</option>
                    <option value="CYL">CYL</option>
                    <option value="Compound">Compound</option>
                    <option value="Cross Compound">Cross Compound</option>
                </select>
            </div>
            <div>
                <label className="block text-xs font-medium text-gray-500">Sign</label>
                <div className="flex gap-2 mt-1">
                    <button onClick={() => setSign('+')} className={`flex-1 py-1.5 rounded-md border text-xs ${sign === '+' ? 'bg-indigo-600 text-white' : 'bg-gray-50'}`}>+</button>
                    <button onClick={() => setSign('-')} className={`flex-1 py-1.5 rounded-md border text-xs ${sign === '-' ? 'bg-indigo-600 text-white' : 'bg-gray-50'}`}>-</button>
                </div>
            </div>
            {showCylSelector && (
                <div>
                    <label className="block text-xs font-medium text-gray-500">CYL Power</label>
                    <select value={selectedCyl} onChange={(e) => setSelectedCyl(e.target.value)} className="mt-1 block w-full rounded-md border-gray-300 p-1.5 border text-xs">
                        {powerList.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
            )}
            {showAxis && (
                <div>
                    <label className="block text-xs font-medium text-gray-500">Axis</label>
                    <select value={selectedAxis || ''} onChange={(e) => setSelectedAxis(e.target.value ? parseInt(e.target.value) : undefined)} className="mt-1 block w-full rounded-md border-gray-300 p-1.5 border text-xs">
                        <option value="">Select Axis</option>
                        {(vision === 'KT' ? KT_AXIS : PROGRESSIVE_AXIS).map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                </div>
            )}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 text-center">
            <tr>
              <th className="px-3 py-2 text-left text-[10px] font-medium text-gray-500 uppercase">Description</th>
              <th className="px-1 py-2 text-[10px] font-medium text-gray-500 uppercase">Qty</th>
              <th className="px-3 py-2 text-right text-[10px] font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {powerList.map((p) => {
              const name = formatLensName(material, vision, sign, powerType, p, selectedCyl, coatings, selectedAxis);
              const key = `${selectedShop}-${material}-${vision}-${sign}-${powerType}-${p}-${selectedCyl}-${selectedAxis || ''}-${coatings.join(',')}`;
              const qty = deltas[key]?.qty || 0;

              return (
                <tr key={p}>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-700">{name}</td>
                  <td className={`px-1 py-2 whitespace-nowrap text-xs text-center font-bold ${qty > 0 ? 'text-indigo-600' : 'text-gray-300'}`}>
                    {qty.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">
                    <div className="flex justify-end gap-1.5">
                      <button onClick={() => handleQuantityChange(p, name, -0.5)} className="p-1 rounded-md bg-red-50 text-red-500 hover:bg-red-100">
                        <Minus className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleQuantityChange(p, name, 0.5)} className="p-1 rounded-md bg-green-50 text-green-500 hover:bg-green-100">
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
