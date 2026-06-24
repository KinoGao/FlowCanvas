import { createHmac, createHash } from "crypto";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JIMENG_HOST = "visual.volcengineapi.com";
const JIMENG_REGION = "cn-north-1";
const JIMENG_SERVICE = "cv";
const PROXY_TIMEOUT_MS = 600_000;

// 前端发来的请求：
//   POST /api/jimeng-proxy
//   Header: X-Jimeng-AK, X-Jimeng-SK
//   Query:  Action, Version (附加到上游 URL)
//   Body:   即梦 API 的 JSON body
//
// 本路由：
//   1. 从 header 取 AK/SK
//   2. 计算 HMAC-SHA256 签名
//   3. 转发到 visual.volcengineapi.com
//   4. 透传响应

export async function POST(request: NextRequest) {
    const ak = request.headers.get("x-jimeng-ak") || "";
    const sk = request.headers.get("x-jimeng-sk") || "";
    if (!ak || !sk) return new Response("Missing AK/SK", { status: 400 });

    const action = request.nextUrl.searchParams.get("Action") || "";
    const version = request.nextUrl.searchParams.get("Version") || "2022-08-31";
    if (!action) return new Response("Missing Action", { status: 400 });

    const body = await request.arrayBuffer();
    const bodyStr = body.byteLength ? Buffer.from(body).toString("utf-8") : "";

    const now = new Date();
    const xDate = formatXDate(now);
    const dateStamp = formatDateStamp(now);

    // 构造上游 URL 的 query string
    const queryParams = `Action=${action}&Version=${version}`;
    const canonicalUri = "/";
    const canonicalQueryString = canonicalizeQueryString(queryParams);

    // Payload hash
    const payloadHash = sha256Hex(bodyStr);

    // Canonical Headers — 只签 host 和 x-date
    const canonicalHeaders = `host:${JIMENG_HOST}\nx-date:${xDate}\n`;
    const signedHeaders = "host;x-date";

    // Step 1: Canonical Request
    const canonicalRequest = [
        "POST",
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        signedHeaders,
        payloadHash,
    ].join("\n");

    // Step 2: StringToSign
    const credentialScope = `${dateStamp}/${JIMENG_REGION}/${JIMENG_SERVICE}/request`;
    const stringToSign = [
        "HMAC-SHA256",
        xDate,
        credentialScope,
        sha256Hex(canonicalRequest),
    ].join("\n");

    // Step 3: Signing Key
    const kDate = hmacSha256("AWS4" + sk, dateStamp);
    const kRegion = hmacSha256(kDate, JIMENG_REGION);
    const kService = hmacSha256(kRegion, JIMENG_SERVICE);
    const kSigning = hmacSha256(kService, "request");

    // Step 4: Signature
    const signature = hmacSha256Hex(kSigning, stringToSign);

    const authorization = `HMAC-SHA256 Credential=${ak}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const upstreamUrl = `https://${JIMENG_HOST}/?${queryParams}`;
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Host": JIMENG_HOST,
        "X-Date": xDate,
        "Authorization": authorization,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);
    try {
        console.log(`[jimeng-proxy] POST ${upstreamUrl} ${body.byteLength}B`);
        const upstream = await fetch(upstreamUrl, {
            method: "POST",
            headers,
            body: body.byteLength ? body : undefined,
            signal: controller.signal,
        });
        console.log(`[jimeng-proxy] POST ${upstreamUrl} -> ${upstream.status}`);
        return new Response(upstream.body, {
            status: upstream.status,
            headers: filterResponseHeaders(upstream.headers),
        });
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            return new Response("Jimeng proxy timeout", { status: 504 });
        }
        return new Response(error instanceof Error ? error.message : "Jimeng proxy error", { status: 502 });
    } finally {
        clearTimeout(timer);
    }
}

// ===== HMAC-SHA256 helpers =====

function hmacSha256(key: string | Buffer, data: string): Buffer {
    return createHmac("sha256", key).update(data, "utf-8").digest();
}

function hmacSha256Hex(key: Buffer, data: string): string {
    return createHmac("sha256", key).update(data, "utf-8").digest("hex");
}

function sha256Hex(data: string): string {
    return createHash("sha256").update(data, "utf-8").digest("hex");
}

function formatXDate(date: Date): string {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

function formatDateStamp(date: Date): string {
    return date.toISOString().slice(0, 10).replace(/-/g, "");
}

// 将 "Action=CVSync2AsyncSubmitTask&Version=2022-08-31" 排序成
// "Action=CVSync2AsyncSubmitTask&Version=2022-08-31"
// (按参数名字典序排列，值做 URI encode)
function canonicalizeQueryString(queryString: string): string {
    const params = queryString.split("&").map((pair) => {
        const eqIndex = pair.indexOf("=");
        const key = eqIndex >= 0 ? pair.slice(0, eqIndex) : pair;
        const value = eqIndex >= 0 ? pair.slice(eqIndex + 1) : "";
        return [encodeURIComponent(key), encodeURIComponent(value)];
    });
    params.sort((a, b) => a[0].localeCompare(b[0]));
    return params.map(([k, v]) => `${k}=${v}`).join("&");
}

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

function filterResponseHeaders(headers: Headers): Headers {
    const result = new Headers();
    headers.forEach((value, key) => {
        if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return;
        result.set(key, value);
    });
    return result;
}