import assert from "node:assert/strict";
import { test } from "vitest";

import { buildScriptAiPrompt, buildScriptBeatPrompt, parseScriptAiResponse } from "./canvas-script-ai";

const SAMPLE_JSON = JSON.stringify({
    assets: [
        { kind: "character", name: "林小雨", description: "20 岁女大学生，白色连衣裙，长发，气质清冷" },
        { kind: "scene", name: "教学楼走廊", description: "午后阳光斜照的校园走廊，干净明亮" },
    ],
    beats: [
        { title: "开场", content: "林小雨抱书走过走廊，阳光洒在她脸上", shotType: "中景", duration: "3s", character: "林小雨", scene: "教学楼走廊", camera: "中景跟拍", dialogue: "今天也要加油。" },
        { title: "回眸", content: "她停下回头，微微抿嘴笑", shotType: "近景", duration: "2s", character: "林小雨", scene: "教学楼走廊", camera: "特写推近", dialogue: "" },
    ],
});

test("buildScriptAiPrompt 包含资产与分镜字段要求与 JSON 输出格式", () => {
    const prompt = buildScriptAiPrompt("林小雨走进教室。");
    assert.ok(prompt.includes("assets"));
    assert.ok(prompt.includes("character"));
    assert.ok(prompt.includes("shotType"));
    assert.ok(prompt.includes("只输出一个 JSON 对象"));
    assert.ok(prompt.includes("林小雨走进教室。"));
});

test("parseScriptAiResponse 解析标准 JSON", () => {
    const { beats, assets } = parseScriptAiResponse(SAMPLE_JSON);
    assert.equal(assets.length, 2);
    assert.equal(assets[0].kind, "character");
    assert.equal(assets[0].name, "林小雨");
    assert.equal(beats.length, 2);
    assert.equal(beats[0].character, "林小雨");
    assert.equal(beats[0].camera, "中景跟拍");
    assert.equal(beats[0].dialogue, "今天也要加油。");
    assert.equal(beats[0].scene, "教学楼走廊");
});

test("parseScriptAiResponse 容忍代码围栏与前后说明文字", () => {
    const text = `以下是拆解结果：\n\`\`\`json\n${SAMPLE_JSON}\n\`\`\`\n以上是完整分镜。`;
    const { beats, assets } = parseScriptAiResponse(text);
    assert.equal(beats.length, 2);
    assert.equal(assets.length, 2);
});

test("parseScriptAiResponse 非法输入返回空结构", () => {
    assert.deepEqual(parseScriptAiResponse(""), { beats: [], assets: [] });
    assert.deepEqual(parseScriptAiResponse("模型没有返回有效内容"), { beats: [], assets: [] });
    assert.deepEqual(parseScriptAiResponse("[]"), { beats: [], assets: [] });
    assert.deepEqual(parseScriptAiResponse('{"beats":"oops"}'), { beats: [], assets: [] });
});

test("parseScriptAiResponse 缺字段容错并生成默认 prompt", () => {
    const { beats } = parseScriptAiResponse('{"beats":[{"content":"主角推门而入"}]}');
    assert.equal(beats.length, 1);
    assert.equal(beats[0].title, "主角推门而入".slice(0, 12));
    assert.ok(beats[0].prompt.includes("主角推门而入"));
});

test("buildScriptBeatPrompt 引用角色/场景资产描述与台词", () => {
    const { beats, assets } = parseScriptAiResponse(SAMPLE_JSON);
    const prompt = buildScriptBeatPrompt(beats[0], assets);
    assert.ok(prompt.includes("根据脚本分镜生成画面："));
    assert.ok(prompt.includes("景别：中景"));
    assert.ok(prompt.includes("机位：中景跟拍"));
    assert.ok(prompt.includes("角色「林小雨」：20 岁女大学生"));
    assert.ok(prompt.includes("场景「教学楼走廊」：午后阳光斜照"));
    assert.ok(prompt.includes("台词：今天也要加油。"));
});

test("buildScriptBeatPrompt 无资产时退化为基础提示词", () => {
    const prompt = buildScriptBeatPrompt({ title: "开场", content: "主角走过走廊" });
    assert.ok(prompt.includes("根据脚本分镜生成画面：主角走过走廊"));
    assert.ok(prompt.includes("电影感构图"));
    assert.ok(!prompt.includes("角色「"));
});
