import assert from "node:assert/strict";
import { test } from "vitest";

import {
    VIDEO_GENERATION_TIMEOUT_MESSAGE,
    VIDEO_GENERATION_TIMEOUT_MS,
    VideoGenerationTimeoutError,
    assertVideoGenerationActive,
    remainingVideoGenerationTime,
} from "./video-generation-timeout.ts";

test("video generation remains active until the 30 minute deadline", () => {
    const startedAt = 1_000;

    assert.equal(remainingVideoGenerationTime(startedAt, startedAt + VIDEO_GENERATION_TIMEOUT_MS - 1), 1);
    assert.doesNotThrow(() => assertVideoGenerationActive(startedAt, startedAt + VIDEO_GENERATION_TIMEOUT_MS - 1));
});

test("video generation ends exactly at the 30 minute deadline", () => {
    const startedAt = 1_000;

    assert.throws(
        () => assertVideoGenerationActive(startedAt, startedAt + VIDEO_GENERATION_TIMEOUT_MS),
        (error) => error instanceof VideoGenerationTimeoutError
            && error.message === VIDEO_GENERATION_TIMEOUT_MESSAGE,
    );
});

test("remaining video generation time never becomes negative", () => {
    const startedAt = 1_000;

    assert.equal(remainingVideoGenerationTime(startedAt, startedAt + VIDEO_GENERATION_TIMEOUT_MS + 60_000), 0);
});
