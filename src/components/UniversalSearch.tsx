import { useEffect, useRef, useState } from 'react';
import { Search, X, Loader2, Package, Tag, ShoppingCart } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatLensName } from '../utils/lensUtils';

interface StockResult { id: string; name: string; quantity: number; }
interface SaleResult { id: string; name: string; quantity: number; created_at: string; }
interface OrderResult { id: string; name: string; quantity: number; created_at: string; stock_updated: boolean; }

type Token = { kind: 'num'; sign: string; text: string } | { kind: 'text'; text: string };

const PAGE = 50;
const STOCK_CACHE_MS = 60_000;

function formatQty(qty: number): string {
  const whole = Math.floor(qty);
  const frac = qty % 1;
  if (frac === 0.5) return whole > 0 ? `${whole}½` : '½';
  return qty % 1 === 0 ? qty.toString() : qty.toFixed(2);
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// "-0.25 bluecut" -> [ {num, sign '-', '0.25'}, {text 'bluecut'} ]
function parseTokens(q: string): Token[] {
  return q.toLowerCase().split(/\s+/).filter(Boolean).map((t): Token => {
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) {
      const sign = t[0] === '+' || t[0] === '-' ? t[0] : '';
      return { kind: 'num', sign, text: Math.abs(parseFloat(t)).toFixed(2) };
    }
    return { kind: 'text', text: t };
  });
}

// Power ko poora number maanke match karta hai: "0.25" par "-10.25" match nahi hoga.
function nameMatches(name: string, tokens: Token[]): boolean {
  const n = name.toLowerCase();
  return tokens.every(tk => {
    if (tk.kind === 'text') return n.includes(tk.text);
    const signPart = tk.sign ? `\\${tk.sign}` : '';
    const re = new RegExp(`(^|[^0-9.])${signPart}${tk.text.replace('.', '\\.')}(?![0-9])`);
    if (re.test(n)) return true;
    return tk.text === '0.00' && !tk.sign && n.includes('plano');
  });
}

const cleanForLike = (s: string) => s.replace(/[%_,()*\\]/g, '');

// Database se pehle moti chhanni (sirf matching naam aaye), phir upar wala exact check.
function applyCoarseFilters(query: any, tokens: Token[]) {
  let q = query;
  for (const tk of tokens) {
    if (tk.kind === 'num') {
      if (tk.text === '0.00' && !tk.sign) continue; // Plano ka naam "0.00" nahi hota
      q = q.ilike('lens_details->>name', `%${tk.sign}${tk.text}%`);
    } else {
      const t = cleanForLike(tk.text);
      if (t) q = q.ilike('lens_details->>name', `%${t}%`);
    }
  }
  return q;
}

async function fetchAllStock(shopId: string): Promise<StockResult[]> {
  const rows: any[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase
      .from('lens_stock')
      .select('id, material, vision, sign, power_type, sph, cyl, axis, addition, coatings, quantity')
      .eq('shop_id', shopId)
      .order('id')
      .range(from, from + size - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < size) break;
  }
  return rows.map(r => ({
    id: r.id,
    quantity: Number(r.quantity) || 0,
    name: formatLensName(
      r.material, r.vision, r.sign || null, r.power_type,
      Number(r.sph).toFixed(2), Number(r.cyl).toFixed(2), r.coatings || [],
      r.axis ? Number(r.axis) : undefined,
      r.addition ? String(r.addition) : undefined
    ),
  }));
}

const DEMO_STOCK: StockResult[] = [
  { id: 'd1', name: '-0.25 SPH HC', quantity: 4 },
  { id: 'd2', name: '-0.25 SPH Bluecut', quantity: 2 },
  { id: 'd3', name: '-0.25 CYL HC', quantity: 0 },
];
const DEMO_SALES: SaleResult[] = [
  { id: 's1', name: '-0.25 SPH HC', quantity: 1, created_at: new Date().toISOString() },
];
const DEMO_ORDERS: OrderResult[] = [
  { id: 'o1', name: '-0.25 SPH Bluecut', quantity: 2, created_at: new Date().toISOString(), stock_updated: false },
];

