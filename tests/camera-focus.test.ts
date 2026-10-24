import assert from "node:assert/strict";
import test from "node:test";
import { cameraFocusDistance, cameraFocusProgress } from "../src/domain/camera-focus";

test("focused character sphere fits both viewport axes across phone, tablet and landscape", () => {
  for (const [width, height, fov] of [[1280, 420, 36], [768, 500, 36], [390, 440, 48], [320, 440, 48], [844, 240, 36]]) {
    for (const radius of [.45, .9, 1.3, 1.8]) {
      const distance = cameraFocusDistance(radius, fov, width / height);
      const apparentRadius = Math.asin(radius / distance);
      const verticalHalfAngle = fov * Math.PI / 360;
      const horizontalHalfAngle = Math.atan(Math.tan(verticalHalfAngle) * width / height);
      assert.ok(Number.isFinite(distance) && distance > radius, `${width}×${height}: camera outside character`);
      assert.ok(apparentRadius < verticalHalfAngle, `${width}×${height}: vertical clearance`);
      assert.ok(apparentRadius < horizontalHalfAngle, `${width}×${height}: horizontal clearance`);
    }
  }
});

test("focus framing responds to character size and the constrained viewport dimension", () => {
  const reference = cameraFocusDistance(1, 36, 1);
  assert.ok(Math.abs(cameraFocusDistance(2, 36, 1) - 2 * reference) < 1e-10);
  assert.ok(cameraFocusDistance(1, 36, .5) > reference, "portrait width needs more distance");
  assert.equal(cameraFocusDistance(1, 36, 2), reference, "extra landscape width does not shrink vertical clearance");
  assert.ok(cameraFocusDistance(1, 48, 1) < reference, "wider field of view can move closer");
});

test("camera interpolation settles monotonically without overshoot and reduced motion skips animation", () => {
  const times = [-100, 0, 16, 80, 160, 325, 500, 649, 650, 1000, 60000];
  const progress = times.map(time => cameraFocusProgress(time));
  assert.equal(progress[0], 0);
  assert.equal(progress[1], 0);
  assert.equal(cameraFocusProgress(650), 1);
  assert.equal(progress.at(-1), 1);
  for (let i = 1; i < progress.length; i++) {
    assert.ok(progress[i] >= progress[i - 1] && progress[i] <= 1 && progress[i] >= 0);
  }
  assert.ok(cameraFocusProgress(325) > .5, "ease-out is ahead of linear progress midway");
  assert.equal(cameraFocusProgress(0, true), 1);
  assert.equal(cameraFocusProgress(160, true), 1);
});

test("invalid camera geometry and clocks fail instead of producing NaN transforms", () => {
  for (const radius of [0, -1, NaN, Infinity]) assert.throws(() => cameraFocusDistance(radius, 36, 1));
  for (const fov of [0, -1, 180, 200, NaN, Infinity]) assert.throws(() => cameraFocusDistance(1, fov, 1));
  for (const aspect of [0, -1, NaN, Infinity]) assert.throws(() => cameraFocusDistance(1, 36, aspect));
  for (const elapsed of [NaN, Infinity, -Infinity]) assert.throws(() => cameraFocusProgress(elapsed));
});
