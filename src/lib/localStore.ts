import type { Transaction } from '@/types';

const DATABASE_NAME = 'rozana-hisaab-local';
const DATABASE_VERSION = 2;
const PENDING_TRANSACTIONS_STORE = 'pending-transactions';
const PENDING_MEDIA_STORE = 'pendingMedia';
const TRANSACTIONS_CACHE_STORE = 'transactionsCache';
const LEGACY_MIGRATION_ID = 'legacy-idb-keyval-migrated';
const LEGACY_MEDIA_TEMP_STORE = '__legacy_pending_media_upgrade';
const LEGACY_PENDING_PREFIX = 'rozana_pending_transactions_';
const FALLBACK_PREFIX = 'rozana_local_store_';
const FALLBACK_BLOB_MARKER = '__rozana_local_store_blob__';

type StoreName =
  | typeof PENDING_TRANSACTIONS_STORE
  | typeof PENDING_MEDIA_STORE
  | typeof TRANSACTIONS_CACHE_STORE;

interface StoredRecord<T> {
  id: string;
  value: T;
}

let databasePromise: Promise<IDBDatabase> | null = null;

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

export interface PendingMedia {
  id: string;
  type: 'voice' | 'receipt';
  blob: Blob;
  mimeType: string;
  createdAt: string;
  status: 'pending_ai' | 'processing' | 'done' | 'failed';
  attempts: number;
  userId: string;
  error?: string;
  errorKind?: 'auth' | 'limit' | 'too_large' | 'invalid' | 'server' | 'network';
  nextRetryAt?: string;
  transaction?: Transaction;
}

function getDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is unavailable.'));
  }
  if (databasePromise) return databasePromise;

  const opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const upgradeTransaction = request.transaction;
      if (!db.objectStoreNames.contains(PENDING_TRANSACTIONS_STORE)) {
        db.createObjectStore(PENDING_TRANSACTIONS_STORE, { keyPath: 'id' });
      }
      if (
        upgradeTransaction &&
        db.objectStoreNames.contains(PENDING_MEDIA_STORE) &&
        upgradeTransaction.objectStore(PENDING_MEDIA_STORE).keyPath !== 'id'
      ) {
        if (!db.objectStoreNames.contains(LEGACY_MEDIA_TEMP_STORE)) {
          db.createObjectStore(LEGACY_MEDIA_TEMP_STORE, { keyPath: 'id' });
        }
        const previousStore = upgradeTransaction.objectStore(PENDING_MEDIA_STORE);
        const temporaryStore = upgradeTransaction.objectStore(LEGACY_MEDIA_TEMP_STORE);
        const legacyCursor = previousStore.openCursor();
        legacyCursor.onsuccess = () => {
          const cursor = legacyCursor.result;
          if (cursor) {
            temporaryStore.put({ id: String(cursor.primaryKey), value: cursor.value });
            cursor.continue();
            return;
          }

          db.deleteObjectStore(PENDING_MEDIA_STORE);
          const mediaStore = db.createObjectStore(PENDING_MEDIA_STORE, { keyPath: 'id' });
          const temporaryCursor = temporaryStore.openCursor();
          temporaryCursor.onsuccess = () => {
            const temporaryRecord = temporaryCursor.result;
            if (temporaryRecord) {
              mediaStore.put(temporaryRecord.value);
              temporaryRecord.continue();
              return;
            }
            db.deleteObjectStore(LEGACY_MEDIA_TEMP_STORE);
          };
        };
      } else if (!db.objectStoreNames.contains(PENDING_MEDIA_STORE)) {
        db.createObjectStore(PENDING_MEDIA_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(TRANSACTIONS_CACHE_STORE)) {
        db.createObjectStore(TRANSACTIONS_CACHE_STORE, { keyPath: 'id' });
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
  const pendingDatabase = opening.catch((error: unknown) => {
    databasePromise = null;
    throw error;
  });
  databasePromise = pendingDatabase;

  return pendingDatabase;
}

function runTransaction<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  makeRequest: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(storeName, mode);
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

async function serializeFallbackValue(value: unknown): Promise<unknown> {
  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return {
      [FALLBACK_BLOB_MARKER]: true,
      type: value.type,
      data: await blobToDataUrl(value),
    };
  }
  if (Array.isArray(value)) {
    return Promise.all(value.map(serializeFallbackValue));
  }
  if (typeof value === 'object' && value !== null) {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, nestedValue]) => [
        key,
        await serializeFallbackValue(nestedValue),
      ] as const),
    );
    return Object.fromEntries(entries);
  }
  return value;
}

async function deserializeFallbackValue(value: unknown): Promise<unknown> {
  if (Array.isArray(value)) {
    return Promise.all(value.map(deserializeFallbackValue));
  }
  if (typeof value === 'object' && value !== null) {
    if (
      FALLBACK_BLOB_MARKER in value &&
      value[FALLBACK_BLOB_MARKER] === true &&
      'data' in value &&
      'type' in value &&
      typeof value.data === 'string' &&
      typeof value.type === 'string'
    ) {
      const [header, encoded] = value.data.split(',', 2);
      if (!header?.includes(';base64') || encoded === undefined) {
        throw new Error('Invalid local media fallback encoding.');
      }
      const binary = atob(encoded);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      return new Blob([bytes], { type: value.type });
    }
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, nestedValue]) => [
        key,
        await deserializeFallbackValue(nestedValue),
      ] as const),
    );
    return Object.fromEntries(entries);
  }
  return value;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not encode local media for storage fallback.'));
    };
    reader.onerror = () => reject(new Error('Could not encode local media for storage fallback.'));
    reader.readAsDataURL(blob);
  });
}

