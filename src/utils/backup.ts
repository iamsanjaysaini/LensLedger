import { supabase } from '../lib/supabase';
import { DEFAULT_COATINGS } from './lensUtils';

export type Row = Record<string, unknown>;

// Insert order (parents first). Delete order is the reverse, without shops.
export const TABLES = ['shops', 'lens_stock', 'custom_lens_rows', 'orders', 'sales', 'alert_ignores'] as const;
export type TableName = (typeof TABLES)[number];
export type Counts = Record<TableName, number>;

export interface BackupFile {
  app: string;
  format_version: number;
  exported_at: string;
  counts: Counts;
  tables: Record<TableName, Row[]>;
  local: { availableCoatings: string[] };
}

export const BACKUP_APP = 'LensLedger';
export const BACKUP_VERSION = 1;
export const LAST_BACKUP_KEY = 'lastBackupAt'; // only a timestamp is stored, never data
export const MAX_BACKUP_FILE_BYTES = 100 * 1024 * 1024;

const COATINGS_KEY = 'availableCoatings';
const PAGE_SIZE = 1000;
const CHUNK_SIZE = 500;
const DELETE_ORDER: TableName[] = ['alert_ignores', 'sales', 'orders', 'custom_lens_rows', 'lens_stock'];

// Columns of the live database (from information_schema). Anything else in a file is rejected.
const ALLOWED_COLUMNS: Record<TableName, readonly string[]> = {
  shops: ['id', 'name', 'created_at'],
  lens_stock: [
    'id', 'shop_id', 'material', 'vision', 'sign', 'power_type', 'sph', 'cyl', 'axis',
    'coatings', 'quantity', 'updated_at', 'addition', 'alert_qty', 'alert_status',
  ],
  custom_lens_rows: [
    'id', 'shop_id', 'material', 'vision', 'sign', 'power_type', 'coatings', 'rows', 'created_at',
    'updated_at', 'compound_limit', 'addition', 'axis', 'user_id', 'name', 'cyl', 'sph', 'sort_order',
    'label', 'min_sph', 'max_sph', 'min_cyl', 'max_cyl', 'step', 'is_active',
  ],
  orders: ['id', 'shop_id', 'lens_details', 'quantity', 'created_at', 'stock_updated'],
  sales: [
    'id', 'shop_id', 'lens_details', 'quantity', 'created_at', 'material', 'vision', 'sign',
    'power_type', 'sph', 'cyl', 'axis', 'addition', 'coatings',
  ],
  alert_ignores: ['id', 'shop_id', 'material', 'vision', 'sign', 'power_type', 'coatings', 'created_at'],
};

