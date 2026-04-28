import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  generateLensRows,
  getDefaultAxis,
  MATERIALS,
  VISIONS,
  DEFAULT_COATINGS,
  PROTECTED_COATINGS,
  formatLensName,
  Material,
  Vision,
  PowerType,
  Sign,
  KT_AXIS,
  PROGRESSIVE_AXIS,
  Shop,
  fetchCustomLensRows,
  saveCustomLensRows,
  CustomLensRow
} from '../utils/lensUtils';
import { Plus, Minus, Save, Edit2, Check, X, Trash2, ChevronUp, ChevronDown } from 'lucide-react';

export default function StockPage({ isDemo = false }: { isDemo?: boolean }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [selectedShop, setSelectedShop] = useState('');
  const [material, setMaterial] = useState<Material>('CR');
  const [vision, setVision] = useState<Vision>('single vision');
  const [coatings, setCoatings] = useState<string[]>(['HC']);
  const [sign, setSign] = useState<Sign>('-');
  const [powerType, setPowerType] = useState<PowerType>('SPH');
  const [compoundLimit, setCompoundLimit] = useState('2.0');
  const [rowAxes, setRowAxes] = useState<Record<string, number>>({});
  const [customCoating, setCustomCoating] = useState('');
  const [availableCoatings, setAvailableCoatings] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('availableCoatings');
      if (saved) {
        let coatings = JSON.parse(saved);
        if (coatings.includes('Bluecut green')) {
          coatings = coatings.map((c: string) => c === 'Bluecut green' ? 'Bluecut' : c);
          localStorage.setItem('availableCoatings', JSON.stringify(coatings));
        }
        return coatings;
      }
      return DEFAULT_COATINGS;
    } catch { return DEFAULT_COATINGS; }
  });
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [originalStock, setOriginalStock] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [customRows, setCustomRows] = useState<CustomLensRow[]>([]);
  const [selectedRowIndexes, setSelectedRowIndexes] = useState<Set<number>>(new Set());
  const [newRowPower, setNewRowPower] = useState({ sph: '', cyl: '', add: '' });
  const [insertAt, setInsertAt] = useState<number | null>(null);

  useEffect(() => {
    async function loadRows() {
      setLoading(true);
      const custom = await fetchCustomLensRows(material, vision, sign, powerType, compoundLimit, coatings);
      if (custom) {
        setCustomRows(custom);
      } else {
        setCustomRows(generateLensRows(powerType, compoundLimit, vision));
      }
      setLoading(false);
    }
    loadRows();
  }, [material, vision, sign, powerType, compoundLimit, coatings]);

  const lensRows = customRows;

  useEffect(() => {
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
  }, [vision, sign, powerType, lensRows]);

  useEffect(() => {
    async function fetchShops() {
      if (isDemo) {
        const demoShops = [
          { id: '1', name: 'SS Opticals' },
          { id: '2', name: 'Narbada Eye Care' }
        ];
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

  useEffect(() => {
    if (selectedShop && !isDemo) {
      fetchStock();
    }
    setDeltas({});
  }, [selectedShop, material, vision, coatings, sign, powerType, compoundLimit, isDemo]);

  async function fetchStock() {
    setLoading(true);
    try {
      let query = supabase
        .from('lens_stock')
        .select('*')
        .eq('shop_id', selectedShop)
        .eq('material', material)
        .eq('vision', vision)
        .eq('sign', sign)
        .eq('power_type', powerType);

      query = query.eq('coatings', `{${coatings.join(',')}}`);

      if (powerType === 'SPH') {
        query = query.eq('cyl', 0);
      } else if (powerType === 'CYL') {
        query = query.gt('cyl', 0).lte('cyl', 6.0);
      } else {
        if (compoundLimit === '2.0') {
          query = query.gte('cyl', 0.25).lte('cyl', 2.0);
        } else {
          query = query.gte('cyl', 2.25).lte('cyl', 4.0);
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      const stockMap: Record<string, number> = {};
      if (data) {
        data.forEach((item) => {
          const axisVal = item.axis !== null && item.axis !== undefined ? item.axis : '';
          const addVal = item.addition !== null && item.addition !== undefined ? item.addition.toFixed(2) : '';
          const key = `${item.sph.toFixed(2)}:${item.cyl.toFixed(2)}:${axisVal}:${addVal}`;
          stockMap[key] = Number(item.quantity);
        });
      }
      setOriginalStock(stockMap);
    } catch (error) {
      console.error("Fetch error:", error);
    } finally {
      setLoading(false);
    }
  }

  const handleQuantityChange = (sph: string, cyl: string, axis: number | undefined, add: string | undefined, delta: number) => {
    const key = `${parseFloat(sph).toFixed(2)}:${parseFloat(cyl).toFixed(2)}:${axis || ''}:${add || ''}`;
    const currentDelta = deltas[key] || 0;
    setDeltas({ ...deltas, [key]: currentDelta + delta });
  };

  const saveStock = async () => {
    if (isDemo) {
      alert('Demo Mode: Stock changes are not saved to the database.');
      return;
    }
    const entries = Object.entries(deltas).filter(([_, d]) => d !== 0);
    if (entries.length === 0) { alert('No changes to save.'); return; }

    setLoading(true);
    let updatedCount = 0;
    let lastError = null;

    for (const [key, delta] of entries) {
      const [sphStr, cylStr, axisStr, addStr] = key.split(':');
      const currentQty = originalStock[key] || 0;
      const newQty = Math.max(0, currentQty + delta);

      const update = {
        shop_id: selectedShop,
        material,
        vision,
        sign,
        power_type: powerType,
        sph: parseFloat(sphStr),
        cyl: parseFloat(cylStr),
        axis: axisStr ? parseInt(axisStr) : null,
        addition: addStr ? parseFloat(addStr) : null,
        coatings,
        quantity: newQty
      };

      const { error } = await supabase.from('lens_stock').upsert(update, {
        onConflict: 'shop_id, material, vision, sign, power_type, sph, cyl, axis, addition, coatings'
      });
      if (error) { console.error("Save error:", error); lastError = error; }
      else { updatedCount++; }
    }

    setLoading(false);
    if (updatedCount > 0) {
      alert(`Stock updated successfully! (${updatedCount} items)`);
      // Clear original stock before refetch so UI doesn't show stale data
      setOriginalStock({});
      setDeltas({});
      await fetchStock();
    } else if (lastError) {
      alert('Failed to save changes. Error: ' + (lastError as any).message);
    } else {
      alert('No changes were applied.');
    }
  };

  const toggleCoating = (c: string) => {
    if (c === 'Photo Grey') {
      if (coatings.includes(c)) { setCoatings(coatings.filter(item => item !== c)); }
      else { setCoatings([...coatings, c]); }
    } else {
      const photoGreySelected = coatings.includes('Photo Grey');
      setCoatings(photoGreySelected ? ['Photo Grey', c] : [c]);
    }
  };

  const addCustomCoating = () => {
    if (customCoating && !availableCoatings.includes(customCoating)) {
      const updated = [...availableCoatings, customCoating];
      setAvailableCoatings(updated);
      localStorage.setItem('availableCoatings', JSON.stringify(updated));
      const photoGreySelected = coatings.includes('Photo Grey');
      setCoatings(photoGreySelected ? ['Photo Grey', customCoating] : [customCoating]);
      setCustomCoating('');
    }
  };

  const deleteCoating = (c: string) => {
    const updated = availableCoatings.filter(item => item !== c);
    setAvailableCoatings(updated);
    localStorage.setItem('availableCoatings', JSON.stringify(updated));
    setCoatings(coatings.filter(item => item !== c));
  };

  const handleEditToggle = () => {
    if (isEditMode) {
      fetchCustomLensRows(material, vision, sign, powerType, compoundLimit, coatings).then(custom => {
        if (custom) setCustomRows(custom);
        else setCustomRows(generateLensRows(powerType, compoundLimit, vision));
      });
    }
    setIsEditMode(!isEditMode);
    setInsertAt(null);
    setSelectedRowIndexes(new Set());
  };

  const handleSaveList = async () => {
    setLoading(true);
    try {
      const oldRows = await fetchCustomLensRows(material, vision, sign, powerType, compoundLimit, coatings) || generateLensRows(powerType, compoundLimit, vision);
      const { success, error } = await saveCustomLensRows(material, vision, sign, powerType, compoundLimit, customRows, coatings);

      if (!success) {
        alert('Failed to save list: ' + (error as any).message);
        return;
      }

      const newKeys = new Set(customRows.map(r => `${parseFloat(r.sph).toFixed(2)}:${parseFloat(r.cyl).toFixed(2)}:${r.add ? parseFloat(r.add).toFixed(2) : ''}`));
      const deletedRows = oldRows.filter(r => !newKeys.has(`${parseFloat(r.sph).toFixed(2)}:${parseFloat(r.cyl).toFixed(2)}:${r.add ? parseFloat(r.add).toFixed(2) : ''}`));

      if (deletedRows.length > 0) {
        for (const row of deletedRows) {
          let deleteQuery = supabase
            .from('lens_stock')
            .delete()
            .eq('material', material)
            .eq('vision', vision)
            .eq('sign', sign)
            .eq('power_type', powerType)
            .eq('sph', parseFloat(row.sph))
            .eq('cyl', parseFloat(row.cyl))
            .filter('coatings', 'eq', `{${coatings.join(',')}}`);

          if (row.add) {
            deleteQuery = deleteQuery.eq('addition', parseFloat(row.add));
          } else {
            deleteQuery = deleteQuery.is('addition', null);
          }

          const { error: delError } = await deleteQuery;
          if (delError) console.error('Delete error:', delError);
        }
      }

      alert('List saved successfully!');
      setIsEditMode(false);
    } catch (e) {
      console.error(e);
      alert('An error occurred while saving.');
    } finally {
      setLoading(false);
    }
  };

  const toggleRowSelection = (index: number) => {
    const newSelection = new Set(selectedRowIndexes);
    if (newSelection.has(index)) {
      newSelection.delete(index);
    } else {
      newSelection.add(index);
    }
    setSelectedRowIndexes(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedRowIndexes.size === customRows.length) {
      setSelectedRowIndexes(new Set());
    } else {
      setSelectedRowIndexes(new Set(customRows.map((_, i) => i)));
    }
  };

  const deleteSelectedRows = () => {
    if (selectedRowIndexes.size === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedRowIndexes.size} selected rows? This will also delete their stock for all shops when you save.`)) return;
    
    const newRows = customRows.filter((_, index) => !selectedRowIndexes.has(index));
    setCustomRows(newRows);
    setSelectedRowIndexes(new Set());
  };

  const moveRowUp = (index: number) => {
    if (index === 0) return;
    const newRows = [...customRows];
    const temp = newRows[index - 1];
    newRows[index - 1] = newRows[index];
    newRows[index] = temp;
    setCustomRows(newRows);
    setSelectedRowIndexes(new Set()); // Reset selection to avoid confusion after move
  };

  const moveRowDown = (index: number) => {
    if (index === customRows.length - 1) return;
    const newRows = [...customRows];
    const temp = newRows[index + 1];
    newRows[index + 1] = newRows[index];
    newRows[index] = temp;
    setCustomRows(newRows);
    setSelectedRowIndexes(new Set()); // Reset selection
  };

  const initiateInsert = (index: number) => {
    setInsertAt(index);
    const row = customRows[index];
    setNewRowPower({ sph: row.sph, cyl: row.cyl, add: row.add || '' });
  };

  const confirmInsert = () => {
    if (insertAt === null) return;
    const sph = parseFloat(newRowPower.sph);
    const cyl = parseFloat(newRowPower.cyl);
    const add = newRowPower.add ? parseFloat(newRowPower.add) : undefined;
    if (isNaN(sph) || isNaN(cyl)) { alert('Please enter valid SPH and CYL numbers.'); return; }
    if ((vision === 'KT' || vision === 'Prograssive') && (add === undefined || isNaN(add))) { alert('Please enter a valid ADD number.'); return; }
    const newRows = [...customRows];
    newRows.splice(insertAt, 0, {
      sph: sph.toFixed(2),
      cyl: cyl.toFixed(2),
      add: add !== undefined ? add.toFixed(2) : undefined
    });
    setCustomRows(newRows);
    setInsertAt(null);
    setSelectedRowIndexes(new Set());
  };

  return (
    <div className="space-y-4 pb-20">
      <div className="sticky top-16 z-40 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm -mx-4 px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center shadow-sm">
        <h1 className="text-sm font-bold text-gray-900 dark:text-white truncate">Stock {isEditMode ? '(Edit Mode)' : ''}</h1>
        <div className="flex gap-2">
          {!isEditMode ? (
            <>
              <button onClick={handleEditToggle} className="bg-indigo-600 text-white px-3 py-1.5 rounded-md flex items-center hover:bg-indigo-700 text-[10px] sm:text-xs transition-colors">
                <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit List
              </button>
              <button onClick={saveStock} disabled={loading} className="bg-green-600 text-white px-3 py-1.5 rounded-md flex items-center hover:bg-green-700 disabled:opacity-50 text-[10px] sm:text-xs transition-colors shadow-sm">
                <Save className="w-3.5 h-3.5 mr-1" /> Save Stock
              </button>
            </>
          ) : (
            <>
              {selectedRowIndexes.size > 0 && (
                <button onClick={deleteSelectedRows} className="bg-red-600 text-white px-3 py-1.5 rounded-md flex items-center hover:bg-red-700 text-[10px] sm:text-xs transition-colors shadow-sm animate-in fade-in zoom-in duration-200">
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete ({selectedRowIndexes.size})
                </button>
              )}
              <button onClick={handleEditToggle} className="bg-gray-600 text-white px-3 py-1.5 rounded-md flex items-center hover:bg-gray-700 text-[10px] sm:text-xs transition-colors">
                <X className="w-3.5 h-3.5 mr-1" /> Cancel
              </button>
              <button onClick={handleSaveList} className="bg-green-600 text-white px-3 py-1.5 rounded-md flex items-center hover:bg-green-700 text-[10px] sm:text-xs transition-colors shadow-sm">
                <Check className="w-3.5 h-3.5 mr-1" /> Save List
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-sm space-y-3 border border-gray-200 dark:border-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Shop</label>
            <div className="flex gap-1.5">
              {shops.map(shop => (
                <button key={shop.id} onClick={() => setSelectedShop(shop.id)} className={`flex-1 py-1.5 px-2 rounded-md border text-[10px] font-medium transition-all ${selectedShop === shop.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>{shop.name}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Material</label>
            <div className="flex gap-1.5">
              {MATERIALS.map(m => (
                <button key={m} onClick={() => setMaterial(m)} className={`flex-1 py-1.5 px-2 rounded-md border text-[10px] font-medium transition-all ${material === m ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>{m}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Vision</label>
            <select value={vision} onChange={(e) => { setVision(e.target.value as Vision); setRowAxes({}); }} className="block w-full rounded-md border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 p-1.5 border text-[10px]">
              {VISIONS.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Power Type</label>
            <div className="flex flex-wrap gap-1 mt-1">
              {['SPH', 'CYL', 'Compound', 'Cross Compound'].map((type) => (
                <button key={type} onClick={() => setPowerType(type as PowerType)} className={`px-2 py-1.5 rounded-md border text-[10px] font-medium transition-all ${powerType === type ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:bg-gray-100'}`}>{type}</button>
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
          {(powerType === 'Compound' || powerType === 'Cross Compound') && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">CYL Range</label>
              <div className="flex gap-1.5 mt-1">
                <button onClick={() => setCompoundLimit('2.0')} className={`flex-1 py-1.5 px-1 rounded-md border text-[10px] font-medium transition-all ${compoundLimit === '2.0' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700'}`}>upto 2.0 cyl</button>
                <button onClick={() => setCompoundLimit('4.0')} className={`flex-1 py-1.5 px-1 rounded-md border text-[10px] font-medium transition-all ${compoundLimit === '4.0' ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700'}`}>upto 4 cyl</button>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">Coatings</label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {availableCoatings.map(c => (
                <div key={c} className="relative inline-flex items-center">
                  <button
                    onClick={() => toggleCoating(c)}
                    className={`px-2 py-1 rounded-full text-[10px] font-medium border transition-all ${
                      coatings.includes(c)
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                    } ${!PROTECTED_COATINGS.includes(c) ? 'pr-5' : ''}`}
                  >
                    {c}
                  </button>
                  {!PROTECTED_COATINGS.includes(c) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteCoating(c); }}
                      className={`absolute right-1 transition-colors ${coatings.includes(c) ? 'text-indigo-200 hover:text-white' : 'text-gray-400 hover:text-red-500'}`}
                      title="Delete coating"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              <input type="text" value={customCoating} onChange={(e) => setCustomCoating(e.target.value)} placeholder="Add coating..." className="text-[10px] bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-700 rounded-md px-2 py-1 w-24 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all" />
              <button onClick={addCustomCoating} className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 p-1 rounded-md hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition-colors"><Plus className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800/80 text-center">
              <tr>
                {isEditMode && (
                  <th className="px-2 py-1.5 w-10">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      checked={selectedRowIndexes.size === customRows.length && customRows.length > 0}
                      onChange={toggleSelectAll}
                    />
                  </th>
                )}
                {isEditMode && <th className="px-1 py-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-16">Move</th>}
                <th className="px-2 py-1.5 text-left text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Description</th>
                {powerType !== 'SPH' && <th className="px-1 py-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-16">Axis</th>}
                <th className="px-1 py-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-16">Stock</th>
                <th className="px-1 py-1.5 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-16">Update</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {lensRows.map((row, index) => {
                const rowKey = `${row.sph}-${row.cyl}-${row.add || ''}-${index}`;
                const rowAxis = rowAxes[rowKey];
                const name = formatLensName(material, vision, sign, powerType, row.sph, row.cyl, coatings, rowAxis, row.add);
                const key = `${parseFloat(row.sph).toFixed(2)}:${parseFloat(row.cyl).toFixed(2)}:${rowAxis || ''}:${row.add || ''}`;
                const delta = deltas[key] || 0;
                const origQty = originalStock[key] || 0;
                const isInsertMode = insertAt === index;
                const isSelected = selectedRowIndexes.has(index);

                return (
                  <React.Fragment key={rowKey}>
                    {isInsertMode && (
                      <tr className="bg-yellow-50 dark:bg-yellow-900/20">
                        <td colSpan={isEditMode ? (powerType !== 'SPH' ? 7 : 6) : (powerType !== 'SPH' ? 5 : 4)} className="p-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <input type="number" step="0.25" placeholder="SPH" className="w-16 text-[10px] p-1 border rounded dark:bg-gray-900 dark:border-gray-700" value={newRowPower.sph} onChange={(e) => setNewRowPower({ ...newRowPower, sph: e.target.value })} />
                            <input type="number" step="0.25" placeholder="CYL" className="w-16 text-[10px] p-1 border rounded dark:bg-gray-900 dark:border-gray-700" value={newRowPower.cyl} onChange={(e) => setNewRowPower({ ...newRowPower, cyl: e.target.value })} />
                            {(vision === 'KT' || vision === 'Prograssive') && (
                              <input type="number" step="0.25" placeholder="ADD" className="w-16 text-[10px] p-1 border rounded dark:bg-gray-900 dark:border-gray-700" value={newRowPower.add} onChange={(e) => setNewRowPower({ ...newRowPower, add: e.target.value })} />
                            )}
                            <button onClick={confirmInsert} className="bg-green-600 text-white p-1 rounded"><Check className="w-4 h-4" /></button>
                            <button onClick={() => setInsertAt(null)} className="bg-red-600 text-white p-1 rounded"><X className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </tr>
                    )}
                    <tr
                      onContextMenu={(e) => { if (isEditMode) { e.preventDefault(); initiateInsert(index); } }}
                      onMouseDown={(e) => { if (isEditMode) { const timer = setTimeout(() => initiateInsert(index), 700); (e.currentTarget as any)._holdTimer = timer; } }}
                      onMouseUp={(e) => { if ((e.currentTarget as any)._holdTimer) clearTimeout((e.currentTarget as any)._holdTimer); }}
                      onMouseLeave={(e) => { if ((e.currentTarget as any)._holdTimer) clearTimeout((e.currentTarget as any)._holdTimer); }}
                      onTouchStart={(e) => { if (isEditMode) { const timer = setTimeout(() => initiateInsert(index), 700); (e.currentTarget as any)._holdTimer = timer; } }}
                      onTouchEnd={(e) => { if ((e.currentTarget as any)._holdTimer) clearTimeout((e.currentTarget as any)._holdTimer); }}
                      className={`hover:bg-indigo-50/50 dark:hover:bg-gray-700/30 transition-colors even:bg-gray-100 dark:even:bg-gray-700/50 ${isEditMode ? 'cursor-pointer select-none' : ''} ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}
                      onClick={() => isEditMode && toggleRowSelection(index)}
                    >
                      {isEditMode && (
                        <td className="px-2 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            checked={isSelected}
                            onChange={() => toggleRowSelection(index)}
                          />
                        </td>
                      )}
                      {isEditMode && (
                        <td className="px-1 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-col items-center gap-0.5">
                            <button onClick={() => moveRowUp(index)} disabled={index === 0} className={`p-0.5 rounded transition-colors ${index === 0 ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' : 'text-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/40'}`}>
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button onClick={() => moveRowDown(index)} disabled={index === customRows.length - 1} className={`p-0.5 rounded transition-colors ${index === customRows.length - 1 ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed' : 'text-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/40'}`}>
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                      <td className="px-2 py-1.5 whitespace-nowrap text-xs font-medium text-gray-700 dark:text-gray-300 select-none">
                        {isEditMode && <span className="mr-2 text-gray-400">☰</span>}
                        {name}
                      </td>
                      {powerType !== 'SPH' && (
                        <td className="px-1 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <select disabled={isEditMode} value={rowAxis || ''} onChange={(e) => setRowAxes({ ...rowAxes, [rowKey]: parseInt(e.target.value) })} className="bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-[10px] p-0.5 w-14 disabled:opacity-50">
                            <option value="">-</option>
                            {(vision === 'KT' ? KT_AXIS : PROGRESSIVE_AXIS).map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </td>
                      )}
                      <td className="px-1 py-1.5 whitespace-nowrap text-[10px] text-center text-gray-400 dark:text-gray-500">{origQty.toFixed(2)}</td>
                      <td className={`px-1 py-1.5 whitespace-nowrap text-[10px] text-center font-bold ${delta === 0 ? 'text-gray-300 dark:text-gray-600' : 'text-indigo-600 dark:text-indigo-400'}`}>
                        {delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-right">
                        {!isEditMode ? (
                          <div className="flex justify-end gap-1">
                            <button onClick={(e) => { e.stopPropagation(); handleQuantityChange(row.sph, row.cyl, rowAxis, row.add, -0.5); }} className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"><Minus className="w-6 h-6" /></button>
                            <button onClick={(e) => { e.stopPropagation(); handleQuantityChange(row.sph, row.cyl, rowAxis, row.add, 0.5); }} className="p-3 rounded-md bg-green-50 dark:bg-green-900/20 text-green-500 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"><Plus className="w-6 h-6" /></button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1 text-[10px] text-gray-400 italic">
                            Select to delete
                          </div>
                        )}
                      </td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
