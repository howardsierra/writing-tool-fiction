/**
 * Downscales and re-encodes an image data URL as JPEG so it fits comfortably
 * inside a Firestore document (1 MiB limit).
 */
export async function compressImage(src: string, maxSize = 1024, quality = 0.82): Promise<string> {
  if (!src.startsWith('data:')) return src;
  const img = new Image();
  img.src = src;
  await img.decode();
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return src;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  let out = canvas.toDataURL('image/jpeg', quality);
  // Keep shrinking until under ~450KB (leaves room for text and snapshots).
  let q = quality;
  while (out.length > 450_000 && q > 0.35) {
    q -= 0.12;
    out = canvas.toDataURL('image/jpeg', q);
  }
  return out;
}
