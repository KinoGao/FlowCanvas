import assert from "node:assert/strict";
import { test } from "vitest";

import {
    lerpPanoramaCameraSnapshot,
    resolvePanoramaDuration,
    samplePanoramaCameraPath,
    type PanoramaCameraKeyframe,
} from "./canvas-panorama-scene";

const a: PanoramaCameraKeyframe = { id: "a", time: 0, snapshot: { fov: 50, position: [0, 1.5, 4], target: [0, 1, 0] } };
const b: PanoramaCameraKeyframe = { id: "b", time: 4, snapshot: { fov: 60, position: [0, 2, 8], target: [0, 1.2, 0] } };

test("lerps camera snapshot at midpoint", () => {
    const result = lerpPanoramaCameraSnapshot(a.snapshot, b.snapshot, 0.5);
    assert.equal(result.fov, 55);
    assert.deepEqual(result.position, [0, 1.75, 6]);
    assert.deepEqual(result.target, [0, 1.1, 0]);
});

test("clamps t outside [0,1]", () => {
    assert.deepEqual(lerpPanoramaCameraSnapshot(a.snapshot, b.snapshot, -1).position, a.snapshot.position);
    assert.deepEqual(lerpPanoramaCameraSnapshot(a.snapshot, b.snapshot, 2).position, b.snapshot.position);
});

test("samples the path across keyframes", () => {
    assert.deepEqual(samplePanoramaCameraPath([a, b], 0), a.snapshot);
    assert.deepEqual(samplePanoramaCameraPath([a, b], 4), b.snapshot);
    const mid = samplePanoramaCameraPath([a, b], 2);
    assert.equal(mid.fov, 55);
});

test("falls back to default snapshot when empty and resolves duration", () => {
    assert.equal(samplePanoramaCameraPath([], 0).fov, 50);
    assert.equal(resolvePanoramaDuration([]), 6);
    assert.equal(resolvePanoramaDuration([a, b]), 6);
    const long = { id: "c", time: 12, snapshot: b.snapshot };
    assert.equal(resolvePanoramaDuration([a, long]), 12);
});
