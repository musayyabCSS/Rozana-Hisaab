const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const MAX_COMPRESSED_AVATAR_BYTES = 100 * 1024;
const MAX_AVATAR_DIMENSION = 512;

const AVATAR_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function getAvatarFileExtension(file: File): string | null {
  return AVATAR_EXTENSIONS[file.type] ?? null;
}

export function validateAvatarFile(file: File): string | null {
  if (!getAvatarFileExtension(file)) {
    return 'Choose a JPEG, PNG, or WebP image.';
  }
  if (file.size >= MAX_AVATAR_SIZE) {
    return 'Choose an image smaller than 2 MB.';
  }
  return null;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode the selected profile photo.'));
    image.src = url;
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Could not compress the selected profile photo.')),
      'image/jpeg',
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not save the compressed profile photo.'));
    };
    reader.onerror = () => reject(new Error('Could not save the compressed profile photo.'));
    reader.readAsDataURL(blob);
  });
}

export async function compressAvatarToDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error('The selected profile photo has invalid dimensions.');
    }

    let scale = Math.min(
      1,
      MAX_AVATAR_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
    );
    for (let resizeAttempt = 0; resizeAttempt < 6; resizeAttempt += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not prepare the profile photo for compression.');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      for (let quality = 0.85; quality >= 0.25; quality -= 0.1) {
        const compressed = await canvasToJpeg(canvas, quality);
        if (compressed.size <= MAX_COMPRESSED_AVATAR_BYTES) {
          const dataUrl = await blobToDataUrl(compressed);
          if (dataUrl.length <= MAX_COMPRESSED_AVATAR_BYTES) return dataUrl;
        }
      }
      scale *= 0.75;
    }
    throw new Error('The profile photo could not be compressed below 100 KB.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
