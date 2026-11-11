import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { showToast } from '../components/Toast';
import { useUnsavedGuard } from '../components/UnsavedChanges';
import { useCoatings } from '../utils/coatingSync';
import {
  generateLensRows,
  fetchCustomLensRows,
  CustomLensRow,
  getDefaultAxis,
  MATERIALS,
  VISIONS,
  VISION_LABELS,
  filterPlanoRows,
  formatLensName,
  Material,
  Vision,
  PowerType,
  Sign,
  KT_AXIS,
  PROGRESSIVE_AXIS,
  Shop,
  formatReportQty,
  sortLensNames
} from '../utils/lensUtils';
import { Plus, Minus, ShoppingCart, FileText, X, Loader2, Edit2, Trash2, Check, PackageCheck, Calendar } from 'lucide-react';
import { parseLensName, isStockLens } from '../utils/lensUtils';

interface OrderRecord {
  id: string;
  lens_details: { name: string; custom?: boolean };
  quantity: number;
  created_at: string;
  shop_id: string;
  stock_updated?: boolean;
}

interface DateSummary {
  date: string;
  count: number;
  totalQty: number;
}

// ---------- Generate Order report helpers ----------
// Lens naam se power ke numbers hata kar group heading banata hai.
// "-1.00 SPH HC" -> "- SPH HC", "-1.50 CYL AXIS 135 ADD +2.50 HC KT" -> "- CYL HC KT"
function getGroupHeading(name: string): string {
  let t = name
    .replace(/\bADD\s*\+?\d+(\.\d+)?/gi, '')
    .replace(/\bAXIS\s*\d+/gi, '')
    .replace(/([+-])\d+(\.\d+)?\/([+-])\d+(\.\d+)?/g, '$1 / $3')
    .replace(/([+-])\d+(\.\d+)?/g, '$1');
  t = t.replace(/\s+/g, ' ').trim().toUpperCase();
  return t || name.toUpperCase();
}

// Groups ka order: single vision -> KT -> Prograssive, phir CR -> Poly -> Glass,
// phir minus (-) -> plus (+), phir HC pehle baaki coatings baad me, phir SPH -> CYL -> Compound.
function getGroupRank(name: string): (number | string)[] {
  const p = parseLensName(name);
  if (!p) return [99, 0, 0, '', 0];
  const visionRank = p.vision === 'single vision' ? 0 : p.vision === 'KT' ? 1 : 2;
  const materialRank = p.material === 'CR' ? 0 : p.material === 'Poly' ? 1 : 2;
  const isPlano = /^plano/i.test(name.trim());
  const signRank = isPlano ? -1 : p.sign === '-' ? 0 : 1;
  const coat = p.coatings.join(' ');
  const coatKey = (coat.toUpperCase() === 'HC' ? '0' : '1') + coat.toUpperCase();
  const typeRank = p.powerType === 'SPH' ? 0 : p.powerType === 'CYL' ? 1 : p.powerType === 'Compound' ? 2 : 3;
  return [visionRank, materialRank, signRank, coatKey, typeRank];
}

