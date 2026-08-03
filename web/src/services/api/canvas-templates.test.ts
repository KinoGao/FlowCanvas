import assert from "node:assert/strict";
import test from "node:test";

import type { CanvasConnection, CanvasNodeData, CanvasNodeType } from "@/app/(user)/canvas/types";
import type { CanvasWorkflowTemplate } from "@/app/(user)/canvas/utils/canvas-workflow-template";
import { listCanvasTemplates, saveCanvasTemplate, deleteCanvasTemplate } from "@/services/api/canvas-templates";

type FetchCall = { url: string; init?: RequestInit };

function installFetchMock(handler: (call: FetchCall) => { status?: number; code?: number; data?: unknown; msg?: string }) {
    const calls: FetchCall[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const call: FetchCall = { url: String(input), init };
        calls.push(call);
        const result = handler(call);
        return new Response(JSON.stringify({ code: result.code ?? 0, data: result.data, msg: result.msg }), {
            status: result.status ?? 200,
            headers: { "Content-Type": "application/json" },
        });
    };
    return {
        calls,
        restore() {
            globalThis.fetch = originalFetch;
        },
    };
}

function authHeader(init?: RequestInit): Record<string, string> {
    return (init?.headers as Record<string, string>) || {};
}

function templateFixture(): CanvasWorkflowTemplate {
    const nodes: CanvasNodeData[] = [
        { id: "n1", type: "text" as CanvasNodeType, title: "标题", position: { x: 0, y: 0 }, width: 160, height: 120 },
    ];
    const connections: CanvasConnection[] = [{ id: "c1", fromNodeId: "n1", toNodeId: "n2" }];
    return { id: "tpl-1", name: "分镜模板", createdAt: "2026-01-01T00:00:00Z", nodes, connections };
}

test("listCanvasTemplates 发起 GET 并带 Bearer 鉴权头，返回模板数组", async () => {
    const fixture = templateFixture();
    const mock = installFetchMock(() => ({ data: [fixture] }));
    try {
        const items = await listCanvasTemplates("token-1");
        assert.equal(mock.calls.length, 1);
        assert.equal(mock.calls[0].url, "/api/canvas-templates");
        assert.equal(mock.calls[0].init?.method, undefined, "list 使用默认 GET");
        assert.equal(authHeader(mock.calls[0].init).Authorization, "Bearer token-1");
        assert.equal(items.length, 1);
        assert.equal(items[0].id, "tpl-1");
        assert.equal(items[0].name, "分镜模板");
        assert.equal(items[0].nodes[0].type, "text");
    } finally {
        mock.restore();
    }
});

test("saveCanvasTemplate 发起 POST，提交 name/nodes/connections 并返回保存后的模板", async () => {
    const fixture = templateFixture();
    const mock = installFetchMock((call) => {
        assert.equal(call.url, "/api/canvas-templates");
        assert.equal(call.init?.method, "POST");
        const body = JSON.parse(String(call.init?.body));
        assert.deepEqual(Object.keys(body).sort(), ["connections", "name", "nodes"]);
        assert.equal(body.name, "分镜模板");
        assert.equal(body.nodes.length, 1);
        assert.equal(body.connections.length, 1);
        return { data: { ...fixture, id: "saved-2" } };
    });
    try {
        const saved = await saveCanvasTemplate("token-2", { name: fixture.name, nodes: fixture.nodes, connections: fixture.connections });
        assert.equal(saved.id, "saved-2");
        assert.equal(authHeader(mock.calls[0].init).Authorization, "Bearer token-2");
    } finally {
        mock.restore();
    }
});

test("deleteCanvasTemplate 发起 DELETE 到 /api/canvas-templates/{id}", async () => {
    const mock = installFetchMock((call) => {
        assert.equal(call.url, "/api/canvas-templates/tpl-1");
        assert.equal(call.init?.method, "DELETE");
        return {};
    });
    try {
        await deleteCanvasTemplate("token-3", "tpl-1");
        assert.equal(mock.calls.length, 1);
    } finally {
        mock.restore();
    }
});

test("后端 code !== 0 时抛出 ApiError，message 使用后端 msg", async () => {
    const mock = installFetchMock(() => ({ code: 1, msg: "模板不存在" }));
    try {
        await assert.rejects(() => listCanvasTemplates("token-4"), (error: unknown) => {
            assert.ok(error instanceof Error);
            assert.equal(error.message, "模板不存在");
            return true;
        });
    } finally {
        mock.restore();
    }
});
