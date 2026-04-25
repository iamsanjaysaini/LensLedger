import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Shop, formatReportQty, sortLensNames } from '../utils/lensUtils';
import { FileText, ChevronRight, ChevronLeft, Store, ShoppingCart, Tag, Layers } from 'lucide-react';

type ReportView =
  | 'home'
  | 'individual'
  | 'individual_shop'
  | 'individual_orders'
  | 'individual_orders_date'
  | 'individual_sale'
  | 'individual_lensqty'
  | 'combined'
  | 'combined_orders'
  | 'combined_orders_date'
  | 'combined_sale'
  | 'combined_lensqty';

export default function ReportsPage({ isDemo = false }: { isDemo?: boolean }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [view, setView] = useState<ReportView>('home');
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [orderDates, setOrderDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [reportData, setReportData] = useState<{ name: string; qty: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchShops() {
      if (isDemo) {
        setShops([{ id: '1', name: 'SS Opticals' }, { id: '2', name: 'Narbada Eye Care' }]);
        return;
      }
      const { data } = await supabase.from('shops').select('*');
      if (data) setShops(data);
    }
    fetchShops();
  }, [isDemo]);

  async function fetchOrderDates(shopId: string) {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('created_at')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });
    if (data) {
      setOrderDates(Array.from(new Set(data.map(o => o.created_at.split('T')[0]))));
    }
    setLoading(false);
  }

  async function fetchOrdersForDate(shopId: string, date: string) {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('lens_details, quantity')
      .eq('shop_id', shopId)
      .gte('created_at', `${date}T00:00:00`)
      .lte('created_at', `${date}T23:59:59`);
    if (data) {
      const summary: Record<string, number> = {};
      data.forEach(o => { summary[o.lens_details.name] = (summary[o.lens_details.name] || 0) + Number(o.quantity); });
      setReportData(Object.entries(summary).map(([name, qty]) => ({ name, qty })).sort((a, b) => sortLensNames(a.name, b.name)));
    }
    setLoading(false);
  }

  async function fetchSalesForShop(shopId: string) {
    setLoading(true);
    const { data } = await supabase.from('sales').select('lens_details, quantity').eq('shop_id', shopId);
    if (data) {
      const summary: Record<string, number> = {};
      data.forEach(o => { summary[o.lens_details.name] = (summary[o.lens_details.name] || 0) + Number(o.quantity); });
      setReportData(Object.entries(summary).map(([name, qty]) => ({ name, qty })).sort((a, b) => sortLensNames(a.name, b.name)));
    }
    setLoading(false);
  }

  function buildStockName(item: any): string {
    const coating = Array.isArray(item.coatings) ? item.coatings.join(' ') : '';
    const sign = item.sign || '';
    let power = '';
    if (item.power_type === 'SPH') power = Number(item.sph) === 0 ? 'Plano' : `${sign}${parseFloat(item.sph).toFixed(2)} SPH`;
    else if (item.power_type === 'CYL') power = `${sign}${parseFloat(item.cyl).toFixed(2)} CYL`;
    else if (item.power_type === 'Compound') power = `${sign}${parseFloat(item.sph).toFixed(2)}/${sign}${parseFloat(item.cyl).toFixed(2)}`;
    else if (item.power_type === 'Cross Compound') {
      const opp = sign === '+' ? '-' : '+';
      power = `${sign}${parseFloat(item.sph).toFixed(2)}/${opp}${parseFloat(item.cyl).toFixed(2)}`;
    }
    const mat = item.material === 'CR' ? '' : item.material;
    const vis = item.vision === 'single vision' ? '' : item.vision;
    const add = item.addition ? `ADD +${parseFloat(item.addition).toFixed(2)}` : '';
    const axis = item.axis ? `AXIS ${item.axis}` : '';
    return [power, add, axis, coating, mat, vis].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  async function fetchLensQtyForShop(shopId: string) {
    setLoading(true);
    const { data } = await supabase.from('lens_stock').select('*').eq('shop_id', shopId).gt('quantity', 0);
    if (data) {
      const summary: Record<string, number> = {};
      data.forEach(item => {
        const name = buildStockName(item);
        summary[name] = (summary[name] || 0) + Number(item.quantity);
      });
      setReportData(Object.entries(summary).map(([name, qty]) => ({ name, qty })).sort((a, b) => sortLensNames(a.name, b.name)));
    }
    setLoading(false);
  }

  async function fetchCombinedOrderDates() {
    setLoading(true);
    const { data } = await supabase.from('orders').select('created_at').order('created_at', { ascending: false });
    if (data) {
      setOrderDates(Array.from(new Set(data.map(o => o.created_at.split('T')[0]))));
    }
    setLoading(false);
  }

  async function fetchCombinedOrdersForDate(date: string) {
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('lens_details, quantity')
      .gte('created_at', `${date}T00:00:00`)
      .lte('created_at', `${date}T23:59:59`);
    if (data) {
      const summary: Record<string, number> = {};
      data.forEach(o => { summary[o.lens_details.name] = (summary[o.lens_details.name] || 0) + Number(o.quantity); });
      setReportData(Object.entries(summary).map(([name, qty]) => ({ name, qty })).sort((a, b) => sortLensNames(a.name, b.name)));
    }
    setLoading(false);
  }

  async function fetchCombinedSales() {
    setLoading(true);
    const { data } = await supabase.from('sales').select('lens_details, quantity');
    if (data) {
      const summary: Record<string, number> = {};
      data.forEach(o => { summary[o.lens_details.name] = (summary[o.lens_details.name] || 0) + Number(o.quantity); });
      setReportData(Object.entries(summary).map(([name, qty]) => ({ name, qty })).sort((a, b) => sortLensNames(a.name, b.name)));
    }
    setLoading(false);
  }

  async function fetchCombinedLensQty() {
    setLoading(true);
    const { data } = await supabase.from('lens_stock').select('*').gt('quantity', 0);
    if (data) {
      const summary: Record<string, number> = {};
      data.forEach(item => {
        const name = buildStockName(item);
        summary[name] = (summary[name] || 0) + Number(item.quantity);
      });
      setReportData(Object.entries(summary).map(([name, qty]) => ({ name, qty })).sort((a, b) => sortLensNames(a.name, b.name)));
    }
    setLoading(false);
  }

  function openPrintWindow(title: string, items: { name: string; qty: number }[], dateStr?: string) {
    const MAX = 40;
    const col1 = items.slice(0, MAX);
    const col2 = items.slice(MAX);
    const displayDate = dateStr || new Date().toLocaleDateString('en-GB');
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>${title} - ${displayDate}</title>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
          <style>
            @page { size: A4; margin: 0; }
            * { box-sizing: border-box; }
            body { font-family: 'Courier New', Courier, monospace; font-size: 11px; margin: 0; padding: 0; background: white; }
            .controls { padding: 8px 16px; display: flex; gap: 10px; justify-content: center; background: white; border-bottom: 1px solid #eee; }
            .btn { background: #4f46e5; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-family: sans-serif; font-size: 14px; }
            .btn:hover { background: #4338ca; }
            .page-container { background: white; width: 794px; min-height: 1123px; padding: 10mm; margin: 0 auto; }
            .header { border-bottom: 2px solid black; padding-bottom: 10px; margin-bottom: 20px; text-align: center; font-weight: bold; font-size: 16px; }
            .subheader { font-size: 12px; color: #555; margin-top: 4px; }
            .columns { display: flex; gap: 10px; }
            .column { flex: 1; }
            table { width: 100%; border-collapse: collapse; }
            td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
            .qty-col { width: 40px; text-align: center; font-weight: bold; }
            @media print { .controls { display: none; } body { background: white; } }
          </style>
        </head>
        <body>
          <div class="controls">
            <button class="btn" onclick="window.print()">Print / Save PDF</button>
            <button class="btn" onclick="downloadJPG()">Download JPG</button>
          </div>
          <div id="capture" class="page-container">
            <div class="header">
              ${title}
              <div class="subheader">DATE: ${displayDate}</div>
            </div>
            <div class="columns">
              <div class="column"><table><tbody>
                ${col1.map(item => `<tr><td>${item.name}</td><td class="qty-col">${formatReportQty(item.qty)}</td></tr>`).join('')}
              </tbody></table></div>
              <div class="column"><table><tbody>
                ${col2.map(item => `<tr><td>${item.name}</td><td class="qty-col">${formatReportQty(item.qty)}</td></tr>`).join('')}
              </tbody></table></div>
            </div>
          </div>
          <script>
            function downloadJPG() {
              const btn = document.querySelector('button[onclick="downloadJPG()"]');
              if (btn) { btn.disabled = true; btn.innerText = 'Generating...'; }
              html2canvas(document.querySelector("#capture"), { scale: 2 }).then(canvas => {
                const link = document.createElement('a');
                link.download = '${title.replace(/\s+/g, '_')}_${displayDate.replace(/\//g, '-')}.jpg';
                link.href = canvas.toDataURL('image/jpeg', 0.9);
                link.click();
                if (btn) { btn.disabled = false; btn.innerText = 'Download JPG'; }
              });
            }
          </script>
        </body>
      </html>
    `);
    win.document.close();
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function handleBack() {
    setReportData([]);
    const backMap: Partial<Record<ReportView, () => void>> = {
      individual: () => setView('home'),
      combined: () => setView('home'),
      individual_shop: () => { setView('individual'); setSelectedShop(null); },
      individual_orders: () => { setView('individual_shop'); setOrderDates([]); },
      individual_orders_date: () => { setView('individual_orders'); setSelectedDate(null); },
      individual_sale: () => setView('individual_shop'),
      individual_lensqty: () => setView('individual_shop'),
      combined_orders: () => { setView('combined'); setOrderDates([]); },
      combined_orders_date: () => { setView('combined_orders'); setSelectedDate(null); },
      combined_sale: () => setView('combined'),
      combined_lensqty: () => setView('combined'),
    };
    backMap[view]?.();
  }

  const breadcrumbMap: Partial<Record<ReportView, string>> = {
    home: 'Reports', individual: 'Individual',
    individual_shop: selectedShop?.name || 'Shop',
    individual_orders: 'Orders', individual_orders_date: selectedDate ? formatDate(selectedDate) : '',
    individual_sale: 'Sale', individual_lensqty: 'Lens Quantity',
    combined: 'Combined', combined_orders: 'Orders',
    combined_orders_date: selectedDate ? formatDate(selectedDate) : '',
    combined_sale: 'Sale', combined_lensqty: 'Lens Quantity',
  };

  const breadcrumbFlow: ReportView[] = (() => {
    const flows: Record<ReportView, ReportView[]> = {
      home: ['home'],
      individual: ['home', 'individual'],
      individual_shop: ['home', 'individual', 'individual_shop'],
      individual_orders: ['home', 'individual', 'individual_shop', 'individual_orders'],
      individual_orders_date: ['home', 'individual', 'individual_shop', 'individual_orders', 'individual_orders_date'],
      individual_sale: ['home', 'individual', 'individual_shop', 'individual_sale'],
      individual_lensqty: ['home', 'individual', 'individual_shop', 'individual_lensqty'],
      combined: ['home', 'combined'],
      combined_orders: ['home', 'combined', 'combined_orders'],
      combined_orders_date: ['home', 'combined', 'combined_orders', 'combined_orders_date'],
      combined_sale: ['home', 'combined', 'combined_sale'],
      combined_lensqty: ['home', 'combined', 'combined_lensqty'],
    };
    return flows[view] || ['home'];
  })();

  const CardButton = ({ label, desc, icon, iconBg, onClick }: {
    label: string; desc?: string; icon: React.ReactNode; iconBg: string; onClick: () => void;
  }) => (
    <button onClick={onClick} className="p-5 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:border-indigo-400 hover:shadow-md transition-all text-left flex justify-between items-center group">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>{icon}</div>
        <div>
          <p className="font-bold text-sm text-gray-800 dark:text-white">{label}</p>
          {desc && <p className="text-[10px] text-gray-400 mt-0.5">{desc}</p>}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-indigo-500 transition-colors flex-shrink-0 ml-2" />
    </button>
  );

  const ReportTable = ({ items, title, dateStr }: { items: { name: string; qty: number }[]; title: string; dateStr?: string }) => (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300">{title}</h2>
        <button onClick={() => openPrintWindow(title, items, dateStr)} className="flex items-center text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md transition-colors">
          <FileText className="w-3.5 h-3.5 mr-1" /> Print / Download
        </button>
      </div>
      {items.length === 0
        ? <div className="text-center text-sm text-gray-400 py-10">No data found.</div>
        : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800/80">
                <tr>
                  <th className="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest">Lens</th>
                  <th className="px-4 py-2 text-center text-[10px] font-bold text-gray-500 uppercase tracking-widest w-24">Qty (Pairs)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {items.map((item, i) => (
                  <tr key={i} className="even:bg-gray-50 dark:even:bg-gray-700/40 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10">
                    <td className="px-4 py-2 text-xs text-gray-700 dark:text-gray-300 font-medium">{item.name}</td>
                    <td className="px-4 py-2 text-center text-xs font-bold text-indigo-600 dark:text-indigo-400">{formatReportQty(item.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );

  const DateGrid = ({ dates, onSelect, iconColor = 'text-indigo-400' }: { dates: string[]; onSelect: (d: string) => void; iconColor?: string }) => (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300">Select Date</h2>
      {loading
        ? <div className="text-center text-sm text-gray-400 py-10">Loading...</div>
        : dates.length === 0
          ? <div className="text-center text-sm text-gray-400 py-10">No orders found.</div>
          : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {dates.map(date => (
                <button key={date} onClick={() => onSelect(date)}
                  className="p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all text-center">
                  <ShoppingCart className={`w-4 h-4 ${iconColor} mx-auto mb-1`} />
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{formatDate(date)}</span>
                </button>
              ))}
            </div>
          )}
    </div>
  );

  const Loader = () => <div className="text-center text-sm text-gray-400 py-10">Loading...</div>;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-gray-900 dark:text-white">Reports</h1>

      {/* Breadcrumb + Back */}
      <div className="flex items-center gap-1 flex-wrap text-xs text-gray-500 dark:text-gray-400">
        {view !== 'home' && (
          <button onClick={handleBack} className="flex items-center mr-2 text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
            <ChevronLeft className="w-3.5 h-3.5" /> Back
          </button>
        )}
        {breadcrumbFlow.map((v, i) => (
          <span key={v} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3 h-3" />}
            <span className={i === breadcrumbFlow.length - 1 ? 'text-gray-800 dark:text-white font-semibold' : ''}>{breadcrumbMap[v]}</span>
          </span>
        ))}
      </div>

      {/* HOME */}
      {view === 'home' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CardButton label="Individual" desc="Shop-wise reports" icon={<Store className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />} iconBg="bg-indigo-50 dark:bg-indigo-900/30" onClick={() => setView('individual')} />
          <CardButton label="Combined" desc="Both shops combined" icon={<Layers className="w-5 h-5 text-purple-600 dark:text-purple-400" />} iconBg="bg-purple-50 dark:bg-purple-900/30" onClick={() => setView('combined')} />
        </div>
      )}

      {/* INDIVIDUAL: Shop selection */}
      {view === 'individual' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {shops.map(shop => (
            <CardButton key={shop.id} label={shop.name} icon={<Store className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />} iconBg="bg-indigo-50 dark:bg-indigo-900/30"
              onClick={() => { setSelectedShop(shop); setView('individual_shop'); }} />
          ))}
        </div>
      )}

      {/* INDIVIDUAL SHOP */}
      {view === 'individual_shop' && selectedShop && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CardButton label="Orders" icon={<ShoppingCart className="w-5 h-5 text-blue-600 dark:text-blue-400" />} iconBg="bg-blue-50 dark:bg-blue-900/30"
            onClick={() => { fetchOrderDates(selectedShop.id); setView('individual_orders'); }} />
          <CardButton label="Sale" icon={<Tag className="w-5 h-5 text-green-600 dark:text-green-400" />} iconBg="bg-green-50 dark:bg-green-900/30"
            onClick={() => { fetchSalesForShop(selectedShop.id); setView('individual_sale'); }} />
          <CardButton label="Lens Quantity" icon={<Layers className="w-5 h-5 text-purple-600 dark:text-purple-400" />} iconBg="bg-purple-50 dark:bg-purple-900/30"
            onClick={() => { fetchLensQtyForShop(selectedShop.id); setView('individual_lensqty'); }} />
        </div>
      )}

      {/* INDIVIDUAL ORDERS: Dates */}
      {view === 'individual_orders' && (
        <DateGrid dates={orderDates} onSelect={(date) => { setSelectedDate(date); fetchOrdersForDate(selectedShop!.id, date); setView('individual_orders_date'); }} />
      )}

      {/* INDIVIDUAL ORDERS DATE */}
      {view === 'individual_orders_date' && selectedDate && (loading ? <Loader /> : <ReportTable items={reportData} title={`${selectedShop?.name} — Orders`} dateStr={formatDate(selectedDate)} />)}

      {/* INDIVIDUAL SALE */}
      {view === 'individual_sale' && (loading ? <Loader /> : <ReportTable items={reportData} title={`${selectedShop?.name} — Sale Report`} />)}

      {/* INDIVIDUAL LENS QTY */}
      {view === 'individual_lensqty' && (loading ? <Loader /> : <ReportTable items={reportData} title={`${selectedShop?.name} — Lens Stock`} />)}

      {/* COMBINED */}
      {view === 'combined' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CardButton label="Orders" icon={<ShoppingCart className="w-5 h-5 text-blue-600 dark:text-blue-400" />} iconBg="bg-blue-50 dark:bg-blue-900/30"
            onClick={() => { fetchCombinedOrderDates(); setView('combined_orders'); }} />
          <CardButton label="Sale" icon={<Tag className="w-5 h-5 text-green-600 dark:text-green-400" />} iconBg="bg-green-50 dark:bg-green-900/30"
            onClick={() => { fetchCombinedSales(); setView('combined_sale'); }} />
          <CardButton label="Lens Quantity" icon={<Layers className="w-5 h-5 text-purple-600 dark:text-purple-400" />} iconBg="bg-purple-50 dark:bg-purple-900/30"
            onClick={() => { fetchCombinedLensQty(); setView('combined_lensqty'); }} />
        </div>
      )}

      {/* COMBINED ORDERS: Dates */}
      {view === 'combined_orders' && (
        <DateGrid dates={orderDates} iconColor="text-purple-400"
          onSelect={(date) => { setSelectedDate(date); fetchCombinedOrdersForDate(date); setView('combined_orders_date'); }} />
      )}

      {/* COMBINED ORDERS DATE */}
      {view === 'combined_orders_date' && selectedDate && (loading ? <Loader /> : <ReportTable items={reportData} title="Combined Orders (Both Shops)" dateStr={formatDate(selectedDate)} />)}

      {/* COMBINED SALE */}
      {view === 'combined_sale' && (loading ? <Loader /> : <ReportTable items={reportData} title="Combined Sale Report (Both Shops)" />)}

      {/* COMBINED LENS QTY */}
      {view === 'combined_lensqty' && (loading ? <Loader /> : <ReportTable items={reportData} title="Combined Lens Stock (Both Shops)" />)}
    </div>
  );
}
