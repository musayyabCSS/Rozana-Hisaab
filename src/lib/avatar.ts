const MAX_AVATAR_SIZE = 2 * 1024 * 1024;

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
