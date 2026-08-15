import { nanoid } from "nanoid";

import type { AiConfig } from "@/stores/use-config-store";
import { requestAudioGeneration, storeGeneratedAudio } from "@/services/api/audio";
import { requestEdit, requestGeneration, requestToolResponse, type AiTextMessage, type ResponseFunctionTool, type ResponseInputMessage, type ResponseToolCall } from "@/services/api/image";
import { requestVideoGeneration, storeGeneratedVideo } from "@/services/api/video";
import { uploadImage } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";

export type CreateMode = "agent" | "image" | "video" | "audio";
export type CreateMediaKind = Exclude<CreateMode, "agent">;

export type CreateAttachment = {
    kind: CreateMediaKind;
    url: string;
    storageKey?: string;
    name?: string;
};

export type CreateReference = {
    id: string;
    name: string;
    dataUrl: string;
};

const KIND_LABEL: Record<CreateMediaKind, string> = { image: "图片", video: "视频", audio: "音频" };

/** 创作 Agent 系统提示词：对话式创作助手，需要生成图片/视频/音频时调用对应工具。 */
export const CREATE_AGENT_SYSTEM_PROMPT = [
    "你是 FlowCanvas 的统一创作 Agent，在一个对话里帮助用户完成文字问答与图片、视频、音频创作。",
    "用户提出画面/视频/语音创作需求时，先理解意图并补全为具体、可拍、有主体和氛围的生成提示词，然后调用对应工具（generate_image / generate_video / generate_audio）完成生成，不要只给建议不执行。",
    "用户消息中带有参考图时，生成图片/视频应基于参考图保持主体、风格一致（generate_image 设置 use_reference 为 true）。",
    "纯问答、提示词优化、创意讨论直接文字回复，不调用工具；回复简洁，使用中文。",
    "工具生成结果会自动附加到你的回复里，回复中简单说明生成了什么即可，不要编造生成失败或成功的细节。",
].join("\n");

export const CREATE_AGENT_TOOLS: ResponseFunctionTool[] = [
    {
        type: "function",
        function: {
            name: "generate_image",
            description: "生成图片（文生图；有参考图且 use_reference 为 true 时走图生图/编辑）",
            parameters: {
                type: "object",
                properties: {
                    prompt: { type: "string", description: "完整的画面生成提示词" },
                    use_reference: { type: "boolean", description: "是否使用用户附带的参考图，默认 true" },
                },
                required: ["prompt"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "generate_video",
            description: "生成视频（文生视频；有参考图时作为首帧/参考）",
            parameters: {
                type: "object",
                properties: {
                    prompt: { type: "string", description: "完整的视频生成提示词（主体、动作、运镜、氛围）" },
                },
                required: ["prompt"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "generate_audio",
            description: "文本转语音（TTS），把给定文本合成为语音音频",
            parameters: {
                type: "object",
                properties: {
                    prompt: { type: "string", description: "要合成为语音的文本内容" },
                },
                required: ["prompt"],
            },
        },
    },
];

function toReferenceImages(references: CreateReference[]): ReferenceImage[] {
    return references.map((item) => ({ id: item.id, name: item.name, type: "image", dataUrl: item.dataUrl }));
}

/** 直接生成：按类型调用对应生成链路并转存到账号文件，返回可展示的附件。 */
export async function runCreateGeneration(kind: CreateMediaKind, config: AiConfig, prompt: string, references: CreateReference[]): Promise<CreateAttachment[]> {
    if (kind === "image") {
        const imageConfig = { ...config, model: config.imageModel || config.model };
        const refs = toReferenceImages(references);
        const items = refs.length ? await requestEdit(imageConfig, prompt, refs) : await requestGeneration(imageConfig, prompt);
        return Promise.all(
            items.map(async (item, index) => {
                const uploaded = await uploadImage(item.dataUrl);
                return { kind: "image" as const, url: uploaded.url, storageKey: uploaded.storageKey, name: `图片 ${index + 1}` };
            }),
        );
    }
    if (kind === "video") {
        const videoConfig = { ...config, model: config.videoModel || config.model };
        const result = await requestVideoGeneration(videoConfig, prompt, toReferenceImages(references));
        const uploaded = await storeGeneratedVideo(result);
        return [{ kind: "video", url: uploaded.url, storageKey: uploaded.storageKey, name: "视频" }];
    }
    const audioConfig = { ...config, model: config.audioModel || config.model };
    const blob = await requestAudioGeneration(audioConfig, prompt);
    const uploaded = await storeGeneratedAudio(blob);
    return [{ kind: "audio", url: uploaded.url, storageKey: uploaded.storageKey, name: "音频" }];
}

async function executeCreateTool(call: ResponseToolCall, config: AiConfig, references: CreateReference[], produced: CreateAttachment[]): Promise<string> {
    let args: { prompt?: string; use_reference?: boolean } = {};
    try {
        args = JSON.parse(call.function.arguments || "{}");
    } catch {
        return JSON.stringify({ ok: false, error: "工具参数不是合法 JSON" });
    }
    const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
    if (!prompt) return JSON.stringify({ ok: false, error: "缺少 prompt 参数" });
    const kind: CreateMediaKind = call.function.name === "generate_video" ? "video" : call.function.name === "generate_audio" ? "audio" : "image";
    try {
        const useReferences = kind === "image" ? args.use_reference !== false : true;
        const attachments = await runCreateGeneration(kind, config, prompt, useReferences ? references : []);
        produced.push(...attachments);
        return JSON.stringify({ ok: true, kind, count: attachments.length, message: `已生成 ${attachments.length} 个${KIND_LABEL[kind]}，附件已加入回复` });
    } catch (error) {
        return JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "生成失败" });
    }
}

const CREATE_AGENT_MAX_STEPS = 6;

/** Agent 模式一轮对话：工具循环（生成类工具自动执行），返回最终文本与本轮生成的附件。onDelta 收到的是累计文本。 */
export async function runCreateAgentTurn(params: {
    config: AiConfig;
    history: ResponseInputMessage[];
    userText: string;
    references: CreateReference[];
    onDelta: (text: string) => void;
}): Promise<{ content: string; attachments: CreateAttachment[] }> {
    const { config, history, userText, references, onDelta } = params;
    const requestConfig = { ...config, model: config.textModel || config.model };
    const userContent: AiTextMessage["content"] = references.length
        ? [{ type: "text" as const, text: userText }, ...references.map((item) => ({ type: "image_url" as const, image_url: { url: item.dataUrl } }))]
        : userText;
    const messages: ResponseInputMessage[] = [...history, { role: "user", content: userContent }];
    const produced: CreateAttachment[] = [];
    let content = "";
    for (let step = 0; step < CREATE_AGENT_MAX_STEPS; step += 1) {
        const result = await requestToolResponse(requestConfig, messages, CREATE_AGENT_TOOLS, "auto", (text) => {
            if (text.trim()) {
                content = text;
                onDelta(text);
            }
        });
        if (!result.toolCalls.length) {
            return { content: result.content || content, attachments: produced };
        }
        for (const call of result.toolCalls) {
            messages.push({ type: "function_call", call_id: call.id, name: call.function.name, arguments: call.function.arguments });
            const output = await executeCreateTool(call, config, references, produced);
            messages.push({ role: "tool", tool_call_id: call.id, content: output });
        }
    }
    return { content: content || "已完成本轮创作。", attachments: produced };
}

export function newCreateReference(name: string, dataUrl: string): CreateReference {
    return { id: nanoid(), name, dataUrl };
}
