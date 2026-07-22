"use client";

import { App, Alert, Button, Form, Input, Modal, Progress, Segmented, Select, Tabs } from "antd";
import { Cloud, LogIn, LogOut, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";

import { loginUser, logoutUser, registerUser } from "@/services/api/auth";
import { syncAppDataToWebdav, type AppSyncDomainKey } from "@/services/app-sync";
import { testWebdavConnection, WEBDAV_MANIFEST_FILE_NAME } from "@/services/webdav-sync";
import { audioFormatOptions, audioVoiceOptions, normalizeAudioSpeedValue } from "@/lib/audio-generation";
import { useConfigStore, type ImageResponseFormatPolicy } from "@/stores/use-config-store";
import { useUserStore, type SaveMode } from "@/stores/use-user-store";

type WebdavDomainProgress = {
    label: string;
    stage: string;
    current?: number;
    total?: number;
    status?: "active" | "success" | "exception";
};

const saveModeOptions: Array<{ label: string; value: SaveMode }> = [
    { label: "后端账号", value: "backend" },
    { label: "WebDAV 云端", value: "webdav" },
];

const imageResponseFormatOptions: Array<{ label: string; value: ImageResponseFormatPolicy }> = [
    { label: "自动", value: "auto" },
    { label: "Base64", value: "b64_json" },
    { label: "URL", value: "url" },
];

const webdavDomainKeys: AppSyncDomainKey[] = ["config", "canvas", "assets", "image-workbench", "video-workbench"];
const webdavDomainLabels: Record<AppSyncDomainKey, string> = {
    config: "配置",
    canvas: "画布",
    assets: "素材",
    "image-workbench": "生图工作台",
    "video-workbench": "视频创作台",
};

function createWebdavDomainProgress(): Record<AppSyncDomainKey, WebdavDomainProgress> {
    return webdavDomainKeys.reduce(
        (progress, key) => ({
            ...progress,
            [key]: { label: webdavDomainLabels[key], stage: "等待同步" },
        }),
        {} as Record<AppSyncDomainKey, WebdavDomainProgress>,
    );
}

export function AppConfigModal() {
    const { message } = App.useApp();
    const [activeTab, setActiveTab] = useState("account");
    const [authMode, setAuthMode] = useState<"login" | "register">("login");
    const [authLoading, setAuthLoading] = useState(false);
    const [authForm, setAuthForm] = useState({ username: "", password: "", displayName: "", authCode: "" });
    const [testingWebdav, setTestingWebdav] = useState(false);
    const [syncingWebdav, setSyncingWebdav] = useState(false);
    const [webdavSyncStatus, setWebdavSyncStatus] = useState("");
    const [webdavDomainProgress, setWebdavDomainProgress] = useState(createWebdavDomainProgress);

    const config = useConfigStore((state) => state.config);
    const webdav = useConfigStore((state) => state.webdav);
    const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
    const shouldPromptContinue = useConfigStore((state) => state.shouldPromptContinue);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const updateWebdavConfig = useConfigStore((state) => state.updateWebdavConfig);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    const clearPromptContinue = useConfigStore((state) => state.clearPromptContinue);

    const user = useUserStore((state) => state.user);
    const token = useUserStore((state) => state.token);
    const saveMode = useUserStore((state) => state.saveMode);
    const setSession = useUserStore((state) => state.setSession);
    const clearSession = useUserStore((state) => state.clearSession);
    const setSaveMode = useUserStore((state) => state.setSaveMode);

    useEffect(() => {
        if (isConfigOpen && !token) setActiveTab("account");
    }, [isConfigOpen, token]);

    const closeModal = () => {
        clearPromptContinue();
        setConfigDialogOpen(false);
    };

    const changeSaveMode = (mode: SaveMode) => {
        if (mode === "backend" && !token) {
            setActiveTab("account");
            message.warning("请先登录后端账号");
            return;
        }
        if (mode === "webdav" && !webdav.url.trim()) {
            setActiveTab("webdav");
            message.info("请先填写 WebDAV 地址");
        }
        setSaveMode(mode);
    };

    const submitAuth = async () => {
        const username = authForm.username.trim();
        const password = authForm.password;
        const authCode = authForm.authCode.trim();
        if (!username || !password) {
            message.warning("请输入账号和密码");
            return;
        }
        if (authMode === "register" && !authCode) {
            message.warning("注册需要鉴权码");
            return;
        }
        setAuthLoading(true);
        try {
            const response =
                authMode === "register"
                    ? await registerUser({ username, password, displayName: authForm.displayName.trim(), authCode })
                    : await loginUser({ username, password });
            setSession(response.user, response.token);
            message.success(authMode === "register" ? "注册并登录成功" : "登录成功");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "登录失败");
        } finally {
            setAuthLoading(false);
        }
    };

    const logout = async () => {
        try {
            if (token) await logoutUser(token);
        } catch {
            // Local logout should still happen when the backend is temporarily unavailable.
        }
        clearSession();
        message.success("已退出登录");
    };

    const testWebdav = async () => {
        setTestingWebdav(true);
        try {
            await testWebdavConnection(webdav);
            message.success("WebDAV 连接正常");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "WebDAV 连接失败");
        } finally {
            setTestingWebdav(false);
        }
    };

    const syncWebdav = async () => {
        setSyncingWebdav(true);
        setWebdavSyncStatus("开始同步...");
        setWebdavDomainProgress(createWebdavDomainProgress());
        try {
            const result = await syncAppDataToWebdav(webdav, (event) => {
                if (event.domain) {
                    const domain = event.domain as AppSyncDomainKey;
                    setWebdavDomainProgress((progress) => ({
                        ...progress,
                        [domain]: {
                            ...progress[domain],
                            ...event,
                            label: event.label || progress[domain].label,
                        },
                    }));
                }
                setWebdavSyncStatus(event.stage);
            });
            updateWebdavConfig("lastSyncedAt", result.syncedAt);
            message.success("同步完成：" + result.projects + " 个画布，" + result.assets + " 个素材，" + result.uploadedFiles + " 个新文件");
        } catch (error) {
            setWebdavSyncStatus("同步失败");
            message.error(error instanceof Error ? error.message : "WebDAV 同步失败");
        } finally {
            setSyncingWebdav(false);
        }
    };

    return (
        <Modal title="设置" open={isConfigOpen} onCancel={closeModal} footer={null} width={780} destroyOnHidden className="creative-config-modal">
            {shouldPromptContinue ? (
                <Alert
                    className="mb-4"
                    type="warning"
                    showIcon
                    message="生成能力需要配置"
                    description="当前没有可用的已验证模型，请联系系统管理员完成模型认证、能力配置和发布。"
                />
            ) : null}
            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                    {
                        key: "account",
                        label: <span className="inline-flex items-center gap-2"><ShieldCheck className="size-4" />账号与保存</span>,
                        children: (
                            <div className="space-y-5">
                                <section className="rounded-2xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
                                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                                        <div>
                                            <div className="font-medium">保存位置</div>
                                            <div className="text-xs text-gray-500">后端账号是默认工作区；WebDAV 作为独立的云端保存通道保留。</div>
                                        </div>
                                        <Segmented value={saveMode} options={saveModeOptions} onChange={(value) => changeSaveMode(value as SaveMode)} />
                                    </div>
                                    <div className="rounded-xl bg-black/[0.04] px-3 py-2 text-sm text-gray-600 dark:bg-white/[0.06] dark:text-white/70">
                                        当前模式：{saveModeOptions.find((item) => item.value === saveMode)?.label || saveMode}
                                    </div>
                                </section>

                                <section className="rounded-2xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
                                    {user ? (
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <div className="font-medium">{user.displayName || user.username}</div>
                                                <div className="text-xs text-gray-500">@{user.username} · 后端账号数据会按账号隔离同步。</div>
                                            </div>
                                            <Button icon={<LogOut className="size-4" />} onClick={logout}>退出登录</Button>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <Segmented value={authMode} options={[{ label: "登录", value: "login" }, { label: "注册", value: "register" }]} onChange={(value) => setAuthMode(value as "login" | "register")} />
                                            <div className="grid gap-3 md:grid-cols-2">
                                                <Input value={authForm.username} placeholder="账号" onChange={(event) => setAuthForm({ ...authForm, username: event.target.value })} />
                                                <Input.Password value={authForm.password} placeholder="密码" onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} />
                                                {authMode === "register" ? (
                                                    <>
                                                        <Input value={authForm.displayName} placeholder="显示名称（可选）" onChange={(event) => setAuthForm({ ...authForm, displayName: event.target.value })} />
                                                        <Input.Password value={authForm.authCode} placeholder="注册鉴权码" onChange={(event) => setAuthForm({ ...authForm, authCode: event.target.value })} />
                                                    </>
                                                ) : null}
                                            </div>
                                            <Button type="primary" icon={<LogIn className="size-4" />} loading={authLoading} onClick={submitAuth}>{authMode === "register" ? "注册并登录" : "登录"}</Button>
                                        </div>
                                    )}
                                </section>

                            </div>
                        ),
                    },
                    {
                        key: "generation",
                        label: <span className="inline-flex items-center gap-2"><SlidersHorizontal className="size-4" />生成偏好</span>,
                        children: (
                            <Form layout="vertical" className="grid gap-2 md:grid-cols-2">
                                <Form.Item label="画布批量生图数量" className="mb-2">
                                    <Input type="number" min={1} max={15} value={config.canvasImageCount} onChange={(event) => updateConfig("canvasImageCount", normalizeImageCount(event.target.value))} />
                                </Form.Item>
                                <Form.Item label="生图响应格式" className="mb-2">
                                    <Select value={config.imageResponseFormat} options={imageResponseFormatOptions} onChange={(value) => updateConfig("imageResponseFormat", value)} />
                                </Form.Item>
                                <Form.Item label="图片比例" className="mb-2">
                                    <Select value={config.size} onChange={(value) => updateConfig("size", value)} options={["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"].map((value) => ({ label: value, value }))} />
                                </Form.Item>
                                <Form.Item label="图片质量" className="mb-2">
                                    <Select value={config.quality} onChange={(value) => updateConfig("quality", value)} options={["auto", "low", "medium", "high"].map((value) => ({ label: value, value }))} />
                                </Form.Item>
                                <Form.Item label="视频时长 / 秒" className="mb-2">
                                    <Select value={config.videoSeconds} onChange={(value) => updateConfig("videoSeconds", value)} options={["4", "5", "6", "8", "10"].map((value) => ({ label: value + "s", value }))} />
                                </Form.Item>
                                <Form.Item label="视频分辨率" className="mb-2">
                                    <Select value={config.vquality} onChange={(value) => updateConfig("vquality", value)} options={["480", "720", "1080"].map((value) => ({ label: value + "p", value }))} />
                                </Form.Item>
                                <Form.Item label="视频声音" className="mb-2">
                                    <Segmented block value={config.videoGenerateAudio} options={[{ label: "有声", value: "true" }, { label: "静音", value: "false" }]} onChange={(value) => updateConfig("videoGenerateAudio", value as string)} />
                                </Form.Item>
                                <Form.Item label="视频水印" className="mb-2">
                                    <Segmented block value={config.videoWatermark} options={[{ label: "关闭", value: "false" }, { label: "开启", value: "true" }]} onChange={(value) => updateConfig("videoWatermark", value as string)} />
                                </Form.Item>
                                <Form.Item label="音色" className="mb-2">
                                    <Select value={config.audioVoice} options={audioVoiceOptions} onChange={(value) => updateConfig("audioVoice", value)} />
                                </Form.Item>
                                <Form.Item label="音频格式" className="mb-2">
                                    <Select value={config.audioFormat} options={audioFormatOptions} onChange={(value) => updateConfig("audioFormat", value)} />
                                </Form.Item>
                                <Form.Item label="语速" className="mb-2">
                                    <Input type="number" min={0.25} max={4} step={0.05} value={config.audioSpeed} onChange={(event) => updateConfig("audioSpeed", normalizeAudioSpeedValue(event.target.value))} />
                                </Form.Item>
                                <Form.Item label="生成张数" className="mb-2">
                                    <Input type="number" min={1} max={15} value={config.count} onChange={(event) => updateConfig("count", normalizeImageCount(event.target.value))} />
                                </Form.Item>
                                <Form.Item label="音频指令" className="mb-2 md:col-span-2">
                                    <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} value={config.audioInstructions} onChange={(event) => updateConfig("audioInstructions", event.target.value)} />
                                </Form.Item>
                                <Form.Item label="系统提示词" className="mb-0 md:col-span-2">
                                    <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} value={config.systemPrompt} onChange={(event) => updateConfig("systemPrompt", event.target.value)} />
                                </Form.Item>
                            </Form>
                        ),
                    },
                    {
                        key: "webdav",
                        label: <span className="inline-flex items-center gap-2"><Cloud className="size-4" />WebDAV</span>,
                        children: (
                            <div className="space-y-4">
                                <Alert type="info" showIcon message="云端 WebDAV 保存/同步" description={"会同步画布、素材、配置和工作台记录，清单文件为 " + WEBDAV_MANIFEST_FILE_NAME + "。"} />
                                <Form layout="vertical" className="grid gap-2 md:grid-cols-2">
                                    <Form.Item label="连接方式" className="mb-2">
                                        <Segmented block value={webdav.proxyMode} options={[{ label: "直连", value: "direct" }, { label: "后端代理", value: "backend" }]} onChange={(value) => updateWebdavConfig("proxyMode", value as typeof webdav.proxyMode)} />
                                    </Form.Item>
                                    <Form.Item label="远端目录" className="mb-2">
                                        <Input value={webdav.directory} onChange={(event) => updateWebdavConfig("directory", event.target.value)} />
                                    </Form.Item>
                                    <Form.Item label="WebDAV 地址" className="mb-2 md:col-span-2">
                                        <Input value={webdav.url} placeholder="https://example.com/dav" onChange={(event) => updateWebdavConfig("url", event.target.value)} />
                                    </Form.Item>
                                    <Form.Item label="用户名" className="mb-2">
                                        <Input value={webdav.username} onChange={(event) => updateWebdavConfig("username", event.target.value)} />
                                    </Form.Item>
                                    <Form.Item label="密码 / 应用密码" className="mb-2">
                                        <Input.Password value={webdav.password} onChange={(event) => updateWebdavConfig("password", event.target.value)} />
                                    </Form.Item>
                                </Form>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button loading={testingWebdav} onClick={testWebdav}>测试连接</Button>
                                    <Button type="primary" loading={syncingWebdav} onClick={syncWebdav}>立即同步</Button>
                                    {webdav.lastSyncedAt ? <span className="text-xs text-gray-500">上次同步：{formatWebdavTime(webdav.lastSyncedAt)}</span> : null}
                                </div>
                                {webdavSyncStatus ? <div className="text-xs text-gray-500">{webdavSyncStatus}</div> : null}
                                <WebdavProgressGrid progress={webdavDomainProgress} />
                            </div>
                        ),
                    },
                ]}
            />
        </Modal>
    );
}

