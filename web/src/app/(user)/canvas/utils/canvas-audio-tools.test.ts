import assert from "node:assert/strict";
import { test } from "vitest";

import { audioEditOutputDuration, audioEditRate, normalizeAudioEditRange } from "./canvas-audio-tools";

test("normalizes audio edit ranges with a minimum duration", () => {
    assert.deepEqual(normalizeAudioEditRange(1, 4, 10), { start: 1, end: 4 });
    assert.deepEqual(normalizeAudioEditRange(8, 2, 10), { start: 2, end: 8 });
    assert.equal(normalizeAudioEditRange(9.9, 9.95, 10), null);
});

test("clamps audio speed to supported bounds", () => {
    assert.equal(audioEditRate(0.1), 0.25);
    assert.equal(audioEditRate(2), 2);
    assert.equal(audioEditRate(9), 4);
});

test("computes output duration after trim and speed", () => {
    assert.equal(audioEditOutputDuration(1, 5, 2), 2);
    assert.equal(audioEditOutputDuration(0, 1, 1), 1);
});
