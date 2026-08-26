import { supabase } from '../lib/supabase';

export type Material = 'CR' | 'Poly' | 'Glass';
export type Vision = 'single vision' | 'KT' | 'Prograssive';
export type PowerType = 'SPH' | 'CYL' | 'Compound' | 'Cross Compound';
export type Sign = '+' | '-';

export interface CustomLensRow {
  sph: string;
  cyl: string;
  add?: string;
}

export interface LensStock {
  id?: string;
  shop_id: string;
  material: Material;
  vision: Vision;
  sign: Sign | null;
  power_type: PowerType;
  sph: number;
  cyl: number;
  axis: number | null;
  coatings: string[];
  quantity: number;
}

export interface Shop {
  id: string;
  name: string;
}

export interface ParsedLens {
  material: Material;
  vision: Vision;
  sign: Sign;
  powerType: PowerType;
  sph: string;
  cyl: string;
  axis?: number;
  add?: string;
  coatings: string[];
  compoundLimit: string;
}

export const MATERIALS: Material[] = ['CR', 'Poly', 'Glass'];
export const VISIONS: Vision[] = ['single vision', 'KT', 'Prograssive'];
export const DEFAULT_COATINGS = ['HC', 'HMC', 'Bluecut', 'Bluecut Dual coat', 'Bluecut Blue', 'Photo Grey'];

// ✅ Default Shop Mapping — email ke hisaab se default shop name
export const DEFAULT_SHOP_MAPPING: Record<string, string> = {
  'iamsanjaysaini@gmail.com': 'SS Opticals',
  'sumitsainibrd@gmail.com': 'Narbada Eye Care',
};

// ✅ Helper function — shops array aur email do, default shop id milega
export function getDefaultShopId(shops: Shop[], email: string): string {
  const shopName = DEFAULT_SHOP_MAPPING[email];
  const matched = shopName ? shops.find(s => s.name === shopName) : null;
  return matched ? matched.id : shops[0].id;
}

export const PROTECTED_COATINGS = ['HC', 'HMC', 'Bluecut'];

export function generatePowerList(includeZero: boolean = true, max: number = 6.0) {
  const powers = [];
  const start = includeZero ? 0 : 0.25;
  for (let i = start; i <= max; i += 0.25) {
    powers.push(i.toFixed(2));
  }
  return powers;
}

export async function fetchCustomLensRows(
  material: Material,
  vision: Vision,
  sign: Sign | null,
  powerType: PowerType,
  compoundLimit: string = '2.0',
  coatings: string[] = []
): Promise<CustomLensRow[] | null> {
  let query = supabase
    .from('custom_lens_rows')
    .select('sph, cyl, addition')
    .eq('material', material)
    .eq('vision', vision)
    .eq('power_type', powerType)
    .eq('compound_limit', compoundLimit)
    .filter('coatings', 'eq', `{${coatings.join(',')}}`);

  if (sign === null) {
    query = query.is('sign', null);
  } else {
    query = query.eq('sign', sign);
  }

  const { data, error } = await query.order('sort_order', { ascending: true });

  if (error) {
    console.error('Error fetching custom lens rows:', error);
    return null;
  }

  if (!data || data.length === 0) return null;

  return data.map(row => ({
    sph: row.sph.toFixed(2),
    cyl: row.cyl.toFixed(2),
    add: row.addition ? row.addition.toFixed(2) : undefined
  }));
}

export async function saveCustomLensRows(
  material: Material,
  vision: Vision,
  sign: Sign | null,
  powerType: PowerType,
  compoundLimit: string = '2.0',
  rows: CustomLensRow[],
  coatings: string[] = []
) {
  let deleteQuery = supabase
    .from('custom_lens_rows')
    .delete()
    .eq('material', material)
    .eq('vision', vision)
    .eq('power_type', powerType)
    .eq('compound_limit', compoundLimit)
    .filter('coatings', 'eq', `{${coatings.join(',')}}`);

  if (sign === null) {
    deleteQuery = deleteQuery.is('sign', null);
  } else {
    deleteQuery = deleteQuery.eq('sign', sign);
  }

  const { error: deleteError } = await deleteQuery;

  if (deleteError) {
    console.error('Error deleting old custom lens rows:', deleteError);
    return { error: deleteError };
  }

  const inserts = rows.map((row, index) => ({
    material,
    vision,
    sign,
    power_type: powerType,
    compound_limit: compoundLimit,
    coatings,
    sph: parseFloat(row.sph),
    cyl: parseFloat(row.cyl),
    addition: row.add ? parseFloat(row.add) : null,
    sort_order: index
  }));

  const { error: insertError } = await supabase
    .from('custom_lens_rows')
    .insert(inserts);

  if (insertError) {
    console.error('Error inserting custom lens rows:', insertError);
    return { error: insertError };
  }

  return { success: true };
}