async function getFallback<T>(storeName: StoreName, key: string): Promise<T | undefined> {
  try {
    if (typeof localStorage === 'undefined') return undefined;
    const raw = localStorage.getItem(fallbackKey(storeName, key));
    if (raw === null) return undefined;
    return await deserializeFallbackValue(JSON.parse(raw)) as T;
  } catch (error) {
    console.warn(`Could not read ${storeName} from localStorage fallback:`, error);
    return undefined;
  }
}

async function setFallback<T>(storeName: StoreName, key: string, value: T): Promise<void> {
  if (typeof localStorage === 'undefined') {
    throw new Error('Neither IndexedDB nor localStorage is available.');
  }
  const serialized = JSON.stringify(await serializeFallbackValue(value));
  localStorage.setItem(fallbackKey(storeName, key), serialized);
}

function keysFromFallback(storeName: StoreName): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const prefix = `${FALLBACK_PREFIX}${storeName}_`;
    const found: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix)) {
        found.push(decodeURIComponent(key.slice(prefix.length)));
      }
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
  return await getFallback<T>(storeName, key);
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
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(fallbackKey(storeName, key));
    }
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
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(fallbackKey(storeName, key));
    }
  } catch (error) {
    console.warn(`Could not delete ${storeName} from localStorage fallback:`, error);
  }
}

async function readKeys(storeName: StoreName): Promise<string[]> {
  let indexedKeys: string[] = [];
  try {
    const db = await getDatabase();
    indexedKeys = await runTransaction<IDBValidKey[]>(
      db,
      storeName,
      'readonly',
      (store) => store.getAllKeys(),
    ).then((keys) => keys.map(String));
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
    (store) => store.put({
      id: LEGACY_MIGRATION_ID,
      value: true,
    } satisfies StoredRecord<boolean>),
  );
}

async function migrateLegacyPendingQueue(): Promise<void> {
  let legacyKeys: string[];
  try {
    if (typeof localStorage === 'undefined') return;
    legacyKeys = [];
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
    if (!Array.isArray(parsed)) {
      throw new Error(`Invalid legacy pending transaction queue for user ${userId}`);
    }
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
      await writeRecord(
        PENDING_TRANSACTIONS_STORE,
        operationKey(userId, candidate.id),
        operation,
      );
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

export async function getPendingTransactionOperations(
  userId: string,
): Promise<PendingTransactionOperation[]> {
  await migrateLegacyPendingQueue();
  const records: PendingTransactionOperation[] = [];
  for (const key of await readKeys(PENDING_TRANSACTIONS_STORE)) {
    const operation = await readRecord<PendingTransactionOperation>(
      PENDING_TRANSACTIONS_STORE,
      key,
    );
    if (operation?.userId === userId) records.push(operation);
  }
  return records;
}

export async function clearPendingTransactionOperations(userId: string): Promise<void> {
  await migrateLegacyPendingQueue();
  for (const key of await readKeys(PENDING_TRANSACTIONS_STORE)) {
    const operation = await readRecord<PendingTransactionOperation>(
      PENDING_TRANSACTIONS_STORE,
      key,
    );
    if (operation?.userId === userId) await deleteRecord(PENDING_TRANSACTIONS_STORE, key);
  }
}

export async function setPendingTransactionOperation(
  operation: PendingTransactionOperation,
): Promise<void> {
  await migrateLegacyPendingQueue();
  await writeRecord(
    PENDING_TRANSACTIONS_STORE,
    operationKey(operation.userId, operation.id),
    operation,
  );
}

export async function deletePendingTransactionOperation(
  userId: string,
  id: string,
): Promise<void> {
  await migrateLegacyPendingQueue();
  await deleteRecord(PENDING_TRANSACTIONS_STORE, operationKey(userId, id));
}

export async function getPendingMedia(): Promise<PendingMedia[]> {
  const records: PendingMedia[] = [];
  for (const key of await readKeys(PENDING_MEDIA_STORE)) {
    const item = await readRecord<PendingMedia>(PENDING_MEDIA_STORE, key);
    if (
      item &&
      typeof item.id === 'string' &&
      item.id === key &&
      typeof Blob !== 'undefined' &&
      item.blob instanceof Blob &&
      item.blob.size > 0 &&
      (item.type === 'voice' || item.type === 'receipt') &&
      typeof item.createdAt === 'string' &&
      typeof item.userId === 'string' &&
      ['pending_ai', 'processing', 'done', 'failed'].includes(item.status) &&
      Number.isFinite(item.attempts)
    ) {
      records.push(item);
    } else {
      console.warn(`Removing invalid pending-media record ${key}.`);
      await deleteRecord(PENDING_MEDIA_STORE, key);
    }
  }
  return records;
}

export async function getPendingMediaForUser(userId: string): Promise<PendingMedia[]> {
  return (await getPendingMedia()).filter((item) => item.userId === userId);
}

export async function setPendingMedia(item: PendingMedia): Promise<void> {
  await writeRecord(PENDING_MEDIA_STORE, item.id, item);
}

export async function deletePendingMedia(id: string): Promise<void> {
  await deleteRecord(PENDING_MEDIA_STORE, id);
}

export async function deleteAllPendingMedia(): Promise<void> {
  for (const key of await readKeys(PENDING_MEDIA_STORE)) {
    await deleteRecord(PENDING_MEDIA_STORE, key);
  }
}
