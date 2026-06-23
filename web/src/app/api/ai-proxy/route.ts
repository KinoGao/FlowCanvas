import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROXY_TIMEOUT_MS = 600_000;
const HOP_BY_HOP_HEADERS = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "transfer-encoding",
    "upgrade",
    "content-encoding",
    "content-length",
]);

export async function GET(request: NextRequest) {
    return handle(request, "GET");
}

export async function POST(request: NextRequest) {
    return handle(request, "POST");
}

export async function PUT(request: NextRequest) {
    return handle(request, "PUT");
}

export async function PATCH(request: NextRequest) {
    return handle(request, "PATCH");
}

export async function DELETE(request: NextRequest) {
    return handle(request, "DELETE");
}

async function handle(request: NextRequest, method: string) {
    const target = request.nextUrl.searchParams.get("target");
    if (!target) return new Response("Missing target", { status: 400 });
    let url: URL;
    try {
        url = new URL(target);
    } catch {
        return new Response("Invalid target", { status: 400 });
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return new Response("Unsupported target protocol", { status: 400 });

    const headers = new Headers();
    const auth = request.headers.get("authorization");
    if (auth) headers.set("Authorization", auth);
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
    const accept = request.headers.get("accept");
    if (accept) headers.set("Accept", accept);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
    try {
        const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();
        console.log(`[ai-proxy] ${method} ${url.href} ${body?.byteLength || 0}B`);
        const upstream = await fetch(url, {
            method,
            headers,
            body: body?.byteLength ? body : undefined,
            signal: controller.signal,
        });
        console.log(`[ai-proxy] ${method} ${url.href} -> ${upstream.status}`);
        return new Response(upstream.body, { status: upstream.status, headers: responseHeaders(upstream.headers) });
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return new Response("AI proxy timeout", { status: 504 });
        return new Response(error instanceof Error ? error.message : "AI proxy error", { status: 502 });
    } finally {
        clearTimeout(timer);
    }
}

function responseHeaders(headers: Headers) {
    const result = new Headers();
    headers.forEach((value, key) => {
        if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return;
        result.set(key, value);
    });
    return result;
}