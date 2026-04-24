import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ShoppingCart, Store, ChevronRight, FileText, Layers } from 'lucide-react';
import { Shop, formatReportQty, sortLensNames } from '../utils/lensUtils';

interface GroupedOrders {
  date: string;
  orders: any[];
}

export default function Dashboard({ isDemo = false }: { isDemo?: boolean }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState<string | 'combined'>('combined');
  const [groupedOrders, setGroupedOrders] = useState<GroupedOrders[]>([]);
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
    if (!isDemo) {
      fetchOrders();
    } else {
      // Mock data for demo
      setGroupedOrders([
        {
          date: new Date().toLocaleDateString('en-GB'),
          orders: [
            { id: '1', lens_details: { name: 'CR White SPH -1.00' }, quantity: 2, shop_id: '1', created_at: new Date().toISOString() },
            { id: '2', lens_details: { name: 'Poly ARC SPH +0.50' }, quantity: 1, shop_id: '2', created_at: new Date().toISOString() }
          ]
        }
      ]);
    }
  }, [selectedShop, isDemo]);

  async function fetchOrders() {
    setLoading(true);
    let query = supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (selectedShop !== 'combined') {
      query = query.eq('shop_id', selectedShop);
    }

    const { data } = await query;
    
    if (data) {
      // Group by date
      const groups: Record<string, any[]> = {};
      data.forEach(order => {
        const date = new Date(order.created_at).toLocaleDateString('en-GB');
        if (!groups[date]) groups[date] = [];
        groups[date].push(order);
      });

      const formattedGroups = Object.entries(groups).map(([date, orders]) => ({
        date,
        orders
      })).sort((a, b) => {
        // Sort by actual date descending
        const dateA = a.date.split('/').reverse().join('-');
        const dateB = b.date.split('/').reverse().join('-');
        return dateB.localeCompare(dateA);
      });

      setGroupedOrders(formattedGroups);
    }
    setLoading(false);
  }

  const generateCombinedReportForDate = async (targetDate?: string) => {
    const dateToUse = targetDate || new Date().toLocaleDateString('en-GB');
    
    // Find orders for this date from our current state if available, or fetch
    let ordersForReport = [];
    const group = groupedOrders.find(g => g.date === dateToUse);
    
    if (group) {
      ordersForReport = group.orders;
    } else {
      // If not in current view, we'd need to fetch, but usually we generate for what's visible
      alert('No orders found for ' + dateToUse);
      return;
    }

    const summary: Record<string, number> = {};
    ordersForReport.forEach(o => {
        let name = o.lens_details.name;
        summary[name] = (summary[name] || 0) + Number(o.quantity);
    });

    const items = Object.entries(summary).sort((a, b) => sortLensNames(a[0], b[0]));
    const MAX_ROWS_PER_COL = 40;
    const col1 = items.slice(0, MAX_ROWS_PER_COL);
    const col2 = items.slice(MAX_ROWS_PER_COL);

    const win = window.open('', '_blank');
    if (win) {
        win.document.write(`
            <html>
                <head>
                    <title>Combined Report - ${dateToUse}</title>
                    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
                    <style>
                        @page { size: A4; margin: 0; }
                        body { font-family: 'Courier New', Courier, monospace; font-size: 11px; margin: 0; padding: 0; background: #f0f0f0; }
                        .controls { background: #333; padding: 10px; display: flex; gap: 10px; justify-content: center; position: sticky; top: 0; z-index: 100; }
                        .btn { background: #4f46e5; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-family: sans-serif; font-size: 14px; }
                        .btn:hover { background: #4338ca; }
                        .page-container { background: white; width: 210mm; min-height: 297mm; margin: 20px auto; padding: 10mm; box-shadow: 0 0 10px rgba(0,0,0,0.1); box-sizing: border-box; }
                        .header { border-bottom: 2px solid black; padding-bottom: 10px; margin-bottom: 20px; text-align: center; font-weight: bold; font-size: 16px; }
                        .columns { display: flex; gap: 10px; }
                        .column { flex: 1; }
                        table { width: 100%; border-collapse: collapse; }
                        td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
                        .qty-col { width: 40px; text-align: center; font-weight: bold; }
                        @media print { .controls { display: none; } .page-container { margin: 0; box-shadow: none; border: none; width: 100%; } body { background: white; } }
                    </style>
                </head>
                <body>
                    <div class="controls">
                        <button class="btn" onclick="window.print()">Print / Save PDF</button>
                        <button class="btn" onclick="downloadJPG()">Download JPG</button>
                    </div>
                    <div id="capture" class="page-container">
                        <div class="header">DATE: ${dateToUse}</div>
                        <div class="columns">
                            <div class="column">
                                <table>
                                    <tbody>
                                        ${col1.map(item => `<tr><td>${item[0]}</td><td class="qty-col">${formatReportQty(item[1])}</td></tr>`).join('')}
                                    </tbody>
                                </table>
                            </div>
                            <div class="column">
                                <table>
                                    <tbody>
                                        ${col2.map(item => `<tr><td>${item[0]}</td><td class="qty-col">${formatReportQty(item[1])}</td></tr>`).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    <script>
                        function downloadJPG() {
                            html2canvas(document.querySelector("#capture"), { scale: 2 }).then(canvas => {
                                const link = document.createElement('a');
                                link.download = 'Report_${dateToUse.replace(/\//g, '-')}.jpg';
                                link.href = canvas.toDataURL('image/jpeg', 0.9);
                                link.click();
                            });
                        }
                    </script>
                </body>
            </html>
        `);
        win.document.close();
    }
  };

  const getShopName = (id: string) => shops.find(s => s.id === id)?.name || 'Unknown Shop';

  if (loading && shops.length === 0) return <div className="p-8 text-center text-sm">Loading Dashboard...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <div className="flex gap-2">
          <button 
            onClick={() => generateCombinedReportForDate()} 
            className="flex items-center text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md transition-colors"
          >
            <FileText className="w-4 h-4 mr-1" /> Today's Report
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => setSelectedShop('combined')}
          className={`p-4 rounded-lg shadow-sm border-l-4 transition-all text-left flex justify-between items-center ${
            selectedShop === 'combined'
              ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-600 ring-1 ring-indigo-600'
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
          }`}
        >
          <div className="flex items-center space-x-3">
            <Layers className={`w-5 h-5 ${selectedShop === 'combined' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500'}`} />
            <span className={`font-semibold text-sm ${selectedShop === 'combined' ? 'text-indigo-900 dark:text-indigo-100' : 'text-gray-700 dark:text-gray-300'}`}>Combined View</span>
          </div>
        </button>

        {shops.map((shop) => (
          <button
            key={shop.id}
            onClick={() => setSelectedShop(shop.id)}
            className={`p-4 rounded-lg shadow-sm border-l-4 transition-all text-left flex justify-between items-center ${
              selectedShop === shop.id
                ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-600 ring-1 ring-indigo-600'
                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Store className={`w-5 h-5 ${selectedShop === shop.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500'}`} />
              <span className={`font-semibold text-sm ${selectedShop === shop.id ? 'text-indigo-900 dark:text-indigo-100' : 'text-gray-700 dark:text-gray-300'}`}>{shop.name}</span>
            </div>
            <ChevronRight className={`w-4 h-4 ${selectedShop === shop.id ? 'text-indigo-400' : 'text-gray-400 dark:text-gray-600'}`} />
          </button>
        ))}
      </div>

      <div className="space-y-8 mt-6">
        {groupedOrders.length > 0 ? (
          groupedOrders.map((group) => (
            <div key={group.date} className="bg-white dark:bg-gray-800 shadow-sm rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center">
                  <ShoppingCart className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400" />
                  Orders - {group.date}
                </h3>
                <button 
                  onClick={() => generateCombinedReportForDate(group.date)}
                  className="text-[10px] bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-2 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors flex items-center"
                >
                  <FileText className="w-3 h-3 mr-1" /> Get Report
                </button>
              </div>
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {group.orders.map((order) => (
                  <li key={order.id} className="px-4 py-3 hover:bg-indigo-50/50 dark:hover:bg-gray-700/50 transition-colors even:bg-gray-100 dark:even:bg-gray-700/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-gray-700 dark:text-gray-300 font-medium">{order.lens_details?.name}</p>
                        {selectedShop === 'combined' && (
                          <p className="text-[10px] text-indigo-500 font-semibold uppercase mt-0.5">{getShopName(order.shop_id)}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{formatReportQty(order.quantity)} Pair</p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">
                          {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <div className="bg-white dark:bg-gray-800 p-10 text-center rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">No orders found for this selection</p>
          </div>
        )}
      </div>
    </div>
  );
}
