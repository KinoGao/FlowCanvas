export type BackendSyncConfig = {
    enabled: boolean;
    url: string;
    authCode: string;
    publicBaseUrl: string;
};

export type RemoteConfig = {
    data: string;
    updatedAt: string;
};

function backendHeaders(authCode: string): HeadersInit {
    return {
        Authorization: `Bearer ${authCode}`,
        "Content-Type": "application/json",
    };
}

function normalizeUrl(url: string) {
    return url.trim().replace(/\/+$/, "");
}

export async function fetchRemoteConfig(url: string, authCode: string): Promise<RemoteConfig | null> {
    const base = normalizeUrl(url);
    if (!base || !authCode.trim()) return null;
    const resp = await fetch(`${base}/api/config`, {
        headers: backendHeaders(authCode),
    });
    if (!resp.ok) throw new Error(`拉取配置失败：${resp.status}`);
    const body = await resp.json();
    if (body.code !== 0) throw new Error(body.msg || "拉取配置失败");
    return body.data ?? null;
}

export async function pushRemoteConfig(url: string, authCode: string, configJson: string): Promise<void> {
    const base = normalizeUrl(url);
    if (!base || !authCode.trim()) return;
    const resp = await fetch(`${base}/api/config`, {
        method: "PUT",
        headers: backendHeaders(authCode),
        body: JSON.stringify({ data: configJson }),
    });
    if (!resp.ok) throw new Error(`推送配置失败：${resp.status}`);
    const body = await resp.json();
    if (body.code !== 0) throw new Error(body.msg || "推送配置失败");
}

export async function testBackendConnection(url: string): Promise<boolean> {
    const base = normalizeUrl(url);
    if (!base) return false;
    const resp = await fetch(`${base}/api/health`, { method: "GET" });
    if (!resp.ok) return false;
    const body = await resp.json();
    return body.code === 0;
}

export async function uploadImageToBackend(url: string, authCode: string, blob: Blob, fileName = "reference.png"): Promise<string> {
    const base = normalizeUrl(url);
    const form = new FormData();
    form.append("file", blob, fileName);
    const resp = await fetch(`${base}/api/public-image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authCode}` },
        body: form,
    });
    if (!resp.ok) throw new Error(`后端图片上传失败：${resp.status}`);
    const body = await resp.json();
    if (body.code !== 0) throw new Error(body.msg || "后端图片上传失败");
    const filename = body.data?.filename;
    if (!filename) throw new Error("后端未返回图片文件名");
    return filename;
}

export function buildPublicImageUrl(publicBaseUrl: string, filename: string): string {
    const base = normalizeUrl(publicBaseUrl);
    return `${base}/api/public-image/${filename}`;
}