/** Fit a character's bounding sphere inside both camera axes, with breathing room. */
export function cameraFocusDistance(radius: number, verticalFovDegrees: number, aspect: number): number {
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(aspect) || aspect <= 0 ||
      !Number.isFinite(verticalFovDegrees) || verticalFovDegrees <= 0 || verticalFovDegrees >= 180) {
    throw new RangeError("Camera focus requires positive finite bounds and a valid perspective field of view.");
  }
  const halfVertical = verticalFovDegrees * Math.PI / 360;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect);
  return radius / Math.sin(Math.min(halfVertical, halfHorizontal)) * 1.22;
}

/** Frame-rate-independent arrival, or an immediate pose for reduced motion. */
export function cameraFocusProgress(elapsedMs: number, reducedMotion = false): number {
  if (!Number.isFinite(elapsedMs)) throw new RangeError("Camera transition time must be finite.");
  if (reducedMotion) return 1;
  const progress = Math.max(0, Math.min(1, elapsedMs / 650));
  return 1 - (1 - progress) ** 3;
}
