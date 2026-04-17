import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ShoppingCart, Store } from 'lucide-react';
import { Shop } from '../utils/lensUtils';

export default function Dashboard({ isDemo = false }: { isDemo?: boolean }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (isDemo) {
        setShops([
          { id: '1', name: 'SS Opticals' },
          { id: '2', name: 'Narbada Eye Care' }
        ]);
        setRecentOrders([]);
        setLoading(false);
        return;
      }

      const { data: shopsData } = await supabase.from('shops').select('*');
      const { data: ordersData } = await supabase
        .from('orders')
        .select('*, shops(name)')
        .order('created_at', { ascending: false })
        .limit(5);

      if (shopsData) setShops(shopsData);
      if (ordersData) setRecentOrders(ordersData);
      setLoading(false);
    }
    fetchData();
  }, [isDemo]);

  if (loading) return <div className="p-8">Loading Dashboard...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {shops.map((shop) => (
          <div key={shop.id} className="bg-white p-6 rounded-lg shadow-md border-l-4 border-indigo-500">
            <div className="flex items-center space-x-4">
              <Store className="w-8 h-8 text-indigo-600" />
              <div>
                <h2 className="text-xl font-semibold">{shop.name}</h2>
                <p className="text-gray-500 text-sm">Active Shop</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg font-medium leading-6 text-gray-900 flex items-center">
            <ShoppingCart className="w-5 h-5 mr-2 text-indigo-600" />
            Recent Orders
          </h3>
        </div>
        <ul className="divide-y divide-gray-200">
          {recentOrders.length > 0 ? (
            recentOrders.map((order) => (
              <li key={order.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-indigo-600 truncate">{order.shops?.name}</p>
                    <p className="text-sm text-gray-500">{order.lens_details?.name || 'Lens order'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{order.quantity} Pair</p>
                    <p className="text-xs text-gray-400">{new Date(order.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </li>
            ))
          ) : (
            <li className="px-6 py-4 text-center text-gray-500">No recent orders</li>
          )}
        </ul>
      </div>
    </div>
  );
}
