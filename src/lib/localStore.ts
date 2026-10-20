import { createStore, del, get, keys, set } from 'idb-keyval';
import type { Transaction } from '@/types';

const pendingTransactionsStore = createStore('rozana-hisaab-local', 'pendingTransactions');
const pendingMediaStore = createStore('rozana-hisaab-local', 'pendingMedia');
const MIGRATION_KEY = 'legacy-pending-transactions-migrated';
const LEGACY_PENDING_PREFIX = 'rozana_pending_transactions_';

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

function operationKey(userId: string, id: string): string {
  return `${userId}:${id}`;
}

async function migrateLegacyPendingQueue(): Promise<void> {
  if (await get<boolean>(MIGRATION_KEY, pendingTransactionsStore)) return;
  if (typeof localStorage === 'undefined') {
    await set(MIGRATION_KEY, true, pendingTransactionsStore);
    return;
  }

  const legacyKeys: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(LEGACY_PENDING_PREFIX)) legacyKeys.push(key);
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
      await set(operationKey(userId, candidate.id), operation, pendingTransactionsStore);
    }
    localStorage.removeItem(key);
  }

  await set(MIGRATION_KEY, true, pendingTransactionsStore);
}

export async function getPendingTransactionOperations(
  userId: string,
): Promise<PendingTransactionOperation[]> {
  await migrateLegacyPendingQueue();
  const records: PendingTransactionOperation[] = [];
  for (const key of await keys(pendingTransactionsStore)) {
    const operation = await get<PendingTransactionOperation>(key, pendingTransactionsStore);
    if (operation?.userId === userId) records.push(operation);
  }
  return records;
}

export async function clearPendingTransactionOperations(userId: string): Promise<void> {
  await migrateLegacyPendingQueue();
  for (const key of await keys(pendingTransactionsStore)) {
    const operation = await get<PendingTransactionOperation>(key, pendingTransactionsStore);
    if (operation?.userId === userId) await del(key, pendingTransactionsStore);
  }
}

export async function setPendingTransactionOperation(
  operation: PendingTransactionOperation,
): Promise<void> {
  await migrateLegacyPendingQueue();
  await set(operationKey(operation.userId, operation.id), operation, pendingTransactionsStore);
}

export async function deletePendingTransactionOperation(
  userId: string,
  id: string,
): Promise<void> {
  await migrateLegacyPendingQueue();
  await del(operationKey(userId, id), pendingTransactionsStore);
}

export async function getPendingMedia(): Promise<PendingMedia[]> {
  const records: PendingMedia[] = [];
  for (const key of await keys(pendingMediaStore)) {
    const item = await get<PendingMedia>(key, pendingMediaStore);
    if (item) records.push(item);
  }
  return records;
}

export async function getPendingMediaForUser(userId: string): Promise<PendingMedia[]> {
  return (await getPendingMedia()).filter((item) => item.userId === userId);
}

export async function setPendingMedia(item: PendingMedia): Promise<void> {
  await set(item.id, item, pendingMediaStore);
}

export async function deletePendingMedia(id: string): Promise<void> {
  await del(id, pendingMediaStore);
}

export async function deleteAllPendingMedia(): Promise<void> {
  for (const key of await keys(pendingMediaStore)) {
    await del(key, pendingMediaStore);
  }
}
