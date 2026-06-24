import { NextRequest, NextResponse } from "next/server";

const ALLOWED_PATHS = ["/system_stats", "/object_info", "/prompt", "/history/", "/view", "/upload/image"];

export async function GET(request: NextRequest) {
    const baseUrl = request.nextUrl.searchParams.get("baseUrl") || "";
    const path = request.nextUrl.searchParams.get("path") || "";
    return proxyComfyRequest(baseUrl, path, { method: "GET" });
}

export async function POST(request: NextRequest) {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
        const form = await request.formData();
        const baseUrl = String(form.get("baseUrl") || "");
        form.delete("baseUrl");
        return proxyComfyRequest(baseUrl, "/upload/image", { method: "POST", body: form });
    }

    const payload = (await request.json()) as { baseUrl?: string; path?: string; method?: string; body?: unknown };
    return proxyComfyRequest(payload.baseUrl || "", payload.path || "", {
        method: payload.method === "GET" ? "GET" : "POST",
        headers: payload.body === undefined ? undefined : { "Content-Type": "application/json" },
        body: payload.body === undefined ? undefined : JSON.stringify(payload.body),
    });
}

async function proxyComfyRequest(baseUrl: string, path: string, init: RequestInit) {
    try {
        const target = buildComfyTargetUrl(baseUrl, path);
        const response = await fetch(target, init);
        const headers = new Headers(response.headers);
        headers.delete("content-encoding");
        headers.delete("content-length");
        return new NextResponse(response.body, { status: response.status, headers });
    } catch (error) {
        return NextResponse.json({ detail: error instanceof Error ? error.message : "ComfyUI 转发失败" }, { status: 400 });
    }
}

function buildComfyTargetUrl(baseUrl: string, path: string) {
    const base = new URL(baseUrl.trim() || "http://127.0.0.1:8188");
    if (base.protocol !== "http:" && base.protocol !== "https:") throw new Error("ComfyUI 地址只支持 http/https");
    if (base.username || base.password) throw new Error("ComfyUI 地址不能包含用户名或密码");
    if (!path.startsWith("/") || path.includes("://")) throw new Error("ComfyUI 路径无效");
    const pathname = path.split("?")[0];
    if (!ALLOWED_PATHS.some((allowed) => pathname === allowed || (allowed.endsWith("/") && pathname.startsWith(allowed)))) {
        throw new Error("ComfyUI 路径不在允许范围内");
    }
    return new URL(path, base.toString().replace(/\/+$/, "/")).toString();
}
