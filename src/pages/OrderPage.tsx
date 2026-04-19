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
  const [customCoating, setCustomCoating] = useState('');
  const [availableCoatings, setAvailableCoatings] = useState(DEFAULT_COATINGS);
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

  const generateOrderReport = async () => {
    setLoading(true);
    // Fetch all orders for the current selected shop (as per user context usually shops order separately)
    // Or for all shops? The user said "combined date wise order output" in dashboard,
    // but here in order page it's usually for the current selection or recent orders.
    // Let's stick to consolidated view for the selected shop for today.

    const today = new Date().toISOString().split('T')[0];
    const { data: orders } = await supabase
        .from('orders')
        .select('lens_details, quantity')
        .eq('shop_id', selectedShop)
        .gte('created_at', today);

    if (!orders || orders.length === 0) {
        alert('No orders found for today to generate report.');
        setLoading(false);
        return;
    }

    // Consolidate orders by lens name
    const summary: Record<string, number> = {};
    orders.forEach(o => {
        const name = o.lens_details.name;
        summary[name] = (summary[name] || 0) + Number(o.quantity);
    });

    const items = Object.entries(summary).sort((a, b) => a[0].localeCompare(b[0]));
    const dateStr = new Date().toLocaleDateString('en-GB'); // DD/MM/YYYY
    const shopName = shops.find(s => s.id === selectedShop)?.name || '';

    // Split items into 2 columns (4 layout columns: Power | Qty | Power | Qty)
    const rows = [];
    for (let i = 0; i < items.length; i += 2) {
        rows.push([items[i], items[i+1]]);
    }

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(`
            <html>
                <head>
                    <title>Order - ${shopName}</title>
                    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
                    <style>
                        @page { size: A4; margin: 1cm; }
                        body { font-family: 'Courier New', Courier, monospace; font-size: 12px; margin: 0; padding: 0; background: #f0f0f0; }
                        .controls { background: #333; padding: 10px; display: flex; gap: 10px; justify-content: center; position: sticky; top: 0; z-index: 100; }
                        .btn { background: #4f46e5; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-family: sans-serif; font-size: 14px; }
                        .btn:hover { background: #4338ca; }
                        .page-container { background: white; width: 210mm; min-height: 297mm; margin: 20px auto; padding: 20mm; box-shadow: 0 0 10px rgba(0,0,0,0.1); box-sizing: border-box; }
                        .header { display: flex; justify-content: space-between; border-bottom: 2px solid black; padding-bottom: 10px; margin-bottom: 20px; }
                        .shop-name { font-weight: bold; font-size: 16px; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
                        th { background: #f0f0f0; font-size: 10px; text-transform: uppercase; }
                        .qty-col { width: 60px; text-align: center; font-weight: bold; }
                        @media print { .controls { display: none; } .page-container { margin: 0; box-shadow: none; border: none; } body { background: white; } }
                    </style>
                </head>
                <body>
                    <div class="controls">
                        <button class="btn" onclick="window.print()">Print / Save PDF</button>
                        <button class="btn" onclick="downloadJPG()">Download JPG</button>
                    </div>
                    <div id="capture" class="page-container">
                        <div class="header">
                            <div class="shop-name">${shopName} - Order</div>
                            <div>Date: ${dateStr}</div>
                        </div>
                        <table>
                            <thead>
                                <tr>
                                    <th>Lens Power / Details</th>
                                    <th class="qty-col">Qty</th>
                                    <th>Lens Power / Details</th>
                                    <th class="qty-col">Qty</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows.map(row => `
                                    <tr>
                                        <td>${row[0][0]}</td>
                                        <td class="qty-col">${row[0][1]}</td>
                                        <td>${row[1] ? row[1][0] : ''}</td>
                                        <td class="qty-col">${row[1] ? row[1][1] : ''}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                    <script>
                        function downloadJPG() {
                            const btn = event.target;
                            btn.disabled = true;
                            btn.innerText = 'Generating...';
                            html2canvas(document.querySelector("#capture"), { scale: 2 }).then(canvas => {
                                const link = document.createElement('a');
                                link.download = 'Order_${shopName.replace(/\s+/g, '_')}_${dateStr.replace(/\//g, '-')}.jpg';
                                link.href = canvas.toDataURL('image/jpeg', 0.9);
                                link.click();
                                btn.disabled = false;
                                btn.innerText = 'Download JPG';
                            });
                        }
                    </script>
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

      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm space-y-4 border border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Shop</label>
            <div className="flex gap-2">
              {shops.map(shop => (
                <button
                  key={shop.id}
                  onClick={() => setSelectedShop(shop.id)}
                  className={`flex-1 py-2 px-2 rounded-md border text-xs font-medium transition-all ${selectedShop === shop.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                >
                  {shop.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Material</label>
            <div className="flex gap-2">
              {MATERIALS.map(m => (
                <button
                  key={m}
                  onClick={() => setMaterial(m)}
                  className={`flex-1 py-2 px-2 rounded-md border text-xs font-medium transition-all ${material === m ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Vision</label>
            <select value={vision} onChange={(e) => { setVision(e.target.value as Vision); setSelectedAxis(undefined); }} className="block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border text-xs">
              {VISIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Power Type</label>
                <select value={powerType} onChange={(e) => { setPowerType(e.target.value as PowerType); if (e.target.value === 'SPH') setSelectedAxis(undefined); }} className="mt-1.5 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border text-xs">
                    <option value="SPH">SPH</option>
                    <option value="CYL">CYL</option>
                    <option value="Compound">Compound</option>
                    <option value="Cross Compound">Cross Compound</option>
                </select>
            </div>
            <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sign</label>
                <div className="flex gap-2 mt-1.5">
                    <button onClick={() => setSign('+')} className={`flex-1 py-2 rounded-md border text-xs font-medium transition-all ${sign === '+' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700'}`}>+</button>
                    <button onClick={() => setSign('-')} className={`flex-1 py-2 rounded-md border text-xs font-medium transition-all ${sign === '-' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700'}`}>-</button>
                </div>
            </div>
            {showCylSelector && (
                <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">CYL Power</label>
                    <select value={selectedCyl} onChange={(e) => setSelectedCyl(e.target.value)} className="mt-1.5 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border text-xs">
                        {powerList.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
            )}
            {showAxis && (
                <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Axis</label>
                    <select value={selectedAxis || ''} onChange={(e) => setSelectedAxis(e.target.value ? parseInt(e.target.value) : undefined)} className="mt-1.5 block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-2 border text-xs">
                        <option value="">Select Axis</option>
                        {(vision === 'KT' ? KT_AXIS : PROGRESSIVE_AXIS).map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                </div>
            )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">Coatings</label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {availableCoatings.map(c => (
                <button
                  key={c}
                  onClick={() => toggleCoating(c)}
                  className={`px-3 py-1 rounded-full text-[10px] font-medium border transition-all ${coatings.includes(c) ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'}`}
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
                className="text-[10px] bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-700 rounded-md px-2.5 py-1.5 w-28 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
              />
              <button
                onClick={addCustomCoating}
                className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 p-1.5 rounded-md hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800/50 text-center">
              <tr>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Description</th>
                <th className="px-2 py-3 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Qty</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {powerList.map((p) => {
                const name = formatLensName(material, vision, sign, powerType, p, selectedCyl, coatings, selectedAxis);
                const key = `${selectedShop}-${material}-${vision}-${sign}-${powerType}-${p}-${selectedCyl}-${selectedAxis || ''}-${coatings.join(',')}`;
                const qty = deltas[key]?.qty || 0;

                return (
                  <tr key={p} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-xs font-medium text-gray-700 dark:text-gray-300">{name}</td>
                    <td className={`px-2 py-3 whitespace-nowrap text-xs text-center font-bold ${qty > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-300 dark:text-gray-600'}`}>
                      {qty.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleQuantityChange(p, name, -0.5)} className="p-1.5 rounded-md bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">
                          <Minus className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleQuantityChange(p, name, 0.5)} className="p-1.5 rounded-md bg-green-50 dark:bg-green-900/20 text-green-500 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors">
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
    </div>
  );
}
