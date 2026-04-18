import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ShoppingCart, Store, ChevronRight, FileText } from 'lucide-react';
import { Shop } from '../utils/lensUtils';

export default function Dashboard({ isDemo = false }: { isDemo?: boolean }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState<string | null>(null);
  const [shopOrders, setShopOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchShops() {
      if (isDemo) {
        setShops([
          { id: '1', name: 'SS Opticals' },
          { id: '2', name: 'Narbada Eye Care' }
        ]);
        setLoading(false);
        return;
      }
      const { data: shopsData } = await supabase.from('shops').select('*');
      if (shopsData) setShops(shopsData);
      setLoading(false);
    }
    fetchShops();
  }, [isDemo]);

  useEffect(() => {
    if (selectedShop && !isDemo) {
      fetchOrdersForShop(selectedShop);
    }
  }, [selectedShop, isDemo]);

  async function fetchOrdersForShop(shopId: string) {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });
    if (data) setShopOrders(data);
    setLoading(false);
  }

  const generateCombinedReport = async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data: orders } = await supabase
        .from('orders')
        .select('lens_details, quantity')
        .gte('created_at', today);

    if (!orders || orders.length === 0) {
        alert('No orders found for today.');
        return;
    }

    const summary: Record<string, number> = {};
    orders.forEach(o => {
        const name = o.lens_details.name;
        summary[name] = (summary[name] || 0) + Number(o.quantity);
    });

    const items = Object.entries(summary).sort((a, b) => a[0].localeCompare(b[0]));
    const dateStr = new Date().toLocaleDateString('en-GB');
    const rows = [];
    for (let i = 0; i < items.length; i += 2) {
        rows.push([items[i], items[i+1]]);
    }

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(`
            <html>
                <head>
                    <title>Combined Order - ${dateStr}</title>
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
                            <div class="shop-name">SS Opticals & Narbada - Combined Order</div>
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
                                link.download = 'Combined_Order_${dateStr.replace(/\//g, '-')}.jpg';
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
  };

  if (loading && shops.length === 0) return <div className="p-8 text-center text-sm">Loading Dashboard...</div>;

  return (
    <div className="space-y-6 px-2 md:px-0">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <button onClick={generateCombinedReport} className="flex items-center text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-md">
            <FileText className="w-4 h-4 mr-1" /> Combined Report
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {shops.map((shop) => (
          <button
            key={shop.id}
            onClick={() => setSelectedShop(shop.id)}
            className={`bg-white p-4 rounded-lg shadow-sm border-l-4 transition-all text-left flex justify-between items-center ${selectedShop === shop.id ? 'border-indigo-600 ring-1 ring-indigo-600' : 'border-gray-200'}`}
          >
            <div className="flex items-center space-x-3">
              <Store className="w-5 h-5 text-indigo-600" />
              <span className="font-semibold text-sm">{shop.name}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        ))}
      </div>

      {selectedShop && (
        <div className="bg-white shadow-sm rounded-lg overflow-hidden mt-6">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900 flex items-center">
              <ShoppingCart className="w-4 h-4 mr-2 text-indigo-600" />
              {shops.find(s => s.id === selectedShop)?.name} Orders
            </h3>
          </div>
          <ul className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {shopOrders.length > 0 ? (
              shopOrders.map((order) => (
                <li key={order.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-700 font-medium">{order.lens_details?.name}</p>
                    <div className="text-right">
                      <p className="text-xs font-bold text-indigo-600">{order.quantity} Pair</p>
                      <p className="text-[10px] text-gray-400">{new Date(order.created_at).toLocaleDateString()}</p>
                    </div>
                  </div>
                </li>
              ))
            ) : (
              <li className="px-4 py-6 text-center text-xs text-gray-500">No orders found for this shop</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
