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

export const MATERIALS: Material[] = ['CR', 'Poly', 'Glass'];
export const VISIONS: Vision[] = ['single vision', 'KT', 'Prograssive'];
export const DEFAULT_COATINGS = ['HC', 'HMC', 'Bluecut green', 'Bluecut Dual coat', 'Bluecut Blue', 'Photo Grey'];

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
  compoundLimit: string = '2.0'
): Promise<CustomLensRow[] | null> {
  let query = supabase
    .from('custom_lens_rows')
    .select('sph, cyl, addition')
    .eq('material', material)
    .eq('vision', vision)
    .eq('power_type', powerType)
    .eq('compound_limit', compoundLimit);

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
  rows: CustomLensRow[]
) {
  // First delete existing rows for this configuration
  let deleteQuery = supabase
    .from('custom_lens_rows')
    .delete()
    .eq('material', material)
    .eq('vision', vision)
    .eq('power_type', powerType)
    .eq('compound_limit', compoundLimit);

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

  // Insert new rows
  const inserts = rows.map((row, index) => ({
    material,
    vision,
    sign,
    power_type: powerType,
    compound_limit: compoundLimit,
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

export function generateLensRows(powerType: PowerType, compoundLimit: string = '2.0', vision: Vision = 'single vision') {
  const rows: CustomLensRow[] = [];
  const isKT = vision === 'KT';
  const isProg = vision === 'Prograssive';
  const isKTOrProg = isKT || isProg;

  const adds = isKTOrProg ? generatePowerList(false, 3.0).filter(p => parseFloat(p) >= 1.0) : [undefined];

  if (powerType === 'SPH') {
    const sphMax = isKT ? 3.0 : 6.0;
    const sphs = generatePowerList(true, sphMax);
    sphs.forEach(s => {
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

  // Special handle for 0.00
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

  // Formatting: <Power> <ADD> <Axis> <Coating> <Material> <Vision>
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
  let res = '';

  if (whole > 0) {
    res = whole.toString();
  }

  if (frac === 0.5) {
    if (res !== '') res += ' ';
    res += '1/2';
  }

  if (res === '') res = '0';

  return res;
}

export function sortLensNames(a: string, b: string): number {
  const getScores = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.startsWith('plano')) return [-1, 0];

    // Extract numeric values (e.g. -0.75 or 0.25 or -0.25/-0.50)
    const matches = name.match(/[+-]?\d+\.\d+/g);
    if (matches) {
      // Use absolute values to match stock list order (0.00, 0.25, 0.50...)
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
