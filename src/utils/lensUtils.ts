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

export function generatePowerList() {
  const powers = [];
  for (let i = 0; i <= 10; i += 0.25) {
    powers.push(i.toFixed(2));
  }
  return powers;
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

  if (powerType === 'SPH') {
    powerPart = `${signPart}${sph} SPH`;
  } else if (powerType === 'CYL') {
    powerPart = `${signPart}${cyl} CYL`;
  } else if (powerType === 'Compound') {
    powerPart = `${signPart}${sph}/${signPart}${cyl}`;
  } else if (powerType === 'Cross Compound') {
    const oppSign = sign === '+' ? '-' : '+';
    powerPart = `${signPart}${sph}/${oppSign}${cyl}`;
  }

  // Handle zero power
  if (sph === '0.00' && powerType === 'SPH') {
    powerPart = `0.00 SPH`;
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