export default function UniversalSearch({ shopId, isDemo = false }: { shopId: string | null; isDemo?: boolean }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stock, setStock] = useState<StockResult[]>([]);
  const [sales, setSales] = useState<SaleResult[]>([]);
  const [orders, setOrders] = useState<OrderResult[]>([]);
  const [showStock, setShowStock] = useState(PAGE);
  const [showSales, setShowSales] = useState(PAGE);
  const [showOrders, setShowOrders] = useState(PAGE);

  const stockCache = useRef<{ at: number; shopId: string; rows: StockResult[] } | null>(null);
  const requestId = useRef(0);

  const trimmed = query.trim();
  const tokens = parseTokens(trimmed);
  const hasNumber = tokens.some(t => t.kind === 'num');
  const tooShort = trimmed.length < 2 && !hasNumber;
  const active = trimmed.length > 0;

  useEffect(() => {
    if (!active || tooShort) {
      requestId.current++;
      setLoading(false);
      setError('');
      setStock([]); setSales([]); setOrders([]);
      return;
    }
    if (!isDemo && !shopId) return;

    const myId = ++requestId.current;
    setLoading(true);
    setError('');

    const timer = setTimeout(async () => {
      try {
        const toks = parseTokens(trimmed);
        let stockRows: StockResult[];
        let salesRows: SaleResult[];
        let orderRows: OrderResult[];

        if (isDemo) {
          stockRows = DEMO_STOCK; salesRows = DEMO_SALES; orderRows = DEMO_ORDERS;
        } else {
          const cache = stockCache.current;
          const stockPromise = cache && cache.shopId === shopId && Date.now() - cache.at < STOCK_CACHE_MS
            ? Promise.resolve(cache.rows)
            : fetchAllStock(shopId as string).then(rows => {
                stockCache.current = { at: Date.now(), shopId: shopId as string, rows };
                return rows;
              });

          const salesQuery = applyCoarseFilters(
            supabase.from('sales').select('id, lens_details, quantity, created_at').eq('shop_id', shopId), toks
          ).order('created_at', { ascending: false }).limit(300);

          const ordersQuery = applyCoarseFilters(
            supabase.from('orders').select('id, lens_details, quantity, created_at, stock_updated').eq('shop_id', shopId), toks
          ).order('created_at', { ascending: false }).limit(300);

          const [stockAll, salesRes, ordersRes] = await Promise.all([stockPromise, salesQuery, ordersQuery]);
          if (salesRes.error) throw salesRes.error;
          if (ordersRes.error) throw ordersRes.error;

          stockRows = stockAll;
          salesRows = (salesRes.data || []).map((r: any) => ({
            id: r.id, name: r.lens_details?.name || '', quantity: Number(r.quantity), created_at: r.created_at,
          }));
          orderRows = (ordersRes.data || []).map((r: any) => ({
            id: r.id, name: r.lens_details?.name || '', quantity: Number(r.quantity), created_at: r.created_at,
            stock_updated: !!r.stock_updated,
          }));
        }

        if (myId !== requestId.current) return; // purani search ka result ignore

        // Stock: jo available hai (qty > 0) pehle, phir 0 stock wale
        const stockMatched = stockRows.filter(r => nameMatches(r.name, toks)).sort((a, b) => {
          const aIn = a.quantity > 0 ? 0 : 1;
          const bIn = b.quantity > 0 ? 0 : 1;
          if (aIn !== bIn) return aIn - bIn;
          return a.name.localeCompare(b.name, undefined, { numeric: true });
        });

        setStock(stockMatched);
        setSales(salesRows.filter(r => nameMatches(r.name, toks)));
        setOrders(orderRows.filter(r => nameMatches(r.name, toks)));
        setShowStock(PAGE); setShowSales(PAGE); setShowOrders(PAGE);
      } catch (e: any) {
        if (myId !== requestId.current) return;
        setError(e?.message || 'Search fail ho gayi.');
      } finally {
        if (myId === requestId.current) setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [trimmed, tooShort, active, shopId, isDemo]);

  const sectionHeader = (icon: React.ReactNode, title: string, count: number) => (
    <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-800/80 border-y border-gray-100 dark:border-gray-700">
      {icon}
      <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{title}</span>
      <span className="text-[10px] font-bold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded-full">{count}</span>
    </div>
  );

  const empty = (text: string) => <p className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500">{text}</p>;

  const moreButton = (shown: number, total: number, onMore: () => void) =>
    total > shown ? (
      <button onClick={onMore} className="w-full py-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors">
        Aur dikhao ({total - shown} baaki)
      </button>
    ) : null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="p-3">
        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Lens search karo (jaise -0.25, 0.25 bluecut, plano hc)"
            className="w-full pl-9 pr-9 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-800 dark:text-gray-100 placeholder-gray-400"
          />
          {loading ? (
            <Loader2 className="w-4 h-4 text-gray-400 animate-spin absolute right-3 top-1/2 -translate-y-1/2" />
          ) : query ? (
            <button onClick={() => setQuery('')} aria-label="Search saaf karo" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          ) : null}
        </div>
        {active && tooShort && <p className="text-[11px] text-gray-400 mt-2">Kam se kam 2 akshar likho.</p>}
        {error && <p className="text-[11px] text-red-500 mt-2">{error}</p>}
      </div>

      {active && !tooShort && !error && (
        <div>
          {sectionHeader(<Package className="w-3.5 h-3.5 text-green-600" />, 'Stock me', stock.length)}
          {stock.length === 0 ? (loading ? null : empty('Stock me ye lens nahi mila.')) : (
            <>
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {stock.slice(0, showStock).map(r => (
                  <li key={r.id} className="flex items-center justify-between px-4 py-2">
                    <span className={`text-xs ${r.quantity > 0 ? 'font-medium text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500'}`}>{r.name}</span>
                    {r.quantity > 0 ? (
                      <span className="text-xs font-bold text-green-600 dark:text-green-400">{formatQty(r.quantity)} pair</span>
                    ) : (
                      <span className="text-[10px] font-semibold text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">0 stock</span>
                    )}
                  </li>
                ))}
              </ul>
              {moreButton(showStock, stock.length, () => setShowStock(n => n + PAGE))}
            </>
          )}

          {sectionHeader(<Tag className="w-3.5 h-3.5 text-emerald-600" />, 'Sell hue (nayi pehle)', sales.length)}
          {sales.length === 0 ? (loading ? null : empty('Is lens ki koi sale nahi mili.')) : (
            <>
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {sales.slice(0, showSales).map(r => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate">{r.name}</p>
                      <p className="text-[10px] text-gray-400">{formatDateTime(r.created_at)}</p>
                    </div>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{formatQty(r.quantity)} pair</span>
                  </li>
                ))}
              </ul>
              {moreButton(showSales, sales.length, () => setShowSales(n => n + PAGE))}
            </>
          )}

          {sectionHeader(<ShoppingCart className="w-3.5 h-3.5 text-indigo-600" />, 'Order kiye (naye pehle)', orders.length)}
          {orders.length === 0 ? (loading ? null : empty('Is lens ka koi order nahi mila.')) : (
            <>
              <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {orders.slice(0, showOrders).map(r => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate">{r.name}</p>
                      <p className="text-[10px] text-gray-400">
                        {formatDateTime(r.created_at)}
                        {r.stock_updated && <span className="ml-2 text-blue-600 dark:text-blue-400 font-semibold">· Stock me add ho gaya</span>}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">{formatQty(r.quantity)} pair</span>
                  </li>
                ))}
              </ul>
              {moreButton(showOrders, orders.length, () => setShowOrders(n => n + PAGE))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
