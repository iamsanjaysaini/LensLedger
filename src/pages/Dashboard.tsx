import { useEffect, useState, useCallback, Fragment } from 'react';
import { supabase } from '../lib/supabase';
import { showToast } from '../components/Toast';
import { useUnsavedGuard, useUnsavedChanges } from '../components/UnsavedChanges';
import UniversalSearch from '../components/UniversalSearch';
import { ChevronRight, Bell, ChevronLeft, AlertTriangle, Calendar, Plus, Minus, ShoppingCart, Loader2 } from 'lucide-react';
import { Shop, sortLensNames, formatLensName, isPlanoMisplaced } from '../utils/lensUtils';

interface LowStockItem {
  id: string;
  lens_name: string;
  shop_name: string;
  shop_id: string;
  quantity: number;
  material: string;
  vision: string;
  sign: string | null;
  power_type: string;
  coatings: string[];
  alert_qty: number;
}

type AlertView = 'main' | 'individual';

// Low stock lenses ko category (sign + power type + coating + material + vision) ke hisaab se group karo.
function getLowStockGroup(item: LowStockItem): { key: string; heading: string; rank: (number | string)[] } {
  const sign = item.sign || '-';
  const coat = (item.coatings || []).join(' ');
  const materialPart = item.material === 'CR' ? '' : item.material;
  const visionPart = item.vision === 'single vision' ? '' : item.vision;
  const heading = [sign, item.power_type, coat, materialPart, visionPart]
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().toUpperCase();
  const visionRank = item.vision === 'single vision' ? 0 : item.vision === 'KT' ? 1 : 2;
  const materialRank = item.material === 'CR' ? 0 : item.material === 'Poly' ? 1 : 2;
  const signRank = sign === '-' ? 0 : 1;
  const coatKey = (coat.toUpperCase() === 'HC' ? '0' : '1') + coat.toUpperCase();
  const typeRank = item.power_type === 'SPH' ? 0 : item.power_type === 'CYL' ? 1 : item.power_type === 'Compound' ? 2 : 3;
  return { key: heading, heading, rank: [visionRank, materialRank, signRank, coatKey, typeRank] };
}

function groupLowStock(items: LowStockItem[]) {
  const map = new Map<string, { heading: string; rank: (number | string)[]; items: LowStockItem[] }>();
  items.forEach(it => {
    const g = getLowStockGroup(it);
    if (!map.has(g.key)) map.set(g.key, { heading: g.heading, rank: g.rank, items: [] });
    map.get(g.key)!.items.push(it);
  });
  const cmp = (a: (number | string)[], b: (number | string)[]) => {
    for (let i = 0; i < a.length; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; }
    return 0;
  };
  return Array.from(map.values())
    .sort((a, b) => cmp(a.rank, b.rank) || a.heading.localeCompare(b.heading))
    .map(g => ({ ...g, items: [...g.items].sort((a, b) => sortLensNames(a.lens_name, b.lens_name)) }));
}

function formatQty(qty: number): string {
  const whole = Math.floor(qty);
  const frac = qty % 1;
  if (frac === 0.5) return whole > 0 ? `${whole}½` : '½';
  return qty % 1 === 0 ? qty.toString() : qty.toFixed(2);
}

