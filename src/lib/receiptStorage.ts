import { del, get, set } from 'idb-keyval';

function receiptKey(transactionId: string): string {
  return `receipt_${transactionId}`;
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
  await set(receiptKey(transactionId), imageBlob);
}

export async function getReceiptImage(
  transactionId: string,
): Promise<string | null> {
  const imageBlob = await get<Blob>(receiptKey(transactionId));
  return imageBlob ? URL.createObjectURL(imageBlob) : null;
}

export async function deleteReceiptImage(transactionId: string): Promise<void> {
  await del(receiptKey(transactionId));
}