// NOT NULL columns without a default: a file missing these would fail after old data is deleted.
const REQUIRED_COLUMNS: Record<TableName, readonly string[]> = {
  shops: ['id', 'name'],
  lens_stock: ['id', 'material', 'vision', 'power_type'],
  custom_lens_rows: ['id', 'material', 'vision', 'power_type', 'sort_order'],
  orders: ['id', 'lens_details', 'quantity'],
  sales: ['id', 'lens_details', 'quantity'],
  alert_ignores: ['id'],
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
export const sumCounts = (c: Counts) => TABLES.reduce((n, t) => n + c[t], 0);

const pad = (n: number) => String(n).padStart(2, '0');
export const dateStamp = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const timeStamp = (d = new Date()) =>
  `${dateStamp(d)}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;

export async function requireSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error('Aap logged in nahi hain. Dobara login karke try karein.');
}

export function getCurrentCoatings(): string[] {
  try {
    const raw = localStorage.getItem(COATINGS_KEY);
    if (!raw) return [...DEFAULT_COATINGS];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((c): c is string => typeof c === 'string')
      : [...DEFAULT_COATINGS];
  } catch {
    return [...DEFAULT_COATINGS];
  }
}

export function saveCoatings(list: string[]): boolean {
  try {
    localStorage.setItem(COATINGS_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

async function fetchAllRows(table: TableName): Promise<Row[]> {
  const rows: Row[] = [];
  let total: number | null = null;
  while (total === null || rows.length < total) {
    const from = rows.length;
    const { data, error, count } = await supabase
      .from(table)
      .select('*', { count: 'exact' })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (total === null) {
      if (count === null) throw new Error(`${table}: row count nahi mili.`);
      total = count;
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as Row[]));
  }
  if (total === null || rows.length !== total) {
    throw new Error(`${table}: ${total ?? '?'} rows honi chahiye thi, par ${rows.length} mili (data beech mein badal gaya ho sakta hai).`);
  }
  if (new Set(rows.map((r) => r.id)).size !== rows.length) {
    throw new Error(`${table}: duplicate rows mili (data beech mein badal gaya). Dobara try karein.`);
  }
  return rows;
}

export async function buildBackup(onStatus?: (msg: string) => void): Promise<BackupFile> {
  const tables = {} as Record<TableName, Row[]>;
  const counts = {} as Counts;
  for (const t of TABLES) {
    onStatus?.(`Download ho raha hai: ${t}...`);
    try {
      tables[t] = await fetchAllRows(t);
    } catch (e) {
      throw new Error(`Table "${t}" poori nahi aayi. ${errMsg(e)}`);
    }
    counts[t] = tables[t].length;
  }
  return {
    app: BACKUP_APP,
    format_version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    counts,
    tables,
    local: { availableCoatings: getCurrentCoatings() },
  };
}

export function downloadBackup(file: BackupFile, filename: string) {
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Uploaded JSON is untrusted: only known tables/columns are read, everything else is rejected.
export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('File valid JSON nahi hai.');
  }
  if (!isObj(raw)) throw new Error('File ka format galat hai.');
  if (raw.app !== BACKUP_APP) throw new Error('Ye LensLedger ki backup file nahi hai.');
  if (raw.format_version !== BACKUP_VERSION) {
    throw new Error(`Backup format version "${String(raw.format_version)}" support nahi hai (sirf ${BACKUP_VERSION}).`);
  }
  if (typeof raw.exported_at !== 'string' || Number.isNaN(Date.parse(raw.exported_at))) {
    throw new Error('File mein backup ki date (exported_at) galat ya missing hai.');
  }
  if (!isObj(raw.tables)) throw new Error('File mein "tables" nahi hai.');

  const tables = {} as Record<TableName, Row[]>;
  const counts = {} as Counts;
  const rawCounts = isObj(raw.counts) ? raw.counts : null;

  for (const t of TABLES) {
    const arr = raw.tables[t];
    if (!Array.isArray(arr)) throw new Error(`Table "${t}" file mein nahi hai (file adhoori hai).`);
    const allowed = new Set(ALLOWED_COLUMNS[t]);
    const seen = new Set<string>();
    arr.forEach((r, i) => {
      const where = `${t} row ${i + 1}`;
      if (!isObj(r)) throw new Error(`${where}: row ka format galat hai.`);
      for (const k of Object.keys(r)) {
        if (!allowed.has(k)) throw new Error(`${where}: anjaan column "${k}" (database mein aisa column nahi hai).`);
      }
      for (const k of REQUIRED_COLUMNS[t]) {
        if (r[k] === undefined || r[k] === null) throw new Error(`${where}: zaroori column "${k}" missing hai.`);
      }
      if (typeof r.id !== 'string' || !UUID_RE.test(r.id)) throw new Error(`${where}: id galat hai.`);
      if (seen.has(r.id)) throw new Error(`${where}: duplicate id.`);
      seen.add(r.id);
      if (r.shop_id !== undefined && r.shop_id !== null && (typeof r.shop_id !== 'string' || !UUID_RE.test(r.shop_id))) {
        throw new Error(`${where}: shop_id galat hai.`);
      }
    });
    if (rawCounts && rawCounts[t] !== arr.length) {
      throw new Error(`Table "${t}": file ke metadata mein ${String(rawCounts[t])} rows likhi hain par asal mein ${arr.length} hain (file adhoori ya edit ki hui hai).`);
    }
    tables[t] = arr as Row[];
    counts[t] = arr.length;
  }

  if (tables.shops.length === 0) throw new Error('File mein koi shop nahi hai, restore nahi ho sakta.');
  const shopIds = new Set(tables.shops.map((s) => s.id));
  for (const t of TABLES) {
    if (t === 'shops') continue;
    tables[t].forEach((r, i) => {
      if (typeof r.shop_id === 'string' && !shopIds.has(r.shop_id)) {
        throw new Error(`${t} row ${i + 1}: shop_id file ki shops mein nahi hai.`);
      }
    });
  }

  const local = raw.local;
  const list = isObj(local) ? local.availableCoatings : undefined;
  if (
    !Array.isArray(list) || list.length > 200 ||
    !list.every((c) => typeof c === 'string' && c.trim().length > 0 && c.length <= 100)
  ) {
    throw new Error('File mein coatings ki list galat ya missing hai.');
  }

  return {
    app: BACKUP_APP,
    format_version: BACKUP_VERSION,
    exported_at: raw.exported_at,
    counts,
    tables,
    local: { availableCoatings: list as string[] },
  };
}

export async function getDbCounts(): Promise<Counts> {
  const counts = {} as Counts;
  for (const t of TABLES) {
    const { count, error } = await supabase.from(t).select('id', { count: 'exact', head: true });
    if (error) throw new Error(`${t}: ${error.message}`);
    counts[t] = count ?? 0;
  }
  return counts;
}

export interface RestorePreview {
  dbCounts: Counts;
  extraShops: string[];
  lostCoatings: string[];
}

export async function loadPreview(file: BackupFile): Promise<RestorePreview> {
  const dbCounts = await getDbCounts();
  const { data, error } = await supabase.from('shops').select('id, name');
  if (error) throw new Error(`shops: ${error.message}`);
  const fileIds = new Set(file.tables.shops.map((s) => s.id));
  const extraShops = ((data ?? []) as { id: string; name: string }[])
    .filter((s) => !fileIds.has(s.id))
    .map((s) => s.name);
  const inFile = new Set(file.local.availableCoatings);
  const lostCoatings = getCurrentCoatings().filter((c) => !inFile.has(c));
  return { dbCounts, extraShops, lostCoatings };
}

export class RestoreError extends Error {
  stage: string;
  touchedDb: boolean;
  deleted: TableName[];
  inserted: Partial<Record<TableName, number>>;

  constructor(
    message: string,
    stage: string,
    state: { touchedDb: boolean; deleted: TableName[]; inserted: Partial<Record<TableName, number>> }
  ) {
    super(message);
    this.stage = stage;
    this.touchedDb = state.touchedDb;
    this.deleted = [...state.deleted];
    this.inserted = { ...state.inserted };
  }

  report(): string {
    const lines = [`Restore beech mein fail hua. Step: ${this.stage}. Error: ${this.message}`];
    if (!this.touchedDb) {
      lines.push('Database mein abhi kuch nahi badla.');
      return lines.join('\n');
    }
    lines.push(`Purana data hata hua: ${this.deleted.length ? this.deleted.join(', ') : 'koi poori table nahi (fail hone wali table adhoori ho sakti hai)'}.`);
    const ins = Object.entries(this.inserted).map(([t, n]) => `${t} (${n} rows)`).join(', ');
    lines.push(`File ka data ab tak gaya hai: ${ins || 'kuch nahi'}.`);
    lines.push('Kya karein: Stock/Order/Sell mein kuch na badlein. Restore dobara chalayein (usi file se, ya download hui "LensLedger-pre-restore-..." file se). Restore har baar purana data hata kar poori file daalta hai, isliye dobara chalana safe hai.');
    return lines.join('\n');
  }
}

export async function restoreBackup(
  file: BackupFile,
  onProgress: (p: { label: string; percent: number }) => void
): Promise<void> {
  const state = { touchedDb: false, deleted: [] as TableName[], inserted: {} as Partial<Record<TableName, number>> };
  const fail = (stage: string, msg: string) => new RestoreError(msg, stage, state);

  // Pre-check (nothing is deleted yet): shops.name is UNIQUE, so a same-name shop with another id would break the upsert.
  {
    const { data, error } = await supabase.from('shops').select('id, name');
    if (error) throw fail('Pre-check: shops', error.message);
    const dbShops = (data ?? []) as { id: string; name: string }[];
    for (const s of file.tables.shops) {
      const clash = dbShops.find((d) => d.name === s.name && d.id !== s.id);
      if (clash) throw fail('Pre-check: shops', `Shop "${String(s.name)}" database mein pehle se doosri id ke saath hai. Pehle us shop ko app se theek karein.`);
    }
  }

  const totalUnits =
    DELETE_ORDER.length + TABLES.reduce((n, t) => n + Math.ceil(file.tables[t].length / CHUNK_SIZE), 0);
  let doneUnits = 0;
  const tick = (label: string) => {
    onProgress({ label, percent: Math.round((doneUnits / totalUnits) * 100) });
  };

  for (const t of DELETE_ORDER) {
    tick(`Purana data hata raha hai: ${t}`);
    state.touchedDb = true;
    const { error } = await supabase.from(t).delete().not('id', 'is', null);
    if (error) throw fail(`Delete: ${t}`, error.message);
    // RLS can silently delete nothing, so verify the table is really empty.
    const { count, error: cErr } = await supabase.from(t).select('id', { count: 'exact', head: true });
    if (cErr) throw fail(`Delete check: ${t}`, cErr.message);
    if (count) throw fail(`Delete: ${t}`, `${count} rows delete nahi hui (permission/RLS ka masla ho sakta hai).`);
    state.deleted.push(t);
    doneUnits++;
  }

  for (const t of TABLES) {
    const rows = file.tables[t];
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const end = i + chunk.length;
      tick(`File ka data daal raha hai: ${t} (${end}/${rows.length})`);
      state.touchedDb = true;
      const { error } =
        t === 'shops'
          ? await supabase.from(t).upsert(chunk, { onConflict: 'id', defaultToNull: false })
          : await supabase.from(t).insert(chunk, { defaultToNull: false });
      if (error) throw fail(`Insert: ${t} (rows ${i + 1}-${end})`, error.message);
      state.inserted[t] = end;
      doneUnits++;
    }
    if (rows.length === 0) state.inserted[t] = 0;
  }

  tick('Check ho raha hai...');
  const after = await getDbCounts().catch((e) => {
    throw fail('Final check', errMsg(e));
  });
  for (const t of TABLES) {
    if (t !== 'shops' && after[t] !== file.tables[t].length) {
      throw fail('Final check', `${t}: ${file.tables[t].length} rows honi chahiye thi, par ${after[t]} hain.`);
    }
  }
  onProgress({ label: 'Poora hua', percent: 100 });
}
