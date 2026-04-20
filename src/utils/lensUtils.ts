export type Material = 'CR' | 'Poly' | 'Glass';
export type Vision = 'single vision' | 'KT' | 'Prograssive';
export type PowerType = 'SPH' | 'CYL' | 'Compound' | 'Cross Compound';
export type Sign = '+' | '-';

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

export function generateLensRows(powerType: PowerType, compoundLimit: string = '2.0') {
  const rows: { sph: string, cyl: string }[] = [];

  if (powerType === 'SPH') {
    const sphs = generatePowerList(true);
    sphs.forEach(s => rows.push({ sph: s, cyl: '0.00' }));
  } else if (powerType === 'CYL') {
    const cyls = generatePowerList(false);
    cyls.forEach(c => rows.push({ sph: '0.00', cyl: c }));
  } else if (powerType === 'Compound' || powerType === 'Cross Compound') {
    let cylStart = 0.25;
    let cylEnd = 2.0;

    if (compoundLimit === '4.0') {
      cylStart = 2.25;
      cylEnd = 4.0;
    }

    for (let s = 0.25; s <= 6.0; s += 0.25) {
      for (let c = cylStart; c <= cylEnd; c += 0.25) {
        rows.push({
          sph: s.toFixed(2),
          cyl: c.toFixed(2)
        });
      }
    }
  }

  return rows;
}

export function formatLensName(
  material: Material,
  vision: Vision,
  sign: Sign | null,
  powerType: PowerType,
  sph: string,
  cyl: string,
  coatings: string[],
  axis?: number
) {
  const materialPart = material === 'CR' ? '' : material;
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

  let axisPart = '';
  if ((powerType === 'CYL' || powerType === 'Compound' || powerType === 'Cross Compound') && (vision === 'KT' || vision === 'Prograssive')) {
    axisPart = axis ? ` AXIS ${axis}` : '';
  }

  return [powerPart, materialPart, axisPart, coatingPart]
    .filter(part => part !== null && part !== undefined && part !== '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const KT_AXIS = [45, 90, 135, 180];
export const PROGRESSIVE_AXIS = [30, 60, 90, 120, 150, 180];