export function generateLensRows(powerType: PowerType, compoundLimit: string = '2.0', vision: Vision = 'single vision', sign: Sign | null = null) {
  const rows: CustomLensRow[] = [];
  const isKT = vision === 'KT';
  const isProg = vision === 'Prograssive';
  const isKTOrProg = isKT || isProg;

  const adds = isKTOrProg ? generatePowerList(false, 3.0).filter(p => parseFloat(p) >= 1.0) : [undefined];

  if (powerType === 'SPH') {
    const sphMax = isKT ? 3.0 : 6.0;
    const sphs = generatePowerList(true, sphMax);
    sphs.forEach(s => {
      if (parseFloat(s) === 0 && sign === '+') {
        return;
      }
      adds.forEach(add => {
        rows.push({ sph: s, cyl: '0.00', add });
      });
    });
  } else if (powerType === 'CYL') {
    const cyls = generatePowerList(false, 2.0);
    cyls.forEach(c => {
      adds.forEach(add => {
        rows.push({ sph: '0.00', cyl: c, add });
      });
    });
  } else if (powerType === 'Compound' || powerType === 'Cross Compound') {
    let cylStart = 0.25;
    let cylEnd = 2.0;

    if (compoundLimit === '4.0' && !isKTOrProg) {
      cylStart = 2.25;
      cylEnd = 4.0;
    }

    const sphMax = isKT ? 3.0 : 6.0;

    for (let s = 0.25; s <= sphMax; s += 0.25) {
      for (let c = cylStart; c <= cylEnd; c += 0.25) {
        if (powerType === 'Cross Compound' && s === 0.25 && c === 0.25) continue;

        adds.forEach(add => {
          rows.push({
            sph: s.toFixed(2),
            cyl: c.toFixed(2),
            add
          });
        });
      }
    }
  }

  return rows;
}

export function getDefaultAxis(vision: Vision, sign: Sign | null, powerType: PowerType): number | undefined {
  if (vision !== 'KT') return undefined;
  if (powerType === 'SPH') return undefined;

  if (sign === '+') return 180;
  if (sign === '-') return 90;

  return undefined;
}

export function formatLensName(
  material: Material,
  vision: Vision,
  sign: Sign | null,
  powerType: PowerType,
  sph: string,
  cyl: string,
  coatings: string[],
  axis?: number,
  add?: string
) {
  const isSV = vision === 'single vision';
  const isKT = vision === 'KT';
  const isProg = vision === 'Prograssive';

  const materialPart = material === 'CR' ? '' : material;
  const visionPart = isSV ? '' : vision;
  const coatingPart = coatings.join(' ');

  let powerPart = '';
  const signPart = sign || '';

  if (sph === '0.00' && powerType === 'SPH') {
    powerPart = `Plano`;
  } else if (powerType === 'SPH') {
    powerPart = `${signPart}${sph} SPH`;
  } else if (powerType === 'CYL') {
    powerPart = `${signPart}${cyl} CYL`;
  } else if (powerType === 'Compound') {
    powerPart = `${signPart}${sph}/${signPart}${cyl}`;
  } else if (powerType === 'Cross Compound') {
    const oppSign = sign === '+' ? '-' : '+';
    powerPart = `${signPart}${sph}/${oppSign}${cyl}`;
  }

  let addPart = '';
  if (add && (isKT || isProg)) {
    addPart = `ADD +${parseFloat(add).toFixed(2)}`;
  }

  let axisPart = '';
  if ((powerType !== 'SPH') && (isKT || isProg)) {
    axisPart = axis ? `AXIS ${axis}` : '';
  }

  return [powerPart, addPart, axisPart, coatingPart, materialPart, visionPart]
    .filter(part => part !== '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const KT_AXIS = [45, 90, 135, 180];
export const PROGRESSIVE_AXIS = [30, 60, 90, 120, 150, 180];

export function formatReportQty(qty: number): string {
  const whole = Math.floor(qty);
  const frac = qty % 1;
  
  if (frac === 0.5) {
    const wholePart = whole > 0 ? `${whole} ` : '';
    return `${wholePart}<span class="frac"><span>1</span><span class="bottom">2</span></span>`;
  }
  
  return qty.toString();
}

export function sortLensNames(a: string, b: string): number {
  const getScores = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.startsWith('plano')) return [-1, 0];

    const matches = name.match(/[+-]?\d+\.\d+/g);
    if (matches) {
      return matches.map(m => Math.abs(parseFloat(m)));
    }
    return [999];
  };

  const scoresA = getScores(a);
  const scoresB = getScores(b);

  for (let i = 0; i < Math.max(scoresA.length, scoresB.length); i++) {
    const valA = scoresA[i] !== undefined ? scoresA[i] : -1;
    const valB = scoresB[i] !== undefined ? scoresB[i] : -1;
    if (valA !== valB) return valA - valB;
  }

  return a.localeCompare(b);
}

