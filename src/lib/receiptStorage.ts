import { del, get, keys, set } from 'idb-keyval';

function receiptKey(transactionId: string): string {
  return `receipt_${transactionId}`;
}

function receiptAliasKey(transactionId: string): string {
  return `rozana_receipt_alias_${transactionId}`;
}

function resolveReceiptId(transactionId: string): string {
  try {
    return localStorage.getItem(receiptAliasKey(transactionId)) ?? transactionId;
  } catch (error) {
    console.error('Error resolving receipt transaction ID:', error);
    return transactionId;
  }
}

export async function saveReceiptImage(
  transactionId: string,
  dataUrl: string,
): Promise<void> {
  if (!dataUrl.startsWith('data:image/')) {
    throw new Error('Receipt image must be an image data URL.');
  }

  const response = await fetch(dataUrl);
  if (!response.ok) {
    throw new Error(`Could not convert receipt image to Blob (${response.status}).`);
  }

  const imageBlob = await response.blob();
  await saveReceiptBlob(transactionId, imageBlob);
}

export async function saveReceiptBlob(
  transactionId: string,
  imageBlob: Blob,
): Promise<void> {
  if (!imageBlob.type.startsWith('image/')) {
    throw new Error('Receipt photo must be an image Blob.');
  }
  await set(receiptKey(resolveReceiptId(transactionId)), imageBlob);
}

export async function getReceiptImage(
  transactionId: string,
): Promise<string | null> {
  const imageBlob = await get<Blob>(receiptKey(resolveReceiptId(transactionId)));
  return imageBlob ? URL.createObjectURL(imageBlob) : null;
}

export async function deleteReceiptImage(transactionId: string): Promise<void> {
  await del(receiptKey(resolveReceiptId(transactionId)));
}

export async function moveReceiptImage(
  oldTransactionId: string,
  newTransactionId: string,
): Promise<void> {
  const oldKey = receiptKey(oldTransactionId);
  const imageBlob = await get<Blob>(oldKey);
  if (imageBlob) {
    await set(receiptKey(newTransactionId), imageBlob);
    await del(oldKey);
  }

  try {
    localStorage.setItem(receiptAliasKey(oldTransactionId), newTransactionId);
  } catch (error) {
    console.error('Error saving receipt transaction ID mapping:', error);
  }
}

export async function deleteAllReceiptImages(): Promise<void> {
  for (const key of await keys()) {
    if (typeof key === 'string' && key.startsWith('receipt_')) {
      await del(key);
    }
  }
  if (typeof localStorage === 'undefined') return;
  const aliases: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith('rozana_receipt_alias_')) aliases.push(key);
  }
  aliases.forEach((key) => localStorage.removeItem(key));
}
