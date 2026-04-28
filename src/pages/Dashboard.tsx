import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ShoppingCart, Store, ChevronRight, FileText, Bell, ChevronLeft, AlertTriangle, Calendar, RefreshCw } from 'lucide-react';
import { Shop, sortLensNames, MATERIALS, VISIONS, generateLensRows, fetchCustomLensRows, getDefaultAxis, KT_AXIS, PROGRESSIVE_AXIS, Material, Vision, PowerType, Sign } from '../utils/lensUtils';

interface LowStockItem {
  lens_name: string;
  shop_name: string;
  shop_id: string;
  quantity: number;
  material: string;
  vision: string;
  sign: string | null;
  power_type: string;
  coatings: string[];
}

interface CombinedLowStockItem {
  lens_name: string;
  total_quantity: number;
  shops: { shop_name: string; quantity: number }[];
}

type AlertView = 'main' | 'combined' | 'individual';
type IndividualShop = { id: string; name: string } | null;
type MainView = 'dashboard' | 'combined-orders';

// Qty ko readable format mein dikhao (no HTML)
function formatQty(qty: number): string {
  const whole = Math.floor(qty);
  const frac = qty % 1;
  if (frac === 0.5) return whole > 0 ? `${whole}½` : '½';
  return qty % 1 === 0 ? qty.toString() : qty.toFixed(2);
}

