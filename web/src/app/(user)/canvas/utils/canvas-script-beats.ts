import type { CanvasScriptBeat } from "../types";

const SCRIPT_SHOT_TYPES = [
    ["大远景", "大远景|鸟瞰|航拍"],
    ["远景", "远景|全景远景"],
    ["全景", "全景|全身"],
    ["中景", "中景|腰部以上"],
    ["近景", "近景|胸部以上"],
    ["特写", "特写|细节|脸部|眼睛|手部"],
] as const;

export function inferScriptShotType(content: string) {
    const match = SCRIPT_SHOT_TYPES.find(([, pattern]) => new RegExp(pattern).test(content));
    return match?.[0];
}

export function inferScriptDuration(content: string) {
    const seconds = content.match(/(\d+)\s*秒/);
    return seconds ? `${seconds[1]}s` : "3s";
}

export function buildScriptBeats(body: string): CanvasScriptBeat[] {
    const lines = body
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
    const chunks = lines.length
        ? lines
        : body
              .split(/[。！？.!?]+/)
              .map((line) => line.trim())
              .filter(Boolean);
    const source = chunks.length ? chunks.slice(0, 6) : ["建立场景", "角色行动", "情绪高潮"];
    return source.map((content, index) => {
        const clean = content.replace(/^\d+[.、\s]*/, "");
        const title = clean.match(/^([^：:]{2,18})[：:]/)?.[1] || `分镜 ${index + 1}`;
        return {
            id: `beat-${index + 1}`,
            title,
            content: clean,
            shotType: inferScriptShotType(clean),
            duration: inferScriptDuration(clean),
            prompt: `根据脚本分镜生成画面：${clean}。要求画面有清晰主体、镜头景别、动作和氛围，电影感构图。`,
        };
    });
}

export const GRID_SHOT_DESCRIPTIONS = [
    "大远景，交代环境",
    "远景，展现空间关系",
    "全景，主体完整入画",
    "中景，人物腰部以上",
    "近景，人物胸部以上",
    "特写，强调细节情绪",
    "大特写，聚焦局部",
    "俯拍，俯瞰视角",
    "仰拍，低机位仰视",
    "过肩镜头，带前景",
];

export function buildGridBeatPrompt(body: string, beat: Pick<CanvasScriptBeat, "title" | "content"> | undefined, index: number, count: number) {
    const shot = GRID_SHOT_DESCRIPTIONS[index % GRID_SHOT_DESCRIPTIONS.length];
    const source = beat?.content?.trim() || body.trim().slice(0, 80);
    return `根据脚本分镜生成画面（第 ${index + 1}/${count} 格，${shot}）：${source}。保持主体、场景和风格一致，电影感构图。`;
}
