import { describe, expect, it, vi } from "vitest";

import type { AiConfig } from "@/stores/use-config-store";
import { requestToolResponse, sanitizeToolCalls, sanitizeToolMessages, type ResponseFunctionTool, type ResponseInputMessage } from "./image";

const userMessage: ResponseInputMessage = { role: "user", content: "读取当前画布" };

function functionCall(id: string, name = "canvas_get_state"): ResponseInputMessage {
    return { type: "function_call", call_id: id, name, arguments: "{}" };
}

function toolResult(id: string, content = '{"ok":true}'): ResponseInputMessage {
    return { role: "tool", tool_call_id: id, content };
}

describe("tool message sanitizer", () => {
    it("keeps a complete single function call block", () => {
        expect(sanitizeToolMessages([userMessage, functionCall("call_1"), toolResult("call_1")])).toEqual([
            userMessage,
            { type: "function_calls", calls: [{ id: "call_1", type: "function", function: { name: "canvas_get_state", arguments: "{}" } }] },
            toolResult("call_1"),
        ]);
    });

    it("merges consecutive function calls into one assistant block before their results", () => {
        expect(sanitizeToolMessages([functionCall("call_1"), functionCall("call_2", "canvas_get_selection"), toolResult("call_1"), toolResult("call_2")])).toEqual([
            {
                type: "function_calls",
                calls: [
                    { id: "call_1", type: "function", function: { name: "canvas_get_state", arguments: "{}" } },
                    { id: "call_2", type: "function", function: { name: "canvas_get_selection", arguments: "{}" } },
                ],
            },
            toolResult("call_1"),
            toolResult("call_2"),
        ]);
    });

    it("drops an orphan function call that has no result", () => {
        expect(sanitizeToolMessages([userMessage, functionCall("call_1"), toolResult("call_1"), functionCall("call_2")])).toEqual([
            userMessage,
            {
                type: "function_calls",
                calls: [{ id: "call_1", type: "function", function: { name: "canvas_get_state", arguments: "{}" } }],
            },
            toolResult("call_1"),
        ]);
    });

    it("drops an orphan tool result without a function call", () => {
        expect(sanitizeToolMessages([userMessage, toolResult("missing")])).toEqual([userMessage]);
    });

    it("drops empty or duplicate ids", () => {
        expect(
            sanitizeToolCalls([
                { id: "call_1", type: "function", function: { name: "canvas_get_state", arguments: "" } },
                { id: "call_1", type: "function", function: { name: "canvas_get_state", arguments: '{"x":1}' } },
                { id: "", type: "function", function: { name: "canvas_get_state", arguments: "{}" } },
            ]),
        ).toEqual([{ id: "call_1", type: "function", function: { name: "canvas_get_state", arguments: "{}" } }]);
    });

    it("keeps a pre-grouped function_calls block", () => {
        const grouped: ResponseInputMessage = {
            type: "function_calls",
            calls: [{ id: "call_1", type: "function", function: { name: "canvas_get_state", arguments: "{}" } }],
        };
        expect(sanitizeToolMessages([grouped, toolResult("call_1")])).toEqual([grouped, toolResult("call_1")]);
    });

    it("sends one assistant tool_calls block followed by every tool result", async () => {
        const config = {
            channelMode: "local",
            baseUrl: "http://127.0.0.1:9999",
            apiKey: "test-key",
            apiFormat: "openai",
            channels: [],
            models: [],
            model: "test-model",
            imageModel: "test-model",
            videoModel: "test-model",
            textModel: "test-model",
            audioModel: "test-model",
            systemPrompt: "",
            useProxy: false,
        } as unknown as AiConfig;
        const tools: ResponseFunctionTool[] = [
            {
                type: "function",
                function: {
                    name: "canvas_get_state",
                    parameters: {},
                },
            },
        ];
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "读取完成" } }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
        vi.stubGlobal("fetch", fetchMock);
        try {
            const result = await requestToolResponse(
                config,
                [functionCall("call_1"), functionCall("call_2", "canvas_get_selection"), toolResult("call_1"), toolResult("call_2")],
                tools,
                "auto",
            );
            expect(result.content).toBe("读取完成");
            const requestCall = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
            const requestBody = JSON.parse(String(requestCall[1].body)) as { messages: Array<Record<string, unknown>> };
            expect(requestBody.messages).toEqual([
                {
                    role: "assistant",
                    tool_calls: [
                        { id: "call_1", type: "function", function: { name: "canvas_get_state", arguments: "{}" } },
                        { id: "call_2", type: "function", function: { name: "canvas_get_selection", arguments: "{}" } },
                    ],
                },
                { role: "tool", tool_call_id: "call_1", content: '{"ok":true}' },
                { role: "tool", tool_call_id: "call_2", content: '{"ok":true}' },
            ]);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
