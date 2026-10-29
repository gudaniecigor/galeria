// Zmniejsza zdjęcia poza głównym wątkiem strony, żeby przewijanie nie przycinało.
// Jedno dekodowanie pliku daje od razu kilka rozmiarów (miniatura + duży podgląd).

function targetSize(width, height, { short, long }) {
  let scale = 1;
  if (short) scale = Math.min(scale, short / Math.min(width, height));
  if (long) scale = Math.min(scale, long / Math.max(width, height));
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)), scale];
}

self.onmessage = async ({ data: { id, blob, outputs } }) => {
  let source;
  try {
    source = await createImageBitmap(blob);
  } catch {
    self.postMessage({ id, error: 'decode' });
    return;
  }
  try {
    const results = [];
    for (const output of outputs) {
      const [width, height, scale] = targetSize(source.width, source.height, output);
      if (scale === 1) {
        results.push(blob);
        continue;
      }
      const resized = await createImageBitmap(source, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#1a1a1e';
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(resized, 0, 0, width, height);
      resized.close();
      results.push(await canvas.convertToBlob({ type: 'image/jpeg', quality: output.quality }));
    }
    self.postMessage({ id, blobs: results });
  } catch (err) {
    self.postMessage({ id, error: 'worker', message: String(err) });
  } finally {
    source.close();
  }
};
