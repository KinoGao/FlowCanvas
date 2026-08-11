import assert from "node:assert/strict";
import { test } from "vitest";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../types.ts";
import { buildComposerConfirmation, buildGenerationConfirmation, buildNodeGenerationContext, type NodeGenerationContext } from "./canvas-node-generation.ts";

const textNode: CanvasNodeData = {
    id: "text-1",
    type: CanvasNodeType.Text,
    title: "上游文本",
    position: { x: 0, y: 0 },
    width: 320,
    height: 180,
    metadata: { content: "space station interior, astronaut floating slowly" },
};

const connection: CanvasConnection = { id: "edge-1", fromNodeId: textNode.id, toNodeId: "target-1" };

function targetNode(composerContent = ""): CanvasNodeData {
    return {
        id: "target-1",
        type: CanvasNodeType.Config,
        title: "配置节点",
        position: { x: 500, y: 0 },
        width: 320,
        height: 180,
        metadata: { composerContent },
    };
}

function context(overrides: Partial<NodeGenerationContext> = {}): NodeGenerationContext {
    return {
        prompt: "一只在月光下的白鹤",
        inputs: [],
        referenceImages: [],
        referenceVideos: [],
        referenceAudios: [],
        textCount: 0,
        imageCount: 0,
        videoCount: 0,
        audioCount: 0,
        ...overrides,
    };
}

test("formats an image confirmation with ratio and keeps the requested count", () => {
    const result = buildGenerationConfirmation(context(), {
        modelLabel: "SDXL · 通用生图",
        count: 4,
        aspectRatio: "16:9",
    });

    assert.equal(result.mediaSpec, "比例 16:9");
    assert.equal(result.modelLabel, "SDXL · 通用生图");
    assert.equal(result.count, 4);
});

test("formats a video confirmation with ratio and duration combined", () => {
    const result = buildGenerationConfirmation(context(), {
        modelLabel: "Seedance 2.0",
        count: 1,
        aspectRatio: "9:16",
        durationSeconds: 5,
    });

    assert.equal(result.mediaSpec, "比例 9:16 · 时长 5 秒");
    assert.equal(result.count, 1);
});

test("clamps count into the 1..15 range and falls back to 1 for invalid values", () => {
    assert.equal(buildGenerationConfirmation(context(), { modelLabel: "m", count: 0 }).count, 1);
    assert.equal(buildGenerationConfirmation(context(), { modelLabel: "m", count: 99 }).count, 15);
    assert.equal(buildGenerationConfirmation(context(), { modelLabel: "m", count: Number.NaN }).count, 1);
});

test("leaves mediaSpec empty when neither ratio nor duration is present", () => {
    const result = buildGenerationConfirmation(context(), { modelLabel: "m", count: 2 });

    assert.equal(result.mediaSpec, "");
});

test("maps reference inputs with per-kind labels and falls back to the label for empty titles", () => {
    const result = buildGenerationConfirmation(
        context({
            inputs: [
                { nodeId: "img-1", type: "image", title: "主视觉", image: { id: "img-1", name: "a.png", type: "image/png", dataUrl: "" } },
                { nodeId: "txt-1", type: "text", title: "", text: "旁白" },
                { nodeId: "vid-1", type: "video", title: "实拍素材", video: { id: "vid-1", name: "b.mp4", type: "video/mp4", url: "" } },
            ],
        }),
        { modelLabel: "m", count: 1 },
    );

    assert.deepEqual(result.references, [
        { nodeId: "img-1", kind: "image", label: "图片1", title: "主视觉" },
        { nodeId: "txt-1", kind: "text", label: "文本1", title: "文本1" },
        { nodeId: "vid-1", kind: "video", label: "视频1", title: "实拍素材" },
    ]);
});

test("keeps the exact prompt that the shared generation context would consume", () => {
    const result = buildGenerationConfirmation(context({ prompt: "夜景城市航拍，缓慢推进" }), { modelLabel: "m", count: 1 });

    assert.equal(result.prompt, "夜景城市航拍，缓慢推进");
});

test("keeps one label when a visible text mention is repeated", () => {
    const result = buildNodeGenerationContext(
        "target-1",
        [textNode, targetNode()],
        [connection],
        "【文本1】 【文本1】 cold teal-blue color grade",
    );

    assert.equal(result.prompt, "cold teal-blue color grade\n\n【文本1】\nspace station interior, astronaut floating slowly");
    assert.equal(result.prompt.match(/【文本1】/g)?.length, 1);
});

test("keeps one label when the same composer text token appears twice", () => {
    const result = buildNodeGenerationContext(
        "target-1",
        [textNode, targetNode("@[node:text-1]")],
        [connection],
        "@[node:text-1] @[node:text-1] cold teal-blue color grade",
    );

    assert.equal(result.prompt, "cold teal-blue color grade\n\n【文本1】\nspace station interior, astronaut floating slowly");
    assert.equal(result.prompt.match(/【文本1】/g)?.length, 1);
});

// ── buildComposerConfirmation（Composer 手动确认卡片的数据来源） ──────────────

const composerSource = {
    model: "channel::sd-xl",
    modelLabel: "SDXL · 通用生图",
    count: "4",
    size: "16:9",
    videoSeconds: "5",
};

const composerReferences = [
    { nodeId: "img-1", kind: "image" as const, label: "图片1", title: "主视觉", active: true },
    { nodeId: "txt-1", kind: "text" as const, label: "文本1", title: "旁白", active: true },
    { nodeId: "vid-2", kind: "video" as const, label: "视频2", title: "实拍素材", active: false },
];

test("image composer confirmation uses ratio and count from the source config", () => {
    const result = buildComposerConfirmation("image", "一只在月光下的白鹤", composerSource, composerReferences);

    assert.equal(result.modelLabel, "SDXL · 通用生图");
    assert.equal(result.mediaSpec, "比例 16:9");
    assert.equal(result.count, 4);
});

test("video composer confirmation combines ratio and duration", () => {
    const result = buildComposerConfirmation("video", "镜头缓慢推进", composerSource, composerReferences);

    assert.equal(result.mediaSpec, "比例 16:9 · 时长 5 秒");
});

test("composer confirmation only lists active references", () => {
    const result = buildComposerConfirmation("image", "prompt", composerSource, composerReferences);

    assert.deepEqual(result.references.map((ref) => ref.nodeId), ["img-1", "txt-1"]);
});

test("text composer confirmation has no media spec and defaults count to 1", () => {
    const result = buildComposerConfirmation("text", "旁白", { ...composerSource, count: "0" }, []);

    assert.equal(result.mediaSpec, "");
    assert.equal(result.count, 1);
});
