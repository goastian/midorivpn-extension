const PKCE_KEY_PREFIX = 'midori_pkce_transaction_v1:';
const LEGACY_KEYS = ['pkce_state', 'pkce_verifier'];
const PKCE_TTL_MS = 15 * 60 * 1000;
const MAX_PKCE_TRANSACTIONS = 8;

interface PkceTransaction {
  verifier: string;
  created_at: number;
}

type StorageArea = {
  get: (keys: string | string[] | null) => Promise<Record<string, unknown>>;
  set: (values: Record<string, unknown>) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
};

function transactionKey(state: string): string {
  return `${PKCE_KEY_PREFIX}${state}`;
}

function storageAreas(): StorageArea[] {
  if (typeof chrome === 'undefined' || !chrome.storage) return [];
  const areas: StorageArea[] = [];
  if (chrome.storage.session) areas.push(chrome.storage.session as StorageArea);
  if (chrome.storage.local) areas.push(chrome.storage.local as StorageArea);
  return areas;
}

function validTransaction(value: unknown, now: number): value is PkceTransaction {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PkceTransaction>;
  return typeof candidate.verifier === 'string' && candidate.verifier.length >= 43 &&
    typeof candidate.created_at === 'number' && Number.isFinite(candidate.created_at) &&
    candidate.created_at <= now && now - candidate.created_at <= PKCE_TTL_MS;
}

async function pruneTransactions(area: StorageArea, now: number): Promise<void> {
  const stored = await area.get(null);
  const transactions = Object.entries(stored)
    .filter(([key]) => key.startsWith(PKCE_KEY_PREFIX))
    .map(([key, value]) => ({ key, value }));
  const invalid = transactions
    .filter(({ value }) => !validTransaction(value, now))
    .map(({ key }) => key);
  const valid = transactions
    .filter(({ value }) => validTransaction(value, now))
    .sort((left, right) => {
      const age = (right.value as PkceTransaction).created_at -
        (left.value as PkceTransaction).created_at;
      return age || left.key.localeCompare(right.key);
    });
  const excess = valid.slice(MAX_PKCE_TRANSACTIONS).map(({ key }) => key);
  const removals = [...invalid, ...excess];
  if (removals.length > 0) await area.remove(removals);
}

export async function storePkceTransaction(
  state: string,
  verifier: string,
  now = Date.now(),
): Promise<void> {
  const areas = storageAreas();
  if (areas.length === 0) throw new Error('Browser storage is unavailable');

  const key = transactionKey(state);
  const value: PkceTransaction = { verifier, created_at: now };
  let stored = false;
  for (const area of areas) {
    try {
      await area.set({ [key]: value });
      await pruneTransactions(area, now);
      stored = true;
    } catch {
      // A browser can expose session storage without making it writable in
      // every extension context. Local storage remains the durable fallback.
    }
  }
  if (!stored) throw new Error('Unable to persist the OAuth transaction');
}

export async function loadPkceTransaction(
  state: string,
  now = Date.now(),
): Promise<string | null> {
  const key = transactionKey(state);
  for (const area of storageAreas()) {
    try {
      const stored = await area.get(key);
      const value = stored?.[key];
      if (validTransaction(value, now)) return value.verifier;
      if (value !== undefined) await area.remove(key);
    } catch {
      // Try the next storage area.
    }
  }

  // One-release compatibility for an OAuth flow started by 2.0.0 before this
  // migration. It is consumed only when its state matches exactly.
  for (const area of storageAreas()) {
    try {
      const legacy = await area.get(LEGACY_KEYS);
      if (legacy.pkce_state === state && typeof legacy.pkce_verifier === 'string') {
        return legacy.pkce_verifier;
      }
    } catch {
      // Try the next storage area.
    }
  }
  return null;
}

export async function consumePkceTransaction(state: string): Promise<void> {
  const keys = [transactionKey(state), ...LEGACY_KEYS];
  await Promise.allSettled(storageAreas().map((area) => area.remove(keys)));
}

export async function clearPkceTransactions(): Promise<void> {
  await Promise.all(storageAreas().map(async (area) => {
    const stored = await area.get(null);
    const keys = Object.keys(stored).filter(key => key.startsWith(PKCE_KEY_PREFIX) || LEGACY_KEYS.includes(key));
    if (keys.length) await area.remove(keys);
  }));
}

export { MAX_PKCE_TRANSACTIONS, PKCE_KEY_PREFIX, PKCE_TTL_MS };
