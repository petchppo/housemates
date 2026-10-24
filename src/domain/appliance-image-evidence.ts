export type ApplianceImageEvidence = {
  version: 1;
  width: number;
  height: number;
  dominantColorFraction: number;
  colorEntropyBits: number;
};

/** Pixel evidence, not object identity, OCR, or a photograph-authenticity detector. */
export function analyzeApplianceImage(image: { data: ArrayLike<number>; width: number; height: number; channels: number }): ApplianceImageEvidence {
  const { width, height, channels, data } = image;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 512 || height > 512 ||
      ![3, 4].includes(channels) || !data || data.length !== width * height * channels) {
    throw new RangeError("Image evidence requires a complete RGB/RGBA image no larger than 512 pixels per dimension.");
  }
  const histogram = new Uint32Array(4096);
  const pixels = width * height;
  for (let offset = 0; offset < data.length; offset += channels) {
    for (let channel = 0; channel < channels; channel++) {
      const value = data[offset + channel];
      if (!Number.isInteger(value) || value < 0 || value > 255) throw new RangeError("Image pixels must be bytes.");
    }
    const alpha = channels === 4 ? data[offset + 3] / 255 : 1;
    const red = Math.round(data[offset] * alpha + 255 * (1 - alpha)) >> 4;
    const green = Math.round(data[offset + 1] * alpha + 255 * (1 - alpha)) >> 4;
    const blue = Math.round(data[offset + 2] * alpha + 255 * (1 - alpha)) >> 4;
    histogram[red * 256 + green * 16 + blue]++;
  }
  let largest = 0, colorEntropyBits = 0;
  for (const count of histogram) {
    if (!count) continue;
    const fraction = count / pixels;
    largest = Math.max(largest, count);
    colorEntropyBits -= fraction * Math.log2(fraction);
  }
  return { version: 1, width, height, dominantColorFraction: largest / pixels, colorEntropyBits };
}

/** Revalidate worker messages and allowlist metrics before using them in the UI. */
export function validateApplianceImageEvidence(raw: unknown): ApplianceImageEvidence | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (value.version !== 1 || !Number.isInteger(value.width) || !Number.isInteger(value.height) ||
      (value.width as number) < 1 || (value.width as number) > 512 || (value.height as number) < 1 || (value.height as number) > 512 ||
      typeof value.dominantColorFraction !== "number" || !Number.isFinite(value.dominantColorFraction) || value.dominantColorFraction <= 0 || value.dominantColorFraction > 1 ||
      typeof value.colorEntropyBits !== "number" || !Number.isFinite(value.colorEntropyBits) || value.colorEntropyBits < 0 || value.colorEntropyBits > 12 ||
      value.dominantColorFraction < 1 / Math.min(4096, (value.width as number) * (value.height as number))) return null;
  return { version: 1, width: value.width as number, height: value.height as number,
    dominantColorFraction: value.dominantColorFraction, colorEntropyBits: value.colorEntropyBits };
}
