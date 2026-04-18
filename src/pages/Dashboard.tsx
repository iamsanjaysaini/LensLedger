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
    const { data: orders } = await supabase.from('orders').select('lens_details, quantity');
    if (!orders) return;

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
        win.document.write(`<html><body onload="window.print()"><pre>${reportLines.join('\n')}</pre></body></html>`);
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