function normalizeImageCount(value: string) {
    return String(Math.max(1, Math.min(15, Math.floor(Math.abs(Number(value)) || 1))));
}

function formatWebdavTime(value: string) {
    return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function WebdavProgressGrid({ progress }: { progress: Record<AppSyncDomainKey, WebdavDomainProgress> }) {
    return (
        <div className="grid gap-2">
            {webdavDomainKeys.map((key) => {
                const item = progress[key];
                const count = item.total ? String(item.current || 0) + "/" + item.total : "";
                return (
                    <div key={key} className="rounded-xl border border-black/10 px-3 py-2 dark:border-white/10">
                        <div className="mb-1 flex min-w-0 items-center justify-between gap-3 text-xs">
                            <span className="shrink-0 font-medium">{item.label}</span>
                            <span className="min-w-0 truncate text-right text-gray-500">
                                {item.stage}
                                {count ? " · " + count : ""}
                            </span>
                        </div>
                        <Progress percent={getWebdavProgressPercent(item)} size="small" status={getWebdavProgressStatus(item)} showInfo={false} />
                    </div>
                );
            })}
        </div>
    );
}

function getWebdavProgressPercent(item: WebdavDomainProgress) {
    if (item.status === "success") return 100;
    if (item.total) return Math.min(100, Math.round(((item.current || 0) / item.total) * 100));
    if (item.status === "exception") return 100;
    if (item.stage === "等待同步") return 0;
    if (item.stage.includes("读取")) return 20;
    if (item.stage.includes("下载")) return 40;
    if (item.stage.includes("写入")) return 60;
    if (item.stage.includes("上传")) return 80;
    if (item.stage.includes("完成")) return 100;
    return item.status === "active" ? 30 : 0;
}

function getWebdavProgressStatus(item: WebdavDomainProgress): "normal" | "active" | "success" | "exception" {
    if (item.status === "success" || item.status === "exception") return item.status;
    return item.status === "active" ? "active" : "normal";
}
