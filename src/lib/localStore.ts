import type { Transaction } from '@/types';

const DATABASE_NAME = 'rozana-hisaab-local';
const DATABASE_VERSION = 3;
const PENDING_TRANSACTIONS_STORE = 'pending-transactions';
const TRANSACTIONS_CACHE_STORE = 'transactionsCache';
const LEGACY_MIGRATION_ID = 'legacy-idb-keyval-migrated';
const LEGACY_PENDING_PREFIX = 'rozana_pending_transactions_';
const FALLBACK_PREFIX = 'rozana_local_store_';
const LEGACY_MEDIA_PREFIXES = [
  `${FALLBACK_PREFIX}pendingMedia_`,
  'rozana_pending_media_',
  'rozana_pendingMedia_',
];

type StoreName =
  | typeof PENDING_TRANSACTIONS_STORE
  | typeof TRANSACTIONS_CACHE_STORE;

interface StoredRecord<T> {
  id: string;
  value: T;
}

export type PendingTransactionOperation =
  | {
      id: string;
      userId: string;
      operation: 'upsert';
      transaction: Transaction & { is_synced: false };
    }
  | {
      id: string;
      userId: string;
      operation: 'delete';
    }
  | {
      id: string;
      userId: string;
      operation: 'deleteAll';
    };

let databasePromise: Promise<IDBDatabase> | null = null;

function getDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable.'));
  }
  if (databasePromise) return databasePromise;

  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PENDING_TRANSACTIONS_STORE)) {
        db.createObjectStore(PENDING_TRANSACTIONS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(TRANSACTIONS_CACHE_STORE)) {
        db.createObjectStore(TRANSACTIONS_CACHE_STORE, { keyPath: 'id' });
      }
      for (const obsoleteStore of ['pendingMedia', '__legacy_pending_media_upgrade']) {
        if (db.objectStoreNames.contains(obsoleteStore)) db.deleteObjectStore(obsoleteStore);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        databasePromise = null;
        db.close();
      };
      void migrateLegacyIndexedDb(db)
        .catch((error: unknown) => {
          console.warn('Could not migrate existing local transaction data:', error);
        })
        .finally(() => resolve(db));
    };
    request.onerror = () => reject(request.error ?? new Error('Could not open the local database.'));
    request.onblocked = () => reject(new Error('The local database upgrade is blocked.'));
  });
  databasePromise = opening.catch((error: unknown) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

function runTransaction<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  makeRequest: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(storeName, mode);
      const request = makeRequest(transaction.objectStore(storeName));
      let result: T;
      let requestComplete = false;
      let transactionComplete = false;
      const finish = () => {
        if (requestComplete && transactionComplete) resolve(result);
      };
      request.onsuccess = () => {
        result = request.result;
        requestComplete = true;
        finish();
      };
      request.onerror = () => reject(request.error ?? new Error('Local database request failed.'));
      transaction.oncomplete = () => {
        transactionComplete = true;
        finish();
      };
      transaction.onabort = () => reject(transaction.error ?? new Error('Local database transaction was aborted.'));
      transaction.onerror = () => reject(transaction.error ?? new Error('Local database transaction failed.'));
    } catch (error) {
      reject(error);
    }
  });
}

function fallbackKey(storeName: StoreName, key: string): string {
  return `${FALLBACK_PREFIX}${storeName}_${encodeURIComponent(key)}`;
}

async function getFallback<T>(storeName: StoreName, key: string): Promise<T | undefined> {
  try {
    if (typeof localStorage === 'undefined') return undefined;
    const raw = localStorage.getItem(fallbackKey(storeName, key));
    return raw === null ? undefined : JSON.parse(raw) as T;
  } catch (error) {
    console.warn(`Could not read ${storeName} from localStorage fallback:`, error);
    return undefined;
  }
}