function compareGroupRank(a: (number | string)[], b: (number | string)[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

export default function OrderPage({ isDemo = false }: { isDemo?: boolean }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState('');
  const [material, setMaterial] = useState<Material>('CR');
  const [vision, setVision] = useState<Vision>('single vision');
  const [coatings, setCoatings] = useState<string[]>(['HC']);
  const [sign, setSign] = useState<Sign>('-');
  const [powerType, setPowerType] = useState<PowerType>('SPH');
  const [rowAxes, setRowAxes] = useState<Record<string, number>>({});
  const [customCoating, setCustomCoating] = useState('');
  const [customPower, setCustomPower] = useState('');
  const [customQty, setCustomQty] = useState('1.0');
  const [customSaving, setCustomSaving] = useState(false);
  const { availableCoatings, addCoating } = useCoatings(isDemo);

  // Agar gear se koi coating OFF ho jaye to page par chuni hui coating bhi hat jati hai.
  useEffect(() => {
    setCoatings(prev => {
      const next = prev.filter(c => availableCoatings.includes(c));
      if (next.length === prev.length) return prev;
      return next.length ? next : ['HC'];
    });
  }, [availableCoatings]);
  const [deltas, setDeltas] = useState<Record<string, { qty: number; name: string }>>({});
  const [loading, setLoading] = useState(false);
  const [customRows, setCustomRows] = useState<CustomLensRow[]>([]);

  // Edit Order modal
  const [showEditOrder, setShowEditOrder] = useState(false);
  const [orderRecords, setOrderRecords] = useState<OrderRecord[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingQty, setEditingQty] = useState('');
  const [editingName, setEditingName] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Sent Orders modal state
  const [showSentOrders, setShowSentOrders] = useState(false);
  const [dateSummaries, setDateSummaries] = useState<DateSummary[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [sentOrderRecords, setSentOrderRecords] = useState<OrderRecord[]>([]);
  const [sentOrderQuantities, setSentOrderQuantities] = useState<Record<string, number>>({});
  const [sentLoading, setSentLoading] = useState(false);
  const [sentSelectedIds, setSentSelectedIds] = useState<Set<string>>(new Set());
  const [stockLensStatus, setStockLensStatus] = useState<Record<string, boolean>>({});
  const [updateStockLoading, setUpdateStockLoading] = useState(false);

  const isKTOrProg = vision === 'KT' || vision === 'Prograssive';

  useEffect(() => {
    async function loadRows() {
      setLoading(true);
      let custom = await fetchCustomLensRows(material, vision, sign, powerType, coatings);
      if (!custom) {
        custom = generateLensRows(powerType, vision, sign);
      }
      custom = filterPlanoRows(custom, vision, sign, powerType);
      setCustomRows(custom);
      setLoading(false);
    }
    loadRows();
  }, [material, vision, sign, powerType, coatings]);

  const lensRows = customRows;

  // Single vision lenses never have an axis, so the Axis column is hidden for them (any sign, material, coating or power type).
  const showAxis = vision !== 'single vision' && powerType !== 'SPH' && powerType !== 'Cross Compound';

  useEffect(() => {
    if (!showAxis) {
      setRowAxes({});
      return;
    }
    const defaultAxis = getDefaultAxis(vision, sign, powerType);
    if (defaultAxis !== undefined) {
      const newAxes: Record<string, number> = {};
      lensRows.forEach((row, index) => {
        newAxes[`${row.sph}-${row.cyl}-${row.add || ''}-${index}`] = defaultAxis;
      });
      setRowAxes(newAxes);
    } else {
      setRowAxes({});
    }
  }, [vision, sign, powerType, lensRows, showAxis]);

  useEffect(() => {
    async function fetchShops() {
      if (isDemo) {
        const demo = [{ id: '1', name: 'Narbada Eye Care' }];
        setShops(demo); setSelectedShop(demo[0].id); return;
      }
      const { data } = await supabase.from('shops').select('*');
      if (data?.length) {
        const narbada = data.find(s => s.name.toLowerCase().includes('narbada')) || data[0];
        setShops([narbada]);
        setSelectedShop(narbada.id);
      }
    }
    fetchShops();
  }, [isDemo]);

  // Fetch today's orders
  const fetchTodayOrders = useCallback(async () => {
    if (isDemo) return;
    setEditLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('orders')
      .select('id, lens_details, quantity, created_at, shop_id')
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`)
      .order('created_at', { ascending: false });
    setOrderRecords(data || []);
    setEditLoading(false);
  }, [isDemo]);

  const openEditModal = () => {
    setShowEditOrder(true);
    setSelectedIds(new Set());
    setEditingId(null);
    fetchTodayOrders();
  };

  // Fetch unique dates for Sent Orders
  const fetchSentOrderDates = useCallback(async () => {
    if (isDemo) {
      setDateSummaries([
        { date: new Date().toISOString().split('T')[0], count: 3, totalQty: 5 }
      ]);
      return;
    }
    setSentLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select('id, quantity, created_at')
      .order('created_at', { ascending: false });

    if (error || !data) {
      setSentLoading(false);
      return;
    }

    const map: Record<string, { count: number; totalQty: number }> = {};
    data.forEach(item => {
      const dateStr = item.created_at.split('T')[0];
      if (!map[dateStr]) map[dateStr] = { count: 0, totalQty: 0 };
      map[dateStr].count += 1;
      map[dateStr].totalQty += Number(item.quantity);
    });

    const summaries: DateSummary[] = Object.keys(map).map(date => ({
      date,
      count: map[date].count,
      totalQty: map[date].totalQty
    }));

    setDateSummaries(summaries);
    setSentLoading(false);
  }, [isDemo]);

  const openSentOrdersModal = () => {
    setShowSentOrders(true);
    setSelectedDate(null);
    setSentOrderRecords([]);
    setSentSelectedIds(new Set());
    fetchSentOrderDates();
  };

  const fetchOrdersForDate = async (dateStr: string) => {
    setSelectedDate(dateStr);
    setSentLoading(true);
    setSentSelectedIds(new Set());

    if (isDemo) {
      const demoRecords: OrderRecord[] = [
        { id: '1', lens_details: { name: '-2.00 SPH HC CR single vision' }, quantity: 2, created_at: `${dateStr}T10:00:00`, shop_id: '1' },
        { id: '2', lens_details: { name: '-1.00/-0.50 HMC Poly single vision' }, quantity: 1, created_at: `${dateStr}T11:00:00`, shop_id: '1' },
        { id: '3', lens_details: { name: '+12.00 -4.50 x 90 Custom' }, quantity: 1, created_at: `${dateStr}T12:00:00`, shop_id: '1' }
      ];
      setSentOrderRecords(demoRecords);
      const initialQty: Record<string, number> = {};
      const statusMap: Record<string, boolean> = {};
      for (const rec of demoRecords) {
        initialQty[rec.id] = rec.quantity;
        const parsed = parseLensName(rec.lens_details.name);
        statusMap[rec.id] = await isStockLens(parsed);
      }
      setSentOrderQuantities(initialQty);
      setStockLensStatus(statusMap);
      setSentLoading(false);
      return;
    }

    const { data } = await supabase
      .from('orders')
      .select('id, lens_details, quantity, created_at, shop_id, stock_updated')
      .gte('created_at', `${dateStr}T00:00:00`)
      .lte('created_at', `${dateStr}T23:59:59`)
      .order('created_at', { ascending: false });

    const records = data || [];
    setSentOrderRecords(records);

    const initialQty: Record<string, number> = {};
    const statusMap: Record<string, boolean> = {};

    for (const rec of records) {
      initialQty[rec.id] = rec.quantity;
      const parsed = parseLensName(rec.lens_details?.name || '');
      statusMap[rec.id] = await isStockLens(parsed);
    }

    setSentOrderQuantities(initialQty);
    setStockLensStatus(statusMap);
    setSentLoading(false);
  };

  const toggleSentSelect = (id: string) => {
    setSentSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSentSelectAll = () => {
    const selectable = sentOrderRecords.filter(r => !r.stock_updated);
    if (selectable.length > 0 && sentSelectedIds.size === selectable.length) {
      setSentSelectedIds(new Set());
    } else {
      setSentSelectedIds(new Set(selectable.map(r => r.id)));
    }
  };

  const handleSentQtyChange = (id: string, val: string) => {
    const num = parseFloat(val);
    setSentOrderQuantities(prev => ({
      ...prev,
      [id]: isNaN(num) ? 0 : num
    }));
  };

  const updateSelectedInStock = async () => {
    if (!sentSelectedIds.size) {
      showToast('Select at least one lens to update in stock.', 'info');
      return;
    }

    // Jo order pehle hi stock me add ho chuke hain unhe dobara add nahi karna
    const selectedRecords = sentOrderRecords.filter(r => sentSelectedIds.has(r.id) && !r.stock_updated);
    if (selectedRecords.length === 0) {
      showToast('Ye order(s) pehle hi stock me add ho chuke hain.', 'info');
      return;
    }
    const stockRecords = selectedRecords.filter(r => stockLensStatus[r.id]);
    const nonStockRecords = selectedRecords.filter(r => !stockLensStatus[r.id]);

    if (stockRecords.length === 0) {
      alert('Selected items me se koi bhi lens stock list me nahi hai. Non-stock custom lenses stock me add nahi honge.');
      return;
    }

    if (isDemo) {
      showToast(`Demo Mode: ${stockRecords.length} stock item(s) would be updated.`, 'info');
      return;
    }

    setUpdateStockLoading(true);
    let updatedCount = 0;
    let alreadyCount = 0;
    let lastError: any = null;
    const updatedIds = new Set<string>();

    for (const record of stockRecords) {
      const qtyToAdd = sentOrderQuantities[record.id] || record.quantity;
      if (qtyToAdd <= 0) continue;

      const parsed = parseLensName(record.lens_details?.name || '');
      if (!parsed) continue;

      // Step 1: order ko "stock me add" mark karo (sirf tab jab pehle se mark na ho).
      // Isse double click ya dusre device se dobara add nahi hoga.
      const { data: claimed, error: claimError } = await supabase
        .from('orders')
        .update({ stock_updated: true })
        .eq('id', record.id)
        .eq('stock_updated', false)
        .select('id');

      if (claimError) {
        console.error('Order mark error:', claimError);
        lastError = claimError;
        continue;
      }
      if (!claimed || claimed.length === 0) {
        alreadyCount++;
        continue;
      }

      // Step 2: sahi stock row dhundho (axis aur addition ke saath)
      const axisVal = parsed.axis ?? null;
      const addVal = parsed.add ? parseFloat(parsed.add) : null;

      let lookup: any = supabase
        .from('lens_stock')
        .select('id, quantity')
        .eq('shop_id', record.shop_id)
        .eq('material', parsed.material)
        .eq('vision', parsed.vision)
        .eq('sign', parsed.sign)
        .eq('power_type', parsed.powerType)
        .eq('sph', parseFloat(parsed.sph))
        .eq('cyl', parseFloat(parsed.cyl))
        .filter('coatings', 'eq', `{${parsed.coatings.join(',')}}`);
      lookup = axisVal !== null ? lookup.eq('axis', axisVal) : lookup.is('axis', null);
      lookup = addVal !== null ? lookup.eq('addition', addVal) : lookup.is('addition', null);

      const { data: existingRows, error: lookupError } = await lookup.limit(1);
      let error: any = lookupError;

      if (!error) {
        const existing = existingRows && existingRows.length ? existingRows[0] : null;
        const currentQty = existing ? Number(existing.quantity) : 0;
        const newQty = currentQty + qtyToAdd;

        const updateData = {
          shop_id: record.shop_id,
          material: parsed.material,
          vision: parsed.vision,
          sign: parsed.sign,
          power_type: parsed.powerType,
          sph: parseFloat(parsed.sph),
          cyl: parseFloat(parsed.cyl),
          axis: axisVal,
          addition: addVal,
          coatings: parsed.coatings,
          quantity: newQty
        };

        const res = await supabase.from('lens_stock').upsert(updateData, {
          onConflict: 'shop_id, material, vision, sign, power_type, sph, cyl, axis, addition, coatings'
        });
        error = res.error;
      }

      if (error) {
        console.error('Update in stock error:', error);
        lastError = error;
        // Stock add nahi hua to mark wapas hata do, taaki dobara try kar sako
        await supabase.from('orders').update({ stock_updated: false }).eq('id', record.id);
      } else {
        updatedCount++;
        updatedIds.add(record.id);
      }
    }

    setUpdateStockLoading(false);

    if (updatedIds.size > 0) {
      setSentOrderRecords(prev => prev.map(r => updatedIds.has(r.id) ? { ...r, stock_updated: true } : r));
      setSentSelectedIds(new Set());
    }

    if (updatedCount > 0) {
      let msg = `Successfully updated ${updatedCount} lens(es) in stock!`;
      if (nonStockRecords.length > 0) {
        msg += ` (${nonStockRecords.length} non-stock custom lens(es) skipped)`;
      }
      if (alreadyCount > 0) {
        msg += ` (${alreadyCount} pehle se add the, skip kiye)`;
      }
      showToast(msg, 'success');
    } else if (lastError) {
      alert('Stock update failed: ' + (lastError as any).message);
    } else if (alreadyCount > 0) {
      showToast('Ye order(s) pehle hi stock me add ho chuke hain.', 'info');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(
      selectedIds.size === orderRecords.length
        ? new Set()
        : new Set(orderRecords.map(r => r.id))
    );
  };

  const deleteSelected = async () => {
    if (!selectedIds.size) return;
    if (!window.confirm(`${selectedIds.size} order(s) delete karna chahte ho?`)) return;
    setDeleteLoading(true);
    const { error } = await supabase.from('orders').delete().in('id', Array.from(selectedIds));
    setDeleteLoading(false);
    if (error) { alert('Delete failed: ' + error.message); return; }
    setSelectedIds(new Set());
    await fetchTodayOrders();
  };

  const saveEdit = async (id: string) => {
    const qty = parseFloat(editingQty);
    if (isNaN(qty) || qty <= 0) { alert('Valid quantity enter karo.'); return; }
    const { error } = await supabase
      .from('orders')
      .update({
        lens_details: orderRecords.find(r => r.id === id)?.lens_details?.custom
          ? { name: editingName, custom: true }
          : { name: editingName },
        quantity: qty,
      })
      .eq('id', id);
    if (error) { alert('Update failed: ' + error.message); return; }
    setEditingId(null);
    await fetchTodayOrders();
  };

  const handleQuantityChange = (sph: string, cyl: string, name: string, delta: number, axis?: number, add?: string) => {
    const key = `${selectedShop}-${material}-${vision}-${sign}-${powerType}-${sph}-${cyl}-${axis || ''}-${coatings.join(',')}-${isKTOrProg ? add : ''}`;
    const current = deltas[key] || { qty: 0, name };
    const newQty = Math.max(0, current.qty + delta);
    if (newQty === 0) { const d = { ...deltas }; delete d[key]; setDeltas(d); }
    else { setDeltas({ ...deltas, [key]: { qty: newQty, name } }); }
  };

  const saveOrder = async (): Promise<boolean> => {
    if (isDemo) { showToast('Demo Mode: Orders are not saved.', 'info'); return false; }
    const entries = Object.entries(deltas);
    if (!entries.length) { showToast('Please add items to order.', 'info'); return false; }
    setLoading(true);
    let ok = 0, lastErr = null;
    for (const [, data] of entries) {
      const { error } = await supabase.from('orders').insert({
        shop_id: selectedShop, lens_details: { name: data.name }, quantity: data.qty
      });
      error ? (lastErr = error) : ok++;
    }
    setLoading(false);
    if (ok > 0) { showToast(`Orders saved! (${ok} items)`, 'success'); setDeltas({}); }
    else if (lastErr) alert('Failed: ' + (lastErr as any).message);
    return ok > 0 && !lastErr;
  };

  const saveCustomPowerDirectly = async () => {
    if (!customPower.trim()) return;
    const qty = parseFloat(customQty) || 1.0;
    const name = customPower.trim();
    if (isDemo) { showToast('Demo Mode: Custom orders are not saved.', 'info'); return; }
    setCustomSaving(true);
    const { error } = await supabase.from('orders').insert({
      shop_id: selectedShop, lens_details: { name, custom: true }, quantity: qty
    });
    setCustomSaving(false);
    if (error) alert('Failed: ' + error.message);
    else { setCustomPower(''); setCustomQty('1.0'); showToast(`"${name}" (${qty} pair) saved!`, 'success'); }
  };

  const toggleCoating = (c: string) => {
    if (c === 'Photo Grey') {
      coatings.includes(c) ? setCoatings(coatings.filter(i => i !== c)) : setCoatings([...coatings, c]);
    } else {
      setCoatings(coatings.includes('Photo Grey') ? ['Photo Grey', c] : [c]);
    }
  };

  const addCustomCoating = async () => {
    const res = await addCoating(customCoating);
    if (!res.ok) { showToast(res.message || 'Coating add nahi hui.', 'error'); return; }
    const photoGreySelected = coatings.includes('Photo Grey');
    setCoatings(photoGreySelected ? ['Photo Grey', res.name as string] : [res.name as string]);
    setCustomCoating('');
  };


  const generateOrderReport = async () => {
    // Window click par hi khol lete hain (baad me kholne par popup block ho sakta hai)
    const win = window.open('', '_blank');
    if (!win) { alert('Popup block ho gaya. Browser me popup allow karein.'); return; }
    win.document.write('<p style="font-family:sans-serif;padding:16px">Report ban rahi hai...</p>');
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];
    const { data: orders } = await supabase.from('orders').select('lens_details, quantity').gte('created_at', today);
    if (!orders?.length) { setLoading(false); win.close(); alert('No orders found for today.'); return; }

    // Pehle (flag, naam) ke hisaab se jodo
    const raw: Record<string, { name: string; custom: boolean; qty: number }> = {};
    orders.forEach(o => {
      const name = o.lens_details.name;
      const custom = o.lens_details.custom === true;
      const key = `${custom ? 'C' : 'S'}|${name}`;
      if (!raw[key]) raw[key] = { name, custom, qty: 0 };
      raw[key].qty += Number(o.quantity);
    });
    // Purane orders (flag nahi) me: stock list me na ho to custom (non-stock) maano
    await Promise.all(Object.values(raw).filter(e => !e.custom).map(async e => {
      try { e.custom = !(await isStockLens(parseLensName(e.name))); } catch { /* check fail -> stock maano */ }
    }));
    const stockTotals: Record<string, number> = {};
    const customTotals: Record<string, number> = {};
    Object.values(raw).forEach(e => {
      const target = e.custom ? customTotals : stockTotals;
      target[e.name] = (target[e.name] || 0) + e.qty;
    });
    const items = Object.entries(stockTotals).sort((a, b) => sortLensNames(a[0], b[0]));
    const customItems = Object.entries(customTotals).sort((a, b) => sortLensNames(a[0], b[0]));
    const dateStr = new Date().toLocaleDateString('en-GB');
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Ek jaise lenses ko ek heading ke neeche group karo
    const groupMap = new Map<string, { heading: string; rank: (number | string)[]; rows: [string, number][] }>();
    items.forEach(item => {
      const heading = getGroupHeading(item[0]);
      if (!groupMap.has(heading)) groupMap.set(heading, { heading, rank: getGroupRank(item[0]), rows: [] });
      groupMap.get(heading)!.rows.push(item);
    });
    let serial = 0; // numbering 1 se shuru hoke saare groups me last tak continue
    const groups: { h: string | null; rows: { no: number; n: string; q: string }[] }[] = Array.from(groupMap.values())
      .sort((a, b) => compareGroupRank(a.rank, b.rank) || a.heading.localeCompare(b.heading))
      .map(g => ({
        h: esc(g.heading),
        rows: g.rows.map(r => ({ no: ++serial, n: esc(r[0]), q: formatQtyHTML(r[1]) })),
      }));
    // Custom (Non-Stock) lenses: koi heading nahi, ek line ka gap dekar sabse neeche
    if (customItems.length) {
      groups.push({
        h: null,
        rows: customItems.map(r => ({ no: ++serial, n: esc(r[0]), q: formatQtyHTML(r[1]) })),
      });
    }
    // '<' ko escape karte hain taaki script tag kabhi beech me band na ho
    const groupsJson = JSON.stringify(groups).replace(/</g, '\\u003c');
    const fileDate = dateStr.replace(/\//g, '-');
    setLoading(false);
    {
      win.document.open();
      win.document.write(`<html><head>
        <title>Order Report - ${dateStr}</title>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
        <style>
          @page{size:210mm 297mm;margin:0}*{box-sizing:border-box}
          body{font-family:'Courier New',monospace;font-size:12px;margin:0;padding:0;background:#f3f4f6}
          .controls{padding:8px 16px;display:flex;gap:10px;justify-content:center;background:white;border-bottom:1px solid #eee}
          .btn{background:#4f46e5;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-family:sans-serif;font-size:14px}
          .btn:hover{background:#4338ca}
          .page-container{background:white;width:595px;height:842px;overflow:hidden;padding:8px 6px;margin:0 auto 12px;box-shadow:0 0 4px rgba(0,0,0,.25)}
          .header{border-bottom:2px solid black;padding-bottom:4px;margin-bottom:8px;text-align:center;font-weight:bold;font-size:12px}
          .columns{display:flex;gap:4px;align-items:flex-start}.column{flex:1;min-width:0}
          table{width:100%;border-collapse:collapse;table-layout:fixed}
          td{border:none;border-bottom:1px solid #d9d9d9;padding:2px 4px;text-align:left;line-height:1.2;font-size:12px;vertical-align:middle;word-wrap:break-word}
          td.grp{background:#f1f2f4;font-weight:bold;font-size:14px}
          tr.gap td{border:none;height:18px;padding:0;background:transparent}
          col.c-num{width:36px}col.c-qty{width:72px}
          td.num-col{text-align:right;font-weight:bold;white-space:nowrap;padding:2px 3px}
          .qty-col{text-align:center;font-weight:bold;white-space:nowrap}
          .frac{display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;font-size:.75em;line-height:1;margin:0 1px}
          .frac .num{display:block;border-bottom:1px solid black;padding:0 1px;line-height:1.1}
          .frac .den{display:block;padding:0 1px;line-height:1.1}
          @media print{
            .controls{display:none}
            body{background:white}
            .page-container{margin:0;box-shadow:none;page-break-after:always}
            .page-container:last-child{page-break-after:auto}
          }
        </style>
      </head><body>
        <div class="controls">
          <button class="btn" onclick="window.print()">Print / Save PDF</button>
          <button class="btn" onclick="downloadJPG()">Download JPG</button>
        </div>
        <div id="pages"></div>
        <script>
          var GROUPS = ${groupsJson};
          var DATE_STR = ${JSON.stringify(dateStr)};
          var FILE_DATE = ${JSON.stringify(fileDate)};
          var pagesEl = document.getElementById('pages');
          var cur = null, colIdx = 0, tbody = null, curGroup = null;

          function newPage(){
            var p = document.createElement('div');
            p.className = 'page-container';
            p.innerHTML = '<div class="header"></div><div class="columns">'
              + '<div class="column"><table><colgroup><col class="c-num"><col><col class="c-qty"></colgroup><tbody></tbody></table></div>'
              + '<div class="column"><table><colgroup><col class="c-num"><col><col class="c-qty"></colgroup><tbody></tbody></table></div></div>';
            pagesEl.appendChild(p);
            cur = p; colIdx = 0; tbody = p.getElementsByTagName('tbody')[0]; curGroup = null;
          }
          function nextColumn(){
            if (colIdx === 0) { colIdx = 1; tbody = cur.getElementsByTagName('tbody')[1]; curGroup = null; }
            else { newPage(); }
          }
          function overflow(){
            var limit = cur.getBoundingClientRect().bottom - 8;
            return tbody.getBoundingClientRect().bottom > limit;
          }
          function headEl(text, contd){
            var tr = document.createElement('tr');
            tr.innerHTML = '<td class="grp" colspan="3">' + text + (contd ? ' (contd.)' : '') + '</td>';
            return tr;
          }
          function gapEl(){
            var tr = document.createElement('tr');
            tr.className = 'gap';
            tr.innerHTML = '<td colspan="3"></td>';
            return tr;
          }
          function rowEl(r){
            var tr = document.createElement('tr');
            tr.innerHTML = '<td class="num-col">' + r.no + '.</td><td class="name">' + r.n + '</td><td class="qty-col">' + r.q + '</td>';
            return tr;
          }
          // Heading + row saath rakhta hai. Jagah na ho to agle column / agle page par jata hai.
          function put(g, r){
            for (;;) {
              var empty = tbody.children.length === 0;
              var nodes = [];
              if (g.h !== null) {
                if (empty || curGroup !== g) nodes.push(headEl(g.h, g.started));
              } else if (!empty && !g.started) {
                nodes.push(gapEl()); // custom lenses se pehle ek line ka gap
              }
              nodes.push(rowEl(r));
              nodes.forEach(function(n){ tbody.appendChild(n); });
              if (!overflow() || empty) { curGroup = g; g.started = true; return; }
              nodes.forEach(function(n){ tbody.removeChild(n); });
              nextColumn();
            }
          }

          newPage();
          GROUPS.forEach(function(g){ g.rows.forEach(function(r){ put(g, r); }); });

          var pgs = pagesEl.children;
          for (var i = 0; i < pgs.length; i++) {
            pgs[i].querySelector('.header').textContent =
              'DATE: ' + DATE_STR + (pgs.length > 1 ? '   (Page ' + (i + 1) + ' of ' + pgs.length + ')' : '');
          }

          function downloadJPG(){
            var btn = document.querySelector('button[onclick="downloadJPG()"]');
            if (btn) { btn.disabled = true; btn.innerText = 'Generating...'; }
            var list = document.querySelectorAll('.page-container');
            var idx = 0;
            function next(){
              if (idx >= list.length) { if (btn) { btn.disabled = false; btn.innerText = 'Download JPG'; } return; }
              html2canvas(list[idx], {scale:2, width:595, height:842, windowWidth:595, backgroundColor:'#ffffff'}).then(function(canvas){
                var link = document.createElement('a');
                link.download = 'Order_' + FILE_DATE + (list.length > 1 ? '_page' + (idx + 1) : '') + '.jpg';
                link.href = canvas.toDataURL('image/jpeg', 0.92);
                link.click();
                idx++;
                setTimeout(next, 400);
              });
            }
            next();
          }
        </script>
      </body></html>`);
      win.document.close();
    }
  };

  function formatQtyHTML(qty: number): string {
    const whole = Math.floor(qty);
    const frac = qty % 1;
    const unit = qty === 1 ? 'Pair' : 'Pairs';
    if (frac === 0.5) {
      const w = whole > 0 ? `${whole}` : '';
      return `${w}<span class="frac"><span class="num">1</span><span class="den">2</span></span> ${unit}`;
    }
    return `${qty} ${unit}`;
  }

  const getShopName = (id: string) => shops.find(s => s.id === id)?.name || id;

  // Unsaved changes: order list me jo lens add kiye hain par Save nahi hua
  const hasOrderChanges = Object.keys(deltas).length > 0;
  useUnsavedGuard(hasOrderChanges, () => saveOrder(), () => setDeltas({}));

  return (
    <div className="space-y-4 pb-20">

      {/* Top bar */}
      <div className="sticky top-[137px] sm:top-16 z-40 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm -mx-4 px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center shadow-sm">
        <h1 className="text-sm font-bold text-gray-900 dark:text-white">Place Order</h1>
        <div className="flex gap-2">
          <button onClick={openSentOrdersModal}
            className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-md flex items-center text-sm shadow-sm transition-colors">
            <PackageCheck className="w-4 h-4 mr-1" /> Sent Orders
          </button>
          <button onClick={openEditModal}
            className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-md flex items-center text-sm shadow-sm transition-colors">
            <Edit2 className="w-4 h-4 mr-1" /> Edit Order
          </button>
          <button onClick={generateOrderReport}
            className="bg-blue-600 text-white px-3 py-1.5 rounded-md flex items-center text-sm hover:bg-blue-700 shadow-sm transition-colors">
            <FileText className="w-4 h-4 mr-1" /> Generate Order
          </button>
          <button onClick={saveOrder} disabled={loading || !hasOrderChanges}
            className={`px-3 py-1.5 rounded-md flex items-center text-sm transition-colors ${hasOrderChanges ? 'bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 shadow-sm' : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'}`}>
            <ShoppingCart className="w-4 h-4 mr-1" /> Save
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm space-y-3 border border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Material</label>
            <div className="flex gap-1.5">
              {MATERIALS.map(m => (
                <button key={m} onClick={() => setMaterial(m)}
                  className={`flex-1 py-1.5 px-2 rounded-md border text-[10px] font-medium transition-all ${material === m ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Vision</label>
            <div className="flex gap-1.5">
              {VISIONS.map(v => (
                <button key={v} type="button" onClick={() => { setVision(v); setRowAxes({}); }} className={`flex-1 py-1.5 px-2 rounded-md border text-[10px] font-medium transition-all ${vision === v ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>{VISION_LABELS[v]}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Power Type</label>
            <div className="flex flex-wrap gap-1 mt-1">
              {(['SPH', 'CYL', 'Compound', 'Cross Compound'] as PowerType[]).map(type => (
                <button key={type} onClick={() => setPowerType(type)}
                  className={`px-2 py-1.5 rounded-md border text-[10px] font-medium transition-all ${powerType === type ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100'}`}>
                  {type}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Sign</label>
            <div className="flex gap-1.5 mt-1">
              <button onClick={() => setSign('+')} className={`flex-1 py-1.5 rounded-md border text-[10px] font-medium transition-all ${sign === '+' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700'}`}>+</button>
              <button onClick={() => setSign('-')} className={`flex-1 py-1.5 rounded-md border text-[10px] font-medium transition-all ${sign === '-' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700'}`}>-</button>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Coatings</label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {availableCoatings.map(c => (
                <div key={c} className="relative inline-flex items-center">
                  <button onClick={() => toggleCoating(c)}
                    className={`px-2 py-1 rounded-full text-[10px] font-medium border transition-all ${coatings.includes(c) ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'}`}>
                    {c}
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <input type="text" value={customCoating} onChange={(e) => setCustomCoating(e.target.value)} placeholder="Add coating..."
                className="text-[10px] bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 w-24 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              <button onClick={addCustomCoating} className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 p-1 rounded-md hover:bg-indigo-200 transition-colors">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Custom power */}
        <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">
            Custom Lens Power (Non-Stock)
            <span className="ml-2 text-[10px] text-indigo-400 normal-case font-normal">— directly saves to order</span>
          </label>
          <div className="flex gap-2">
            <input type="text" value={customPower} onChange={(e) => setCustomPower(e.target.value)}
              placeholder="Enter power (e.g. +12.00 -4.50 x 90)"
              className="flex-1 text-sm bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-700 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-0"
              onKeyPress={(e) => e.key === 'Enter' && saveCustomPowerDirectly()} />
            <label className="w-24 shrink-0 flex items-center bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md px-2.5 cursor-pointer focus-within:ring-2 focus-within:ring-indigo-500">
              <span className="text-[10px] font-bold text-gray-400 mr-1 select-none">QTY:</span>
              <input type="number" step="0.5" min="0.5" value={customQty} onChange={(e) => setCustomQty(e.target.value)}
                className="w-full bg-transparent text-sm text-gray-900 dark:text-gray-100 focus:outline-none py-1.5" />
            </label>
            <button onClick={saveCustomPowerDirectly} disabled={customSaving || !customPower.trim()}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md flex items-center text-sm font-medium hover:bg-indigo-700 shadow-sm transition-colors disabled:opacity-50 shrink-0">
              {customSaving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Saving...</> : <><ShoppingCart className="w-4 h-4 mr-1" /> Save</>}
            </button>
          </div>
        </div>
      </div>

      {/* Lens rows table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800/80 text-center">
              <tr>
                <th className="px-2 py-1.5 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-48">Description</th>
                {showAxis && <th className="px-1 py-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-16">Axis</th>}
                <th className="px-1 py-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-16">Qty</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {lensRows.map((row, index) => {
                const rowKey = `${row.sph}-${row.cyl}-${row.add || ''}-${index}`;
                const rowAxis = rowAxes[rowKey];
                const name = formatLensName(material, vision, sign, powerType, row.sph, row.cyl, coatings, rowAxis, row.add);
                const stateKey = `${selectedShop}-${material}-${vision}-${sign}-${powerType}-${row.sph}-${row.cyl}-${rowAxis || ''}-${coatings.join(',')}-${isKTOrProg ? row.add : ''}`;
                const qty = deltas[stateKey]?.qty || 0;
                return (
                  <tr key={rowKey} className="hover:bg-indigo-50/50 dark:hover:bg-gray-700/30 transition-colors even:bg-gray-100 dark:even:bg-gray-700/50">
                    <td className="px-2 py-1.5 whitespace-nowrap text-xs font-medium text-gray-700 dark:text-gray-300 w-48">{name}</td>
                    {showAxis && (
                      <td className="px-1 py-1.5 text-center">
                        <select value={rowAxis || ''} onChange={(e) => setRowAxes({ ...rowAxes, [rowKey]: parseInt(e.target.value) })}
                          className="bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-[10px] p-0.5 w-14">
                          <option value="">-</option>
                          {(vision === 'KT' ? KT_AXIS : PROGRESSIVE_AXIS).map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                      </td>
                    )}
                    <td className={`px-1 py-1.5 whitespace-nowrap text-[10px] text-center font-bold ${qty > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-300 dark:text-gray-600'}`}>
                      {qty.toFixed(2)}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => handleQuantityChange(row.sph, row.cyl, name, -0.5, rowAxis, row.add)} className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 hover:bg-red-100 transition-colors"><Minus className="w-6 h-6" /></button>
                        <button onClick={() => handleQuantityChange(row.sph, row.cyl, name, 0.5, rowAxis, row.add)} className="p-3 rounded-md bg-green-50 dark:bg-green-900/20 text-green-500 dark:text-green-400 hover:bg-green-100 transition-colors"><Plus className="w-6 h-6" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══ SENT ORDERS MODAL ══ */}
      {showSentOrders && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-3xl mt-8 mb-8 flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                {selectedDate && (
                  <button onClick={() => { setSelectedDate(null); setSentOrderRecords([]); setSentSelectedIds(new Set()); }}
                    className="mr-1 p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 text-xs">
                    ← Back
                  </button>
                )}
                <div>
                  <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <PackageCheck className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    Sent Orders {selectedDate ? `- ${new Date(selectedDate).toLocaleDateString('en-GB')}` : ''}
                  </h2>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {selectedDate ? 'Check items and update directly into stock' : 'Select a date to view sent orders'}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowSentOrders(false)} className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            {!selectedDate ? (
              /* Date Selection View */
              <div className="p-5 max-h-[60vh] overflow-y-auto">
                {sentLoading ? (
                  <div className="flex items-center justify-center py-16 text-sm text-gray-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading dates...
                  </div>
                ) : dateSummaries.length === 0 ? (
                  <div className="text-center py-16 text-sm text-gray-400">Koi sent orders nahi mile.</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {dateSummaries.map(summary => (
                      <button
                        key={summary.date}
                        onClick={() => fetchOrdersForDate(summary.date)}
                        className="flex flex-col items-start p-3 bg-gray-50 dark:bg-gray-800/80 hover:bg-purple-50 dark:hover:bg-purple-900/20 border border-gray-200 dark:border-gray-700 rounded-lg transition-all text-left group shadow-sm hover:border-purple-300 dark:hover:border-purple-600"
                      >
                        <div className="flex items-center justify-between w-full mb-2">
                          <span className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                            {new Date(summary.date).toLocaleDateString('en-GB')}
                          </span>
                          <span className="text-[10px] bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full font-semibold">
                            {summary.count} items
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400">
                          Total Qty: <strong className="text-gray-700 dark:text-gray-300">{summary.totalQty} pairs</strong>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Order Details View for Selected Date */
              <div className="flex flex-col flex-1">
                {/* Action Bar */}
                <div className="flex items-center justify-between px-5 py-2.5 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-700">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                      checked={sentOrderRecords.some(r => !r.stock_updated) && sentSelectedIds.size === sentOrderRecords.filter(r => !r.stock_updated).length}
                      onChange={toggleSentSelectAll}
                    />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      {sentSelectedIds.size > 0 ? `${sentSelectedIds.size} selected` : 'Select All'}
                    </span>
                  </label>
                  <button
                    onClick={updateSelectedInStock}
                    disabled={updateStockLoading || sentSelectedIds.size === 0}
                    className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {updateStockLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PackageCheck className="w-3.5 h-3.5" />}
                    Update in Stock ({sentSelectedIds.size})
                  </button>
                </div>

                {/* Items Table */}
                <div className="flex-1 overflow-y-auto max-h-[55vh]">
                  {sentLoading ? (
                    <div className="flex items-center justify-center py-16 text-sm text-gray-400">
                      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading orders...
                    </div>
                  ) : sentOrderRecords.length === 0 ? (
                    <div className="text-center py-16 text-sm text-gray-400">Is date ke orders nahi mile.</div>
                  ) : (
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-800/80 sticky top-0">
                        <tr>
                          <th className="w-10 px-3 py-2"></th>
                          <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Lens Description</th>
                          <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24">Shop</th>
                          <th className="px-3 py-2 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider w-28">Order Qty</th>
                          <th className="px-3 py-2 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider w-28">Stock Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {sentOrderRecords.map(record => {
                          const isSelected = sentSelectedIds.has(record.id);
                          const isStock = stockLensStatus[record.id];
                          const qty = sentOrderQuantities[record.id] !== undefined ? sentOrderQuantities[record.id] : record.quantity;
                          const alreadyAdded = !!record.stock_updated;

                          return (
                            <tr key={record.id} className={`transition-colors ${alreadyAdded ? 'opacity-60' : ''} ${isSelected ? 'bg-purple-50/60 dark:bg-purple-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 even:bg-gray-50/50 dark:even:bg-gray-800/20'}`}>
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                  checked={isSelected}
                                  disabled={alreadyAdded}
                                  onChange={() => toggleSentSelect(record.id)}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <span className="text-xs font-medium text-gray-800 dark:text-gray-200">{record.lens_details?.name}</span>
                              </td>
                              <td className="px-3 py-2 text-[10px] text-gray-400 whitespace-nowrap">
                                {getShopName(record.shop_id)}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0.5"
                                  value={qty}
                                  disabled={alreadyAdded}
                                  onChange={(e) => handleSentQtyChange(record.id, e.target.value)}
                                  className="w-20 text-xs font-bold text-center bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-purple-500"
                                />
                              </td>
                              <td className="px-3 py-2 text-center">
                                {alreadyAdded ? (
                                  <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800" title="Ye order stock me add ho chuka hai">
                                    Stock me add ho gaya
                                  </span>
                                ) : isStock ? (
                                  <span className="text-[10px] font-bold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full border border-green-200 dark:border-green-800">
                                    Stock Lens
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800" title="Custom Non-Stock power - stock me list nahi h isliye skip hoga">
                                    Non-Stock
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <span className="text-[10px] text-gray-400">
                {selectedDate ? `${sentOrderRecords.length} items total` : `${dateSummaries.length} dates recorded`}
              </span>
              <button onClick={() => setShowSentOrders(false)}
                className="px-4 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                Close
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ══ EDIT ORDER MODAL ══ */}
      {showEditOrder && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl mt-8 mb-8 flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <Edit2 className="w-4 h-4 text-amber-500" /> Edit Order
                </h2>
                <p className="text-[10px] text-gray-400 mt-0.5">Aaj ke orders — edit ya delete karo</p>
              </div>
              <button onClick={() => setShowEditOrder(false)} className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Action bar */}
            <div className="flex items-center justify-between px-5 py-2.5 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-700">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  checked={orderRecords.length > 0 && selectedIds.size === orderRecords.length}
                  onChange={toggleSelectAll}
                />
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select all'}
                </span>
              </label>
              <div className="flex items-center gap-2">
                {selectedIds.size > 0 && (
                  <button onClick={deleteSelected} disabled={deleteLoading}
                    className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 shadow-sm">
                    {deleteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Delete ({selectedIds.size})
                  </button>
                )}
                <button onClick={fetchTodayOrders} disabled={editLoading}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50">
                  {editLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto max-h-[60vh]">
              {editLoading ? (
                <div className="flex items-center justify-center py-16 text-sm text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading...
                </div>
              ) : orderRecords.length === 0 ? (
                <div className="text-center py-16 text-sm text-gray-400">Aaj koi order nahi mila.</div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-800/80 sticky top-0">
                    <tr>
                      <th className="w-10 px-3 py-2"></th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Lens Name</th>
                      <th className="px-3 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider w-24">Shop</th>
                      <th className="px-3 py-2 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider w-20">Qty</th>
                      <th className="px-3 py-2 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider w-20">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {orderRecords.map(record => {
                      const isSelected = selectedIds.has(record.id);
                      const isEditing = editingId === record.id;
                      return (
                        <tr key={record.id}
                          className={`transition-colors ${isSelected ? 'bg-red-50 dark:bg-red-900/10' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50 even:bg-gray-50/50 dark:even:bg-gray-800/20'}`}>
                          {/* Checkbox */}
                          <td className="px-3 py-2 text-center">
                            <input type="checkbox"
                              className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-red-400 cursor-pointer"
                              checked={isSelected}
                              onChange={() => toggleSelect(record.id)} />
                          </td>
                          {/* Name */}
                          <td className="px-3 py-2">
                            {isEditing ? (
                              <input type="text" value={editingName} onChange={(e) => setEditingName(e.target.value)}
                                className="w-full text-xs bg-white dark:bg-gray-900 border border-indigo-400 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                autoFocus />
                            ) : (
                              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{record.lens_details?.name}</span>
                            )}
                          </td>
                          {/* Shop */}
                          <td className="px-3 py-2 text-[10px] text-gray-400 whitespace-nowrap">{getShopName(record.shop_id)}</td>
                          {/* Qty */}
                          <td className="px-3 py-2 text-center">
                            {isEditing ? (
                              <input type="number" step="0.5" min="0.5" value={editingQty} onChange={(e) => setEditingQty(e.target.value)}
                                className="w-16 text-xs text-center bg-white dark:bg-gray-900 border border-indigo-400 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
                            ) : (
                              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{record.quantity}</span>
                            )}
                          </td>
                          {/* Edit/Save/Cancel */}
                          <td className="px-3 py-2 text-center">
                            {isEditing ? (
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={() => saveEdit(record.id)}
                                  className="p-1.5 rounded bg-green-100 dark:bg-green-900/30 text-green-600 hover:bg-green-200 transition-colors" title="Save">
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setEditingId(null)}
                                  className="p-1.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 transition-colors" title="Cancel">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button onClick={() => { setEditingId(record.id); setEditingQty(String(record.quantity)); setEditingName(record.lens_details?.name || ''); }}
                                className="p-1.5 rounded bg-amber-50 dark:bg-amber-900/20 text-amber-600 hover:bg-amber-100 transition-colors" title="Edit">
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
              <span className="text-[10px] text-gray-400">
                Total: <strong className="text-gray-600 dark:text-gray-300">{orderRecords.length}</strong> orders aaj ke
              </span>
              <button onClick={() => setShowEditOrder(false)}
                className="px-4 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
