import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_TIMEOUT_MS = 30_000;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

type Attempt = { source: string; ok: boolean; status?: number; body?: string; error?: string };

// 把任意字符串截断，避免错误信息过长
function truncate(value: string, max = 400) {
    if (value.length <= max) return value;
    return `${value.slice(0, max)}...(共 ${value.length} 字符)`;
}

export async function POST(request: NextRequest) {
    let form: FormData;
    try {
        form = await request.formData();
    } catch {
        return NextResponse.json({ error: "无法解析 multipart/form-data 请求" }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof Blob)) {
        return NextResponse.json({ error: "缺少 file 字段或类型不是文件" }, { status: 400 });
    }
    if (file.size <= 0) {
        return NextResponse.json({ error: "文件为空" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `文件超过 ${MAX_FILE_SIZE / 1024 / 1024}MB 限制（实际 ${file.size} 字节）` }, { status: 413 });
    }

    // 仅接受图片；litterbox 拒绝 .exe 等可执行类型，提前校验
    const mime = (file.type || "").toLowerCase();
    if (mime && !mime.startsWith("image/")) {
        return NextResponse.json({ error: `仅支持图片类型，收到 ${mime}` }, { status: 415 });
    }

    const fileName = (file instanceof File && file.name) || "reference.png";
    const arrayBuffer = await file.arrayBuffer();

    // ?source=temp.sh|litterbox|auto（默认 auto）
    const requestedSource = (request.nextUrl.searchParams.get("source") || "auto").toLowerCase();
    const attempts: Attempt[] = [];

    if (requestedSource === "temp.sh" || requestedSource === "auto") {
        const r = await tryTempSh(arrayBuffer, fileName);
        attempts.push(r);
        if (r.ok) return NextResponse.json({ url: r.body, source: "temp.sh" });
        if (requestedSource === "temp.sh") {
            return NextResponse.json({ error: "temp.sh 上传失败", attempts: [{ source: r.source, ok: r.ok, status: r.status, error: r.error }] }, { status: 502 });
        }
    }

    if (requestedSource === "litterbox" || requestedSource === "auto") {
        const r = await tryLitterbox(arrayBuffer, fileName);
        attempts.push(r);
        if (r.ok) return NextResponse.json({ url: r.body, source: "litterbox" });
        if (requestedSource === "litterbox") {
            return NextResponse.json({ error: "litterbox 上传失败", attempts: [{ source: r.source, ok: r.ok, status: r.status, error: r.error }] }, { status: 502 });
        }
    }

    return NextResponse.json(
        {
            error: "所有临时图床都失败",
            attempts: attempts.map((a) => ({ source: a.source, ok: a.ok, status: a.status, error: a.error })),
        },
        { status: 502 },
    );
}

async function tryTempSh(arrayBuffer: ArrayBuffer, fileName: string): Promise<Attempt> {
    const source = "temp.sh";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    try {
        const form = new FormData();
        form.append("file", new Blob([arrayBuffer], { type: "image/png" }), fileName);
        const response = await fetch("https://temp.sh/upload", { method: "POST", body: form, signal: controller.signal });
        const text = (await response.text()).trim();
        if (response.ok && /^https?:\/\//i.test(text)) {
            return { source, ok: true, body: text, status: response.status };
        }
        return { source, ok: false, status: response.status, error: truncate(text || response.statusText) };
    } catch (error) {
        return { source, ok: false, error: error instanceof Error ? truncate(error.message) : "未知错误" };
    } finally {
        clearTimeout(timer);
    }
}

async function tryLitterbox(arrayBuffer: ArrayBuffer, fileName: string): Promise<Attempt> {
    const source = "litterbox";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    try {
        const form = new FormData();
        form.append("reqtype", "fileupload");
        form.append("time", "72h");
        form.append("fileToUpload", new Blob([arrayBuffer], { type: "image/png" }), fileName);
        const response = await fetch("https://litterbox.catbox.moe/resources/internals/api.php", { method: "POST", body: form, signal: controller.signal });
        const text = (await response.text()).trim();
        if (response.ok && /^https?:\/\//i.test(text)) {
            return { source, ok: true, body: text, status: response.status };
        }
        return { source, ok: false, status: response.status, error: truncate(text || response.statusText) };
    } catch (error) {
        return { source, ok: false, error: error instanceof Error ? truncate(error.message) : "未知错误" };
    } finally {
        clearTimeout(timer);
    }
}