async function setFallback<T>(storeName: StoreName, key: string, value: T): Promise<void> {
  if (typeof localStorage === 'undefined') {
    throw new Error('Neither IndexedDB nor localStorage is available.');
  }
  localStorage.setItem(fallbackKey(storeName, key), JSON.stringify(value));
}

function keysFromFallback(storeName: StoreName): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const prefix = `${FALLBACK_PREFIX}${storeName}_`;
    const found: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix)) found.push(decodeURIComponent(key.slice(prefix.length)));
    }
    return found;
  } catch (error) {
    console.warn(`Could not list ${storeName} from localStorage fallback:`, error);
    return [];
  }
}

async function readRecord<T>(storeName: StoreName, key: string): Promise<T | undefined> {
  try {
    const db = await getDatabase();
    const record = await runTransaction<StoredRecord<T> | undefined>(
      db,
      storeName,
      'readonly',
      (store) => store.get(key),
    );
    if (record) return record.value;
  } catch (error) {
    console.warn(`Could not read ${storeName} from IndexedDB; using localStorage fallback:`, error);
  }
  return getFallback<T>(storeName, key);
}

async function writeRecord<T>(storeName: StoreName, key: string, value: T): Promise<void> {
  try {
    const db = await getDatabase();
    await runTransaction<IDBValidKey>(db, storeName, 'readwrite', (store) =>
      store.put({ id: key, value } satisfies StoredRecord<T>),
    );
  } catch (error) {
    console.warn(`Could not write ${storeName} to IndexedDB; using localStorage fallback:`, error);
    await setFallback(storeName, key, value);
    return;
  }
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(fallbackKey(storeName, key));
  } catch (error) {
    console.warn(`Could not clear the ${storeName} localStorage fallback:`, error);
  }
}

async function deleteRecord(storeName: StoreName, key: string): Promise<void> {
  try {
    const db = await getDatabase();
    await runTransaction<undefined>(db, storeName, 'readwrite', (store) => store.delete(key));
  } catch (error) {
    console.warn(`Could not delete ${storeName} record from IndexedDB:`, error);
  }
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(fallbackKey(storeName, key));
  } catch (error) {
    console.warn(`Could not delete ${storeName} from localStorage fallback:`, error);
  }
}

async function readKeys(storeName: StoreName): Promise<string[]> {
  let indexedKeys: string[] = [];
  try {
    const db = await getDatabase();
    indexedKeys = (await runTransaction<IDBValidKey[]>(
      db,
      storeName,
      'readonly',
      (store) => store.getAllKeys(),
    )).map(String);
  } catch (error) {
    console.warn(`Could not list ${storeName} in IndexedDB; using localStorage fallback:`, error);
  }
  return [...new Set([...indexedKeys, ...keysFromFallback(storeName)])];
}

function operationKey(userId: string, id: string): string {
  return `${userId}:${id}`;
}

async function migrateLegacyIndexedDb(db: IDBDatabase): Promise<void> {
  const migration = await runTransaction<StoredRecord<boolean> | undefined>(
    db,
    TRANSACTIONS_CACHE_STORE,
    'readonly',
    (store) => store.get(LEGACY_MIGRATION_ID),
  );
  if (migration?.value) return;

  if (db.objectStoreNames.contains('pendingTransactions')) {
    const legacyOperations = await runTransaction<unknown[]>(
      db,
      'pendingTransactions',
      'readonly',
      (store) => store.getAll(),
    );
    for (const candidate of legacyOperations) {
      if (
        typeof candidate !== 'object' ||
        candidate === null ||
        !('id' in candidate) ||
        !('userId' in candidate) ||
        typeof candidate.id !== 'string' ||
        typeof candidate.userId !== 'string'
      ) {
        console.warn('Skipping an invalid operation in the legacy IndexedDB queue.');
        continue;
      }
      const operation = candidate as PendingTransactionOperation;
      await runTransaction<IDBValidKey>(
        db,
        PENDING_TRANSACTIONS_STORE,
        'readwrite',
        (store) => store.put({
          id: operationKey(operation.userId, operation.id),
          value: operation,
        } satisfies StoredRecord<PendingTransactionOperation>),
      );
    }
  }

  await runTransaction<IDBValidKey>(
    db,
    TRANSACTIONS_CACHE_STORE,
    'readwrite',
    (store) => store.put({ id: LEGACY_MIGRATION_ID, value: true } satisfies StoredRecord<boolean>),
  );
}

