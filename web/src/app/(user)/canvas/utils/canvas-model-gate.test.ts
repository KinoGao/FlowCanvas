import assert from "node:assert/strict";
import { test } from "vitest";

import {
    CAPABILITY_KEYS,
    DEFAULT_FEATURE_CAPABILITY_FLAGS,
    mergeFeatureCapabilities,
    resolveFeatureAvailability,
} from "./canvas-model-gate";

test("resolves to default (unavailable) when neither backend nor frontend provides a flag", () => {
    const result = resolveFeatureAvailability(undefined, undefined, "asr");
    assert.deepEqual(result, { available: false, source: "default" });
});

test("backend flag takes effect when no frontend override exists", () => {
    const result = resolveFeatureAvailability({ asr: true }, undefined, "asr");
    assert.deepEqual(result, { available: true, source: "backend" });
});

test("frontend override wins over backend flag", () => {
    const result = resolveFeatureAvailability({ asr: true }, { asr: false }, "asr");
    assert.deepEqual(result, { available: false, source: "frontend" });
});

test("an empty backend payload (model not wired) degrades to unavailable without throwing", () => {
    // 后端未接入时 fetch 优雅降级为 {}，不应让它误判某个功能可用。
    const result = mergeFeatureCapabilities({}, undefined);
    for (const key of CAPABILITY_KEYS) assert.equal(result[key], DEFAULT_FEATURE_CAPABILITY_FLAGS[key]);
    assert.equal(result["runninghub_app"], false);
});

test("merge combines backend and frontend per-key", () => {
    const merged = mergeFeatureCapabilities({ asr: true }, { asr: false, video_keying: true });
    assert.equal(merged["asr"], false); // frontend overrides
    assert.equal(merged["video_keying"], true); // frontend only
    assert.equal(merged["matting"], false); // default
});