export default function Dashboard({ isDemo = false }: { isDemo?: boolean }) {
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);

  const [dateGroups, setDateGroups] = useState<{ date: string; count: number; totalQty: number }[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dateOrders, setDateOrders] = useState<{ name: string; qty: number }[]>([]);
  const [dateOrdersLoading, setDateOrdersLoading] = useState(false);

  const [alertView, setAlertView] = useState<AlertView>('main');
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
  const [alertLoading, setAlertLoading] = useState(false);
  const [orderQtys, setOrderQtys] = useState<Record<string, number>>({});
  const [orderSaving, setOrderSaving] = useState(false);


  useEffect(() => {
    async function fetchShops() {
      if (isDemo) {
        const demoShop = { id: '1', name: 'Narbada Eye Care' };
        setShop(demoShop);
        setLoading(false);
        return;
      }
      const { data: shopsData } = await supabase.from('shops').select('*');
      if (shopsData && shopsData.length > 0) {
        const narbada = shopsData.find(s => s.name.toLowerCase().includes('narbada')) || shopsData[0];
        setShop(narbada);
      }
      setLoading(false);
    }
    fetchShops();
  }, [isDemo]);

  useEffect(() => {
    if (shop && !isDemo) {
      setSelectedDate(null);
      setDateOrders([]);
      fetchDateGroups(shop.id);
    }
  }, [shop, isDemo]);

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

  const fetchLowStockItems = useCallback(async () => {
    if (isDemo) {
      setLowStockItems([
        {
          id: 'demo-1',
          lens_name: 'Plano HC',
          shop_name: 'Narbada Eye Care',
          shop_id: '1',
          quantity: 0.00,
          material: 'CR',
          vision: 'single vision',
          sign: null,
          power_type: 'SPH',
          coatings: ['HC'],
          alert_qty: 1.50
        },
        {
          id: 'demo-2',
          lens_name: '-0.50 SPH HC',
          shop_name: 'Narbada Eye Care',
          shop_id: '1',
          quantity: 1.00,
          material: 'CR',
          vision: 'single vision',
          sign: '-',
          power_type: 'SPH',
          coatings: ['HC'],
          alert_qty: 2.00
        }
      ]);
      setAlertLoading(false);
      return;
    }
    setAlertLoading(true);
    try {
      const { data: stockDataAll } = await supabase
        .from('lens_stock')
        .select('*, shops(name)');
      const { data: ignoreData } = await supabase.from('alert_ignores').select('*');
      const ignoreSet = new Set(
        (ignoreData || []).map((ig: any) =>
          `${ig.shop_id}|${ig.material}|${ig.vision}|${ig.sign || ''}|${ig.power_type}|${(ig.coatings || []).join(',')}`
        )
      );
      const items: LowStockItem[] = [];
      (stockDataAll || []).forEach((item: any) => {
        if (isPlanoMisplaced(item.vision, item.sign, item.power_type, Number(item.sph))) {
          return;
        }
        const coatingsKey = (item.coatings || []).join(',');
        const ignoreKey = `${item.shop_id}|${item.material}|${item.vision}|${item.sign || ''}|${item.power_type}|${coatingsKey}`;
        if (ignoreSet.has(ignoreKey)) return;

        const alertStatus = item.alert_status || 'ON';
        const alertQty = item.alert_qty !== null && item.alert_qty !== undefined ? Number(item.alert_qty) : 0.00;
        const qty = Number(item.quantity);

        if (alertStatus !== 'ON') return;
        if (qty >= alertQty) return;

        const sph = parseFloat(item.sph).toFixed(2);
        const cyl = parseFloat(item.cyl).toFixed(2);
        // Orders page wale same naam-format se naam banao, taaki order list me naam match kare
        const lensName = formatLensName(
          item.material, item.vision, item.sign || null, item.power_type,
          sph, cyl, item.coatings || [],
          item.axis ? Number(item.axis) : undefined,
          item.addition ? String(item.addition) : undefined
        );
        items.push({
          id: item.id, lens_name: lensName, shop_name: item.shops?.name || 'Unknown',
          shop_id: item.shop_id, quantity: Number(item.quantity),
          material: item.material, vision: item.vision, sign: item.sign,
          power_type: item.power_type, coatings: item.coatings || [],
          alert_qty: alertQty,
        });
      });
      setLowStockItems(items);
    } catch (e) { console.error(e); }
    finally { setAlertLoading(false); }
  }, [isDemo]);

  useEffect(() => {
    fetchLowStockItems();
  }, [fetchLowStockItems]);

  const totalAlerts = lowStockItems.length;

  // Add to Order: qty badhao / ghatao (0.5 pair step, jaise Orders page me)
  function changeOrderQty(id: string, delta: number) {
    setOrderQtys(prev => {
      const next = Math.max(0, (prev[id] || 0) + delta);
      const copy = { ...prev };
      if (next === 0) delete copy[id]; else copy[id] = next;
      return copy;
    });
  }

  function setOrderQtyValue(id: string, value: string) {
    const n = parseFloat(value);
    setOrderQtys(prev => {
      const copy = { ...prev };
      if (!isFinite(n) || n <= 0) delete copy[id]; else copy[id] = n;
      return copy;
    });
  }

  const orderItemsCount = Object.keys(orderQtys).length;

  // Orders page jaisa hi: `orders` table me insert hota hai, to Orders page ki list me hi dikhega
  async function addToOrder(): Promise<boolean> {
    const items = lowStockItems.filter(i => (orderQtys[i.id] || 0) > 0);
    if (!items.length) { showToast('Pehle kisi lens ki qty add karo.', 'info'); return false; }
    if (isDemo) { showToast('Demo Mode: Orders are not saved.', 'info'); return false; }

    setOrderSaving(true);
    const failed: string[] = [];
    const doneIds: string[] = [];
    for (const item of items) {
      const { error } = await supabase.from('orders').insert({
        shop_id: item.shop_id,
        lens_details: { name: item.lens_name },
        quantity: orderQtys[item.id],
      });
      if (error) failed.push(`${item.lens_name}: ${error.message}`);
      else doneIds.push(item.id);
    }
    setOrderSaving(false);

    if (doneIds.length) {
      setOrderQtys(prev => {
        const copy = { ...prev };
        doneIds.forEach(id => delete copy[id]);
        return copy;
      });
      showToast(`Order list me add ho gaye! (${doneIds.length} items)`, 'success');
      if (shop) await fetchDateGroups(shop.id);
    }
    if (failed.length) alert('Ye add nahi hue:\n' + failed.join('\n'));
    return failed.length === 0;
  }

  // Unsaved changes: Low Stock page par jo qty chuni hai par "Add to Order" nahi dabaya
  const { confirmLeave } = useUnsavedChanges();
  useUnsavedGuard(orderItemsCount > 0, () => addToOrder(), () => setOrderQtys({}));

  function formatDateDisplay(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', weekday: 'short' });
  }

  if (loading && !shop) return <div className="p-8 text-center text-sm">Loading Dashboard...</div>;

  if (alertView === 'individual') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => confirmLeave(() => setAlertView('main'))} className="p-1.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{shop?.name || 'Narbada Eye Care'} — Low Stock</h1>
        </div>
        {alertLoading ? <div className="text-center text-sm text-gray-500 py-8">Loading...</div>
          : lowStockItems.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
              <AlertTriangle className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No low stock items!</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-800/80">
                      <tr>
                        <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Lens</th>
                        <th className="px-3 py-2 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24">Current QTY</th>
                        <th className="px-3 py-2 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24">Alert QTY</th>
                        <th className="px-3 py-2 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider w-44">Add to Order</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {groupLowStock(lowStockItems).map((group) => (
                        <Fragment key={group.heading}>
                        <tr>
                          <td colSpan={4} className="px-3 py-1.5 bg-orange-50 dark:bg-orange-900/20 text-xs font-bold text-orange-800 dark:text-orange-300 tracking-wide border-t border-orange-100 dark:border-orange-800/40">
                            {group.heading} <span className="font-medium text-[10px] text-orange-600 dark:text-orange-400">({group.items.length})</span>
                          </td>
                        </tr>
                        {group.items.map((item) => {
                        const q = orderQtys[item.id] || 0;
                        return (
                          <tr key={item.id} className="hover:bg-orange-50/40">
                            <td className="px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-300">{item.lens_name}</td>
                            <td className="px-3 py-2 text-center text-xs font-bold text-orange-600">{formatQty(item.quantity)}</td>
                            <td className="px-3 py-2 text-center text-xs font-semibold text-gray-600 dark:text-gray-400">{formatQty(item.alert_qty)}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center justify-center gap-1.5">
                                <button onClick={() => changeOrderQty(item.id, -0.5)} aria-label="Qty kam karo"
                                  className="p-1.5 rounded-md bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 hover:bg-red-100 transition-colors">
                                  <Minus className="w-4 h-4" />
                                </button>
                                <input
                                  type="number" step="0.5" min="0"
                                  value={q === 0 ? '' : q}
                                  placeholder="0"
                                  onChange={(e) => setOrderQtyValue(item.id, e.target.value)}
                                  className="w-14 text-xs text-center font-bold bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-md px-1 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-gray-800 dark:text-gray-100"
                                />
                                <button onClick={() => changeOrderQty(item.id, 0.5)} aria-label="Qty badhao"
                                  className="p-1.5 rounded-md bg-green-50 dark:bg-green-900/20 text-green-500 dark:text-green-400 hover:bg-green-100 transition-colors">
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                        })}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                {orderItemsCount > 0 && (
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">{orderItemsCount} lens select kiye</span>
                )}
                <button
                  onClick={addToOrder}
                  disabled={orderSaving || orderItemsCount === 0}
                  className="flex items-center gap-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-md transition-colors shadow-sm">
                  {orderSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
                  Add to Order
                </button>
              </div>
            </div>
          )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
      </div>

      {/* Universal lens search */}
      <UniversalSearch shopId={shop?.id || null} isDemo={isDemo} />

      {/* Alerts */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-orange-200 dark:border-orange-800/50 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-orange-100 dark:border-orange-800/30 bg-orange-50 dark:bg-orange-900/10 flex items-center">
          <h3 className="text-sm font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-2">
            <Bell className="w-4 h-4" /> Alerts
            {totalAlerts > 0 && <span className="bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{totalAlerts}</span>}
          </h3>
        </div>
        <div className="p-3 grid grid-cols-1 gap-3">
          <button onClick={() => setAlertView('individual')}
            className="p-3 rounded-lg border border-orange-200 dark:border-orange-800/40 bg-orange-50 dark:bg-orange-900/10 hover:bg-orange-100 text-left transition-all group">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-orange-700 dark:text-orange-400">{shop?.name || 'Narbada Eye Care'} Low Stock</span>
              <ChevronRight className="w-3.5 h-3.5 text-orange-400 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <p className="text-[10px] text-orange-500">
              {lowStockItems.length > 0 ? `${lowStockItems.length} lens type${lowStockItems.length !== 1 ? 's' : ''} low` : 'All stocked up'}
            </p>
          </button>
        </div>
      </div>

      {/* Date-wise orders for Narbada Eye Care */}
      {shop && (
        <div className="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 flex items-center">
            <Calendar className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">
              {shop.name} — Order History
            </h3>
          </div>
          {loading ? (
            <div className="py-10 text-center text-sm text-gray-400">Loading...</div>
          ) : dateGroups.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">Koi order nahi mila.</div>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {dateGroups.map((group) => {
                return (
                  <li key={group.date}>
                    <button
                      onClick={() => {
                        if (selectedDate === group.date) { setSelectedDate(null); }
                        else { fetchOrdersForDate(shop.id, group.date); }
                      }}
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
                          <>
                            <table className="w-full">
                              <thead className="bg-indigo-50 dark:bg-indigo-900/20">
                                <tr>
                                  <th className="px-4 py-2 text-left text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Lens Name</th>
                                  <th className="px-4 py-2 text-right text-[10px] font-bold text-indigo-500 uppercase tracking-wider w-28">Qty (Pair)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-indigo-100 dark:divide-indigo-800/20">
                                {dateOrders.map((order, i) => (
                                  <tr key={i} className="even:bg-indigo-50/50 dark:even:bg-indigo-900/10">
                                    <td className="px-4 py-2 text-xs text-gray-700 dark:text-gray-300 font-medium">{order.name}</td>
                                    <td className="px-4 py-2 text-right">
                                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                        {formatQty(order.qty)}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