async function migrateLegacyPendingQueue(): Promise<void> {
  const legacyKeys: string[] = [];
  try {
    if (typeof localStorage === 'undefined') return;
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(LEGACY_PENDING_PREFIX)) legacyKeys.push(key);
    }
  } catch (error) {
    console.warn('Could not inspect the legacy local transaction queue:', error);
    return;
  }

  for (const key of legacyKeys) {
    const userId = key.slice(LEGACY_PENDING_PREFIX.length);
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.removeItem(key);
      continue;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error(`Invalid legacy pending transaction queue for user ${userId}`);
    for (const candidate of parsed) {
      if (!isPendingTransaction(candidate)) {
        throw new Error(`Invalid unsynced transaction in legacy queue for user ${userId}`);
      }
      const operation: PendingTransactionOperation = {
        id: candidate.id,
        userId,
        operation: 'upsert',
        transaction: candidate,
      };
      await writeRecord(PENDING_TRANSACTIONS_STORE, operationKey(userId, candidate.id), operation);
    }
    localStorage.removeItem(key);
  }
}

function isPendingTransaction(value: unknown): value is Transaction & { is_synced: false } {
  if (typeof value !== 'object' || value === null) return false;
  const transaction = value as Partial<Transaction>;
  return (
    typeof transaction.id === 'string' &&
    transaction.is_synced === false &&
    typeof transaction.type === 'string' &&
    typeof transaction.amount === 'number' &&
    typeof transaction.category === 'string' &&
    typeof transaction.title === 'string' &&
    typeof transaction.transaction_date === 'string'
  );
}

export async function clearLegacyPendingMedia(): Promise<void> {
  try {
    if (typeof localStorage !== 'undefined') {
      const obsoleteKeys: string[] = [];
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (key && LEGACY_MEDIA_PREFIXES.some((prefix) => key.startsWith(prefix))) {
          obsoleteKeys.push(key);
        }
      }
      obsoleteKeys.forEach((key) => localStorage.removeItem(key));
    }
  } catch (error) {
    console.warn('Could not clear old pending-media localStorage records:', error);
  }
  await getDatabase();
}

export async function getPendingTransactionOperations(
  userId: string,
): Promise<PendingTransactionOperation[]> {
  await migrateLegacyPendingQueue();
  const records: PendingTransactionOperation[] = [];
  for (const key of await readKeys(PENDING_TRANSACTIONS_STORE)) {
    const operation = await readRecord<PendingTransactionOperation>(PENDING_TRANSACTIONS_STORE, key);
    if (operation?.userId === userId) records.push(operation);
  }
  return records;
}

export async function clearPendingTransactionOperations(userId: string): Promise<void> {
  await migrateLegacyPendingQueue();
  for (const key of await readKeys(PENDING_TRANSACTIONS_STORE)) {
    const operation = await readRecord<PendingTransactionOperation>(PENDING_TRANSACTIONS_STORE, key);
    if (operation?.userId === userId) await deleteRecord(PENDING_TRANSACTIONS_STORE, key);
  }
}

export async function setPendingTransactionOperation(
  operation: PendingTransactionOperation,
): Promise<void> {
  await migrateLegacyPendingQueue();
  await writeRecord(PENDING_TRANSACTIONS_STORE, operationKey(operation.userId, operation.id), operation);
}

export async function deletePendingTransactionOperation(userId: string, id: string): Promise<void> {
  await migrateLegacyPendingQueue();
  await deleteRecord(PENDING_TRANSACTIONS_STORE, operationKey(userId, id));
}