export default function Dashboard({ isDemo = false }: { isDemo?: boolean }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Main view toggle
  const [mainView, setMainView] = useState<MainView>('dashboard');

  // Date-wise grouped orders (individual shop)
  const [dateGroups, setDateGroups] = useState<{ date: string; count: number; totalQty: number }[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dateOrders, setDateOrders] = useState<{ name: string; qty: number }[]>([]);
  const [dateOrdersLoading, setDateOrdersLoading] = useState(false);

  // Combined orders date-wise
  const [combinedDateGroups, setCombinedDateGroups] = useState<{ date: string; count: number; totalQty: number }[]>([]);
  const [selectedCombinedDate, setSelectedCombinedDate] = useState<string | null>(null);
  const [combinedDateOrders, setCombinedDateOrders] = useState<{ name: string; qty: number }[]>([]);
  const [combinedDateOrdersLoading, setCombinedDateOrdersLoading] = useState(false);
  const [combinedLoading, setCombinedLoading] = useState(false);

  // Alert states
  const [alertView, setAlertView] = useState<AlertView>('main');
  const [selectedIndividualShop, setSelectedIndividualShop] = useState<IndividualShop>(null);
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
  const [alertLoading, setAlertLoading] = useState(false);

  useEffect(() => {
    async function fetchShops() {
      if (isDemo) {
        setShops([{ id: '1', name: 'SS Opticals' }, { id: '2', name: 'Narbada Eye Care' }]);
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
      setSelectedDate(null);
      setDateOrders([]);
      fetchDateGroups(selectedShop);
    }
  }, [selectedShop, isDemo]);

  async function fetchDateGroups(shopId: string) {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('created_at, quantity')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });
    if (data) {
      const groups: Record<string, { count: number; totalQty: number }> = {};
      data.forEach((o: any) => {
        const date = o.created_at.split('T')[0];
        if (!groups[date]) groups[date] = { count: 0, totalQty: 0 };
        groups[date].count += 1;
        groups[date].totalQty += Number(o.quantity);
      });
      const sorted = Object.entries(groups)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, val]) => ({ date, ...val }));
      setDateGroups(sorted);
    }
    setLoading(false);
  }

  async function fetchOrdersForDate(shopId: string, date: string) {
    setDateOrdersLoading(true);
    setSelectedDate(date);
    const { data } = await supabase
      .from('orders')
      .select('lens_details, quantity')
      .eq('shop_id', shopId)
      .gte('created_at', `${date}T00:00:00`)
      .lte('created_at', `${date}T23:59:59`);
    if (data) {
      const summary: Record<string, number> = {};
      data.forEach((o: any) => {
        const name = o.lens_details?.name || '';
        summary[name] = (summary[name] || 0) + Number(o.quantity);
      });
      const sorted = Object.entries(summary)
        .sort((a, b) => sortLensNames(a[0], b[0]))
        .map(([name, qty]) => ({ name, qty }));
      setDateOrders(sorted);
    }
    setDateOrdersLoading(false);
  }

  // Combined orders — date groups (dono shops)
  async function fetchCombinedDateGroups() {
    setCombinedLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('created_at, quantity')
      .order('created_at', { ascending: false });
    if (data) {
      const groups: Record<string, { count: number; totalQty: number }> = {};
      data.forEach((o: any) => {
        const date = o.created_at.split('T')[0];
        if (!groups[date]) groups[date] = { count: 0, totalQty: 0 };
        groups[date].count += 1;
        groups[date].totalQty += Number(o.quantity);
      });
      const sorted = Object.entries(groups)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, val]) => ({ date, ...val }));
      setCombinedDateGroups(sorted);
    }
    setCombinedLoading(false);
  }

  async function fetchCombinedOrdersForDate(date: string) {
    setCombinedDateOrdersLoading(true);
    setSelectedCombinedDate(date);
    const { data } = await supabase
      .from('orders')
      .select('lens_details, quantity')
      .gte('created_at', `${date}T00:00:00`)
      .lte('created_at', `${date}T23:59:59`);
    if (data) {
      const summary: Record<string, number> = {};
      data.forEach((o: any) => {
        const name = o.lens_details?.name || '';
        summary[name] = (summary[name] || 0) + Number(o.quantity);
      });
      const sorted = Object.entries(summary)
        .sort((a, b) => sortLensNames(a[0], b[0]))
        .map(([name, qty]) => ({ name, qty }));
      setCombinedDateOrders(sorted);
    }
    setCombinedDateOrdersLoading(false);
  }

  const fetchLowStockItems = useCallback(async () => {
    if (isDemo) return;
    setAlertLoading(true);
    try {
      const { data: stockDataAll } = await supabase
        .from('lens_stock')
        .select('*, shops(name)')
        .lt('quantity', 1);
      const { data: ignoreData } = await supabase.from('alert_ignores').select('*');
      const ignoreSet = new Set(
        (ignoreData || []).map((ig: any) =>
          `${ig.shop_id}|${ig.material}|${ig.vision}|${ig.sign || ''}|${ig.power_type}|${(ig.coatings || []).join(',')}`
        )
      );
      const items: LowStockItem[] = [];
      (stockDataAll || []).forEach((item: any) => {
        const coatingsKey = (item.coatings || []).join(',');
        const ignoreKey = `${item.shop_id}|${item.material}|${item.vision}|${item.sign || ''}|${item.power_type}|${coatingsKey}`;
        if (ignoreSet.has(ignoreKey)) return;
        const sph = parseFloat(item.sph).toFixed(2);
        const cyl = parseFloat(item.cyl).toFixed(2);
        const sign = item.sign || '';
        const coatingsStr = (item.coatings || []).join(' ');
        const materialPart = item.material === 'CR' ? '' : item.material;
        const visionPart = item.vision === 'single vision' ? '' : item.vision;
        let powerPart = '';
        if (item.power_type === 'SPH') powerPart = parseFloat(sph) === 0 ? 'Plano' : `${sign}${sph} SPH`;
        else if (item.power_type === 'CYL') powerPart = `${sign}${cyl} CYL`;
        else if (item.power_type === 'Compound') powerPart = `${sign}${sph}/${sign}${cyl}`;
        else if (item.power_type === 'Cross Compound') powerPart = `${sign}${sph}/${sign === '+' ? '-' : '+'}${cyl}`;
        const addPart = item.addition ? `ADD +${parseFloat(item.addition).toFixed(2)}` : '';
        const axisPart = item.axis && item.power_type !== 'SPH' ? `AXIS ${item.axis}` : '';
        const lensName = [powerPart, addPart, axisPart, coatingsStr, materialPart, visionPart]
          .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
        items.push({
          lens_name: lensName, shop_name: item.shops?.name || 'Unknown',
          shop_id: item.shop_id, quantity: Number(item.quantity),
          material: item.material, vision: item.vision, sign: item.sign,
          power_type: item.power_type, coatings: item.coatings || [],
        });
      });
      setLowStockItems(items);
    } catch (e) { console.error(e); }
    finally { setAlertLoading(false); }
  }, [isDemo]);

  useEffect(() => {
    if (alertView !== 'main') fetchLowStockItems();
  }, [alertView, fetchLowStockItems]);

  const combinedLowStock: CombinedLowStockItem[] = (() => {
    const map: Record<string, CombinedLowStockItem> = {};
    lowStockItems.forEach(item => {
      if (!map[item.lens_name]) map[item.lens_name] = { lens_name: item.lens_name, total_quantity: 0, shops: [] };
      map[item.lens_name].total_quantity += item.quantity;
      map[item.lens_name].shops.push({ shop_name: item.shop_name, quantity: item.quantity });
    });
    return Object.values(map).sort((a, b) => sortLensNames(a.lens_name, b.lens_name));
  })();

  const individualShopItems = (shopId: string) =>
    lowStockItems.filter(item => item.shop_id === shopId).sort((a, b) => sortLensNames(a.lens_name, b.lens_name));

  const totalAlerts = lowStockItems.length;

  // ─── SYNQ DATABASE ─────────────────────────────────────────────
  const [synqLoading, setSynqLoading] = useState(false);

  const synqDatabase = async () => {
    if (isDemo) { alert('Demo Mode: Synq not available.'); return; }
    if (!window.confirm('Sabhi shops ke liye sabhi lens lists database mein sync hongi (naye rows quantity 0 se add honge, existing untouched rahenge). Continue?')) return;

    setSynqLoading(true);
    let insertedCount = 0;
    let errorCount = 0;

    try {
      const { data: shopsData } = await supabase.from('shops').select('*');
      if (!shopsData?.length) { alert('Koi shop nahi mili.'); setSynqLoading(false); return; }

      const { data: allCustomRows } = await supabase
        .from('custom_lens_rows')
        .select('*')
        .order('sort_order', { ascending: true });

      if (!allCustomRows?.length) { alert('custom_lens_rows mein koi data nahi.'); setSynqLoading(false); return; }

      for (const shop of shopsData) {
        for (const row of allCustomRows) {
          const sign = row.sign || null;
          const powerType = row.power_type;
          const vision = row.vision;
          const coatings = row.coatings || [];

          const defaultAxis = getDefaultAxis(vision, sign, powerType);
          let axisValues: (number | null)[] = [null];
          if (defaultAxis !== undefined) {
            axisValues = [defaultAxis];
          } else if (powerType !== 'SPH' && (vision === 'KT' || vision === 'Prograssive')) {
            axisValues = vision === 'KT' ? KT_AXIS : PROGRESSIVE_AXIS;
          }

          for (const axisVal of axisValues) {
            const upsertData = {
              shop_id: shop.id,
              material: row.material,
              vision,
              sign,
              power_type: powerType,
              sph: parseFloat(row.sph),
              cyl: parseFloat(row.cyl),
              axis: axisVal,
              addition: row.addition != null ? parseFloat(row.addition) : null,
              coatings,
              quantity: 0
            };

            const { error } = await supabase
              .from('lens_stock')
              .upsert(upsertData, {
                onConflict: 'shop_id, material, vision, sign, power_type, sph, cyl, axis, addition, coatings',
                ignoreDuplicates: true
              });

            if (error) { errorCount++; console.error('Synq error:', error); }
            else insertedCount++;
          }
        }
      }

      alert(`Synq complete!\nProcessed: ${insertedCount} rows${errorCount > 0 ? `\nErrors: ${errorCount}` : ''}`);
    } catch (e) {
      console.error('Synq failed:', e);
      alert('Synq failed. Console check karo.');
    } finally {
      setSynqLoading(false);
    }
  };

  function formatDateDisplay(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' });
  }

  if (loading && shops.length === 0) return <div className="p-8 text-center text-sm">Loading Dashboard...</div>;

  // ─── ALERT: COMBINED LOW STOCK ─────────────────────────────────
  if (alertView === 'combined') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setAlertView('main')} className="p-1.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Combined Low Stock</h1>
        </div>
        {alertLoading ? <div className="text-center text-sm text-gray-500 py-8">Loading...</div>
          : combinedLowStock.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
              <AlertTriangle className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No low stock items! All good.</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800/80">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Lens</th>
                    <th className="px-3 py-2 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24">Total Qty</th>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Shops</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {combinedLowStock.map((item, i) => (
                    <tr key={i} className="hover:bg-orange-50/40 even:bg-gray-50 dark:even:bg-gray-700/30">
                      <td className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300">{item.lens_name}</td>
                      <td className="px-3 py-2 text-center text-xs font-bold text-orange-600">{formatQty(item.total_quantity)}</td>
                      <td className="px-3 py-2 text-[10px] text-gray-500">
                        {item.shops.map((s, j) => (
                          <span key={j} className="mr-2">{s.shop_name}: <span className="font-semibold text-orange-500">{formatQty(s.quantity)}</span></span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    );
  }

  // ─── ALERT: INDIVIDUAL LOW STOCK ───────────────────────────────
  if (alertView === 'individual' && !selectedIndividualShop) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setAlertView('main')} className="p-1.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Individual Low Stock</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {shops.map(shop => {
            const count = individualShopItems(shop.id).length;
            return (
              <button key={shop.id} onClick={() => setSelectedIndividualShop(shop)}
                className="p-4 rounded-lg shadow-sm border-l-4 border-orange-400 bg-white dark:bg-gray-800 text-left flex justify-between items-center hover:shadow-md transition-all">
                <div className="flex items-center gap-3">
                  <Store className="w-5 h-5 text-orange-400" />
                  <div>
                    <p className="font-semibold text-sm text-gray-700 dark:text-gray-300">{shop.name}</p>
                    <p className="text-[10px] mt-0.5">
                      {count > 0 ? <span className="text-orange-500 font-medium">{count} low stock item{count !== 1 ? 's' : ''}</span>
                        : <span className="text-green-500">All stock OK</span>}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (alertView === 'individual' && selectedIndividualShop) {
    const items = individualShopItems(selectedIndividualShop.id);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedIndividualShop(null)} className="p-1.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{selectedIndividualShop.name} — Low Stock</h1>
        </div>
        {alertLoading ? <div className="text-center text-sm text-gray-500 py-8">Loading...</div>
          : items.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
              <AlertTriangle className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No low stock items!</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800/80">
                  <tr>
                    <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Lens</th>
                    <th className="px-3 py-2 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {items.map((item, i) => (
                    <tr key={i} className="hover:bg-orange-50/40 even:bg-gray-50 dark:even:bg-gray-700/30">
                      <td className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300">{item.lens_name}</td>
                      <td className="px-3 py-2 text-center text-xs font-bold text-orange-600">{formatQty(item.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    );
  }

  // ─── COMBINED ORDERS VIEW (Last Combined Order button) ─────────
  if (mainView === 'combined-orders') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => { setMainView('dashboard'); setSelectedCombinedDate(null); setCombinedDateOrders([]); }}
            className="p-1.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Combined Orders — All Shops</h1>
        </div>

        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 flex items-center">
            <Calendar className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">Date-wise Combined Orders</h3>
          </div>

          {combinedLoading ? (
            <div className="py-10 text-center text-sm text-gray-400">Loading...</div>
          ) : combinedDateGroups.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">Koi order nahi mila.</div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {combinedDateGroups.map((group) => (
                <li key={group.date}>
                  <button
                    onClick={() => selectedCombinedDate === group.date ? setSelectedCombinedDate(null) : fetchCombinedOrdersForDate(group.date)}
                    className={`w-full px-4 py-3 flex items-center justify-between text-left transition-colors ${
                      selectedCombinedDate === group.date
                        ? 'bg-indigo-50 dark:bg-indigo-900/20'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
                    }`}>
                    <div className="flex items-center gap-3">
                      <Calendar className={`w-4 h-4 ${selectedCombinedDate === group.date ? 'text-indigo-500' : 'text-gray-400'}`} />
                      <div>
                        <p className={`text-sm font-semibold ${selectedCombinedDate === group.date ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>
                          {formatDateDisplay(group.date)}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {group.count} order{group.count !== 1 ? 's' : ''} · Total: {formatQty(group.totalQty)} pair
                        </p>
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 transition-transform ${selectedCombinedDate === group.date ? 'rotate-90 text-indigo-400' : 'text-gray-400'}`} />
                  </button>

                  {selectedCombinedDate === group.date && (
                    <div className="border-t border-indigo-100 dark:border-indigo-800/30 bg-indigo-50/30 dark:bg-indigo-900/10">
                      {combinedDateOrdersLoading ? (
                        <div className="py-6 text-center text-xs text-gray-400">Loading orders...</div>
                      ) : combinedDateOrders.length === 0 ? (
                        <div className="py-6 text-center text-xs text-gray-400">Koi order nahi mila.</div>
                      ) : (
                        <table className="w-full">
                          <thead className="bg-indigo-50 dark:bg-indigo-900/20">
                            <tr>
                              <th className="px-4 py-2 text-left text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Lens Name</th>
                              <th className="px-4 py-2 text-right text-[10px] font-bold text-indigo-500 uppercase tracking-wider w-24">Qty (Pair)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-indigo-100 dark:divide-indigo-800/20">
                            {combinedDateOrders.map((order, i) => (
                              <tr key={i} className="even:bg-indigo-50/50 dark:even:bg-indigo-900/10">
                                <td className="px-4 py-2 text-xs text-gray-700 dark:text-gray-300 font-medium">{order.name}</td>
                                <td className="px-4 py-2 text-right text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                  {formatQty(order.qty)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // ─── MAIN DASHBOARD ────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <div className="flex gap-2">
          {!isDemo && (
            <button
              onClick={synqDatabase}
              disabled={synqLoading}
              className="flex items-center text-xs bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-md transition-colors">
              <RefreshCw className={"w-3.5 h-3.5 mr-1" + (synqLoading ? " animate-spin" : "")} />
              {synqLoading ? 'Syncing...' : 'Synq Database'}
            </button>
          )}
          <button
            onClick={() => { setMainView('combined-orders'); fetchCombinedDateGroups(); }}
            className="flex items-center text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md transition-colors">
            <FileText className="w-4 h-4 mr-1" /> Last Combined Order
          </button>
        </div>
      </div>

      {/* Alerts */}
      {!isDemo && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-orange-200 dark:border-orange-800/50 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-orange-100 dark:border-orange-800/30 bg-orange-50 dark:bg-orange-900/10 flex items-center">
            <h3 className="text-sm font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-2">
              <Bell className="w-4 h-4" /> Alerts
              {totalAlerts > 0 && <span className="bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{totalAlerts}</span>}
            </h3>
          </div>
          <div className="p-3 grid grid-cols-2 gap-3">
            <button onClick={() => setAlertView('combined')}
              className="p-3 rounded-lg border border-orange-200 dark:border-orange-800/40 bg-orange-50 dark:bg-orange-900/10 hover:bg-orange-100 text-left transition-all group">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-orange-700 dark:text-orange-400">Combined</span>
                <ChevronRight className="w-3.5 h-3.5 text-orange-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <p className="text-[10px] text-orange-500">
                {combinedLowStock.length > 0 ? `${combinedLowStock.length} lens type${combinedLowStock.length !== 1 ? 's' : ''} low` : 'All stocked up'}
              </p>
            </button>
            <button onClick={() => { setAlertView('individual'); setSelectedIndividualShop(null); }}
              className="p-3 rounded-lg border border-orange-200 dark:border-orange-800/40 bg-orange-50 dark:bg-orange-900/10 hover:bg-orange-100 text-left transition-all group">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-orange-700 dark:text-orange-400">Individual</span>
                <ChevronRight className="w-3.5 h-3.5 text-orange-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <p className="text-[10px] text-orange-500">
                {shops.map(s => { const c = individualShopItems(s.id).length; return c > 0 ? `${s.name}: ${c}` : null; }).filter(Boolean).join(' · ') || 'All stocked up'}
              </p>
            </button>
          </div>
        </div>
      )}

      {/* Shop Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {shops.map((shop) => (
          <button key={shop.id} onClick={() => setSelectedShop(selectedShop === shop.id ? null : shop.id)}
            className={`p-4 rounded-lg shadow-sm border-l-4 transition-all text-left flex justify-between items-center ${
              selectedShop === shop.id
                ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-600 ring-1 ring-indigo-600'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300'
            }`}>
            <div className="flex items-center space-x-3">
              <Store className={`w-5 h-5 ${selectedShop === shop.id ? 'text-indigo-600' : 'text-gray-400'}`} />
              <span className={`font-semibold text-sm ${selectedShop === shop.id ? 'text-indigo-900 dark:text-indigo-100' : 'text-gray-700 dark:text-gray-300'}`}>{shop.name}</span>
            </div>
            <ChevronRight className={`w-4 h-4 transition-transform ${selectedShop === shop.id ? 'rotate-90 text-indigo-400' : 'text-gray-400'}`} />
          </button>
        ))}
      </div>

      {/* Date-wise orders for selected shop */}
      {selectedShop && (
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 flex items-center">
            <Calendar className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
              {shops.find(s => s.id === selectedShop)?.name} — Order History
            </h3>
          </div>
          {loading ? (
            <div className="py-10 text-center text-sm text-gray-400">Loading...</div>
          ) : dateGroups.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">Koi order nahi mila.</div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {dateGroups.map((group) => (
                <li key={group.date}>
                  <button
                    onClick={() => selectedDate === group.date ? setSelectedDate(null) : fetchOrdersForDate(selectedShop, group.date)}
                    className={`w-full px-4 py-3 flex items-center justify-between text-left transition-colors ${
                      selectedDate === group.date ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
                    }`}>
                    <div className="flex items-center gap-3">
                      <Calendar className={`w-4 h-4 ${selectedDate === group.date ? 'text-indigo-500' : 'text-gray-400'}`} />
                      <div>
                        <p className={`text-sm font-semibold ${selectedDate === group.date ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-700 dark:text-gray-300'}`}>
                          {formatDateDisplay(group.date)}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {group.count} order{group.count !== 1 ? 's' : ''} · Total: {formatQty(group.totalQty)} pair
                        </p>
                      </div>
                    </div>
                    <ChevronRight className={`w-4 h-4 transition-transform ${selectedDate === group.date ? 'rotate-90 text-indigo-400' : 'text-gray-400'}`} />
                  </button>

                  {selectedDate === group.date && (
                    <div className="border-t border-indigo-100 dark:border-indigo-800/30 bg-indigo-50/30 dark:bg-indigo-900/10">
                      {dateOrdersLoading ? (
                        <div className="py-6 text-center text-xs text-gray-400">Loading orders...</div>
                      ) : dateOrders.length === 0 ? (
                        <div className="py-6 text-center text-xs text-gray-400">Koi order nahi mila.</div>
                      ) : (
                        <table className="w-full">
                          <thead className="bg-indigo-50 dark:bg-indigo-900/20">
                            <tr>
                              <th className="px-4 py-2 text-left text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Lens Name</th>
                              <th className="px-4 py-2 text-right text-[10px] font-bold text-indigo-500 uppercase tracking-wider w-24">Qty (Pair)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-indigo-100 dark:divide-indigo-800/20">
                            {dateOrders.map((order, i) => (
                              <tr key={i} className="even:bg-indigo-50/50 dark:even:bg-indigo-900/10">
                                <td className="px-4 py-2 text-xs text-gray-700 dark:text-gray-300 font-medium">{order.name}</td>
                                <td className="px-4 py-2 text-right text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                  {formatQty(order.qty)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