export function parseLensName(name: string): ParsedLens | null {
  if (!name || typeof name !== 'string') return null;
  let text = name.trim();

  let vision: Vision = 'single vision';
  if (/\bPrograssive\b/i.test(text)) {
    vision = 'Prograssive';
    text = text.replace(/\bPrograssive\b/i, '');
  } else if (/\bKT\b/i.test(text)) {
    vision = 'KT';
    text = text.replace(/\bKT\b/i, '');
  }

  let material: Material = 'CR';
  if (/\bGlass\b/i.test(text)) {
    material = 'Glass';
    text = text.replace(/\bGlass\b/i, '');
  } else if (/\bPoly\b/i.test(text)) {
    material = 'Poly';
    text = text.replace(/\bPoly\b/i, '');
  }

  let add: string | undefined = undefined;
  const addMatch = text.match(/\bADD \+?(\d+\.\d+)\b/i);
  if (addMatch) {
    add = parseFloat(addMatch[1]).toFixed(2);
    text = text.replace(addMatch[0], '');
  }

  let axis: number | undefined = undefined;
  const axisMatch = text.match(/\bAXIS (\d+)\b/i);
  if (axisMatch) {
    axis = parseInt(axisMatch[1], 10);
    text = text.replace(axisMatch[0], '');
  }

  let powerType: PowerType | null = null;
  let sign: Sign = '-';
  let sph = '0.00';
  let cyl = '0.00';

  if (/\bPlano\b/i.test(text)) {
    powerType = 'SPH';
    sign = '-';
    sph = '0.00';
    cyl = '0.00';
    text = text.replace(/\bPlano\b/i, '');
  } else {
    const sphMatch = text.match(/([+-])(\d+\.\d+)\s+SPH\b/i);
    const cylMatch = text.match(/([+-])(\d+\.\d+)\s+CYL\b/i);
    const compoundMatch = text.match(/([+-])(\d+\.\d+)\/([+-])(\d+\.\d+)/);

    if (sphMatch) {
      powerType = 'SPH';
      sign = sphMatch[1] as Sign;
      sph = parseFloat(sphMatch[2]).toFixed(2);
      cyl = '0.00';
      text = text.replace(sphMatch[0], '');
    } else if (cylMatch) {
      powerType = 'CYL';
      sign = cylMatch[1] as Sign;
      sph = '0.00';
      cyl = parseFloat(cylMatch[2]).toFixed(2);
      text = text.replace(cylMatch[0], '');
    } else if (compoundMatch) {
      const s1 = compoundMatch[1] as Sign;
      const sphVal = parseFloat(compoundMatch[2]).toFixed(2);
      const s2 = compoundMatch[3] as Sign;
      const cylVal = parseFloat(compoundMatch[4]).toFixed(2);

      if (s1 === s2) {
        powerType = 'Compound';
        sign = s1;
      } else {
        powerType = 'Cross Compound';
        sign = s1;
      }
      sph = sphVal;
      cyl = cylVal;
      text = text.replace(compoundMatch[0], '');
    }
  }

  if (!powerType) return null;

  const knownCoatings = ['Photo Grey', 'Bluecut Dual coat', 'Bluecut Blue', 'Bluecut', 'HMC', 'HC'];
  const foundCoatings: string[] = [];
  let coatingText = text.trim();

  for (const c of knownCoatings) {
    const regex = new RegExp(`\\b${c.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'gi');
    if (regex.test(coatingText)) {
      foundCoatings.push(c);
      coatingText = coatingText.replace(regex, '').trim();
    }
  }

  const extraWords = coatingText.split(/\s+/).filter(Boolean);
  if (extraWords.length > 0) {
    foundCoatings.push(extraWords.join(' '));
  }

  const coatings = foundCoatings.length > 0 ? foundCoatings : ['HC'];
  const compoundLimit = parseFloat(cyl) > 2.0 ? '4.0' : '2.0';

  return {
    material,
    vision,
    sign,
    powerType,
    sph,
    cyl,
    axis,
    add,
    coatings,
    compoundLimit
  };
}

export async function isStockLens(parsed: ParsedLens | null): Promise<boolean> {
  if (!parsed) return false;
  let custom = await fetchCustomLensRows(
    parsed.material,
    parsed.vision,
    parsed.sign,
    parsed.powerType,
    parsed.compoundLimit,
    parsed.coatings
  );
  if (!custom) {
    custom = generateLensRows(parsed.powerType, parsed.compoundLimit, parsed.vision, parsed.sign);
  }
  if (parsed.sign === '+' && parsed.powerType === 'SPH') {
    custom = custom.filter(row => parseFloat(row.sph) !== 0);
  }

  const sphVal = parseFloat(parsed.sph).toFixed(2);
  const cylVal = parseFloat(parsed.cyl).toFixed(2);
  const addVal = parsed.add ? parseFloat(parsed.add).toFixed(2) : undefined;

  return custom.some(row => {
    const rowSph = parseFloat(row.sph).toFixed(2);
    const rowCyl = parseFloat(row.cyl).toFixed(2);
    const rowAdd = row.add ? parseFloat(row.add).toFixed(2) : undefined;
    return rowSph === sphVal && rowCyl === cylVal && rowAdd === addVal;
  });
}
