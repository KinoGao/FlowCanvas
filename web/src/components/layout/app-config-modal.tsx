"use client";

import { App, Button, Form, Input, Modal, Progress, Segmented, Select, Tabs } from "antd";
import { CircleAlert, Cloud, Plus, RefreshCw, Trash2, Wifi, Workflow } from "lucide-react";
import { useState } from "react";

import { ModelPicker } from "@/components/model-picker";
import { loginUser, logoutUser, registerUser } from "@/services/api/auth";
import { testComfyConnection } from "@/services/api/comfyui";
import { fetchChannelModels } from "@/services/api/image";
import { syncAppDataToWebdav, type AppSyncDomainKey, type AppSyncProgressEvent } from "@/services/app-sync";
import { testWebdavConnection, WEBDAV_MANIFEST_FILE_NAME } from "@/services/webdav-sync";
import { audioFormatOptions, audioVoiceOptions, normalizeAudioSpeedValue } from "@/lib/audio-generation";
import {
    createModelChannel,
    defaultBaseUrlForApiFormat,
    encodeChannelModel,
    filterModelsByCapability,
    modelOptionLabel,
    modelOptionsFromChannels,
    normalizeModelOptionValue,
    useConfigStore,
    type AiConfig,
    type ApiCallFormat,
    type ImageResponseFormatPolicy,
    type ModelCapability,
    type ModelChannel,
} from "@/stores/use-config-store";
import { useUserStore, type SaveMode } from "@/stores/use-user-store";

type ModelGroup = {
    capability: ModelCapability;
    modelKey: "imageModel" | "videoModel" | "textModel" | "audioModel";
    modelsKey: "imageModels" | "videoModels" | "textModels" | "audioModels";
    defaultLabel: string;
    optionsLabel: string;
};

type WebdavDomainProgress = {
    label: string;
    stage: string;
    current?: number;
    total?: number;
    status?: "active" | "success" | "exception";
};

const modelGroups: ModelGroup[] = [
    { capability: "image", modelKey: "imageModel", modelsKey: "imageModels", defaultLabel: "默认生图模型", optionsLabel: "生图模型可选项" },
    { capability: "video", modelKey: "videoModel", modelsKey: "videoModels", defaultLabel: "默认视频模型", optionsLabel: "视频模型可选项" },
    { capability: "text", modelKey: "textModel", modelsKey: "textModels", defaultLabel: "默认文本模型", optionsLabel: "文本模型可选项" },
    { capability: "audio", modelKey: "audioModel", modelsKey: "audioModels", defaultLabel: "默认音频模型", optionsLabel: "音频模型可选项" },
];

const apiFormatOptions: Array<{ label: string; value: ApiCallFormat }> = [
    { label: "OpenAI", value: "openai" },
    { label: "Gemini", value: "gemini" },
];

const imageResponseFormatOptions: Array<{ label: string; value: ImageResponseFormatPolicy; description: string }> = [
    { value: "auto", label: "自动", description: "仅当模型名为 OpenAI 生图系列（dall-e / gpt-image）时携带 b64_json" },
    { value: "b64_json", label: "强制 b64_json", description: "始终请求 base64 响应" },
    { value: "url", label: "强制 URL", description: "不携带 response_format，让模型返回 URL 或 base64" },
];

const webdavDomainKeys: AppSyncDomainKey[] = ["config", "canvas", "assets", "image-workbench", "video-workbench"];
const webdavDomainLabels: Record<AppSyncDomainKey, string> = {
    config: "配置",
    canvas: "画布",
    assets: "我的素材",
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
    const [activeTab, setActiveTab] = useState("channels");
    const [loadingChannelId, setLoadingChannelId] = useState("");
    const [testingWebdav, setTestingWebdav] = useState(false);
    const [testingComfyUi, setTestingComfyUi] = useState(false);
    const [syncingWebdav, setSyncingWebdav] = useState(false);
    const [authMode, setAuthMode] = useState<"login" | "register">("login");
    const [authLoading, setAuthLoading] = useState(false);
    const [authForm, setAuthForm] = useState({ username: "", password: "", displayName: "", authCode: "" });
    const [webdavSyncStatus, setWebdavSyncStatus] = useState("");
    const [webdavDomainProgress, setWebdavDomainProgress] = useState(createWebdavDomainProgress);
    const config = useConfigStore((state) => state.config);
    const webdav = useConfigStore((state) => state.webdav);
    const comfyui = useConfigStore((state) => state.comfyui);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const updateWebdavConfig = useConfigStore((state) => state.updateWebdavConfig);
    const updateComfyUiConfig = useConfigStore((state) => state.updateComfyUiConfig);
    const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
    const shouldPromptContinue = useConfigStore((state) => state.shouldPromptContinue);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    const clearPromptContinue = useConfigStore((state) => state.clearPromptContinue);
    const saveMode = useUserStore((state) => state.saveMode);
    const setSaveMode = useUserStore((state) => state.setSaveMode);
    const user = useUserStore((state) => state.user);
    const token = useUserStore((state) => state.token);
    const setSession = useUserStore((state) => state.setSession);
    const clearSession = useUserStore((state) => state.clearSession);
    const modelOptions = config.models.map((model) => ({ label: modelOptionLabel(config, model), value: model }));
    const webdavReady = Boolean(webdav.url.trim());
    const comfyUiReady = Boolean(comfyui.baseUrl.trim());

    const saveConfig = (nextConfig: AiConfig) => {
        (Object.keys(nextConfig) as Array<keyof AiConfig>).forEach((key) => updateConfig(key, nextConfig[key]));
    };

    const changeSaveMode = (mode: SaveMode) => {
        setSaveMode(mode);
        if (mode === "backend" && !token) message.info("请先登录后端账号，登录后会自动同步该账号的数据");
        if (mode === "webdav") setActiveTab("webdav");
    };

    const submitAuth = async () => {
        if (!authForm.username.trim() || !authForm.password) {
            message.error("请填写用户名和密码");
            return;
        }
        if (authMode === "register" && !authForm.authCode.trim()) {
            message.error("请填写后端鉴权码");
            return;
        }
        setAuthLoading(true);
        try {
            const result =
                authMode === "register"
                    ? await registerUser({ username: authForm.username, password: authForm.password, displayName: authForm.displayName, authCode: authForm.authCode })
                    : await loginUser({ username: authForm.username, password: authForm.password });
            setSession(result.user, result.token);
            setSaveMode("backend");
            message.success(authMode === "register" ? "注册并登录成功" : "登录成功");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "登录失败");
        } finally {
            setAuthLoading(false);
        }
    };

    const logoutBackend = async () => {
        try {
            if (token) await logoutUser(token);
        } catch {
            // 本地退出仍继续执行，避免后端会话异常阻断用户。
        }
        clearSession();
        message.success("已退出后端账号");
    };

    const finishConfig = () => {
        const ready = config.channels.some((channel) => channel.baseUrl.trim() && channel.apiKey.trim() && channel.models.length);
        setConfigDialogOpen(false);
        if (!ready) return;
        message.success(shouldPromptContinue ? "配置已保存，请继续刚才的请求" : "配置已保存");
        clearPromptContinue();
    };

    const updateChannels = (channels: ModelChannel[]) => {
        const nextConfig = withChannels(config, channels);
        saveConfig(nextConfig);
    };

    const updateChannel = (id: string, patch: Partial<ModelChannel>) => {
        updateChannels(config.channels.map((channel) => (channel.id === id ? { ...channel, ...patch, models: patch.models ? uniqueModels(patch.models) : channel.models } : channel)));
    };

    const updateChannelApiFormat = (channel: ModelChannel, apiFormat: ApiCallFormat) => {
        const baseUrl = !channel.baseUrl.trim() || channel.baseUrl.trim() === defaultBaseUrlForApiFormat(channel.apiFormat) ? defaultBaseUrlForApiFormat(apiFormat) : channel.baseUrl;
        updateChannel(channel.id, { apiFormat, baseUrl });
    };

    const addChannel = () => {
        updateChannels([...config.channels, createModelChannel({ name: `渠道 ${config.channels.length + 1}` })]);
    };

    const deleteChannel = (id: string) => {
        if (config.channels.length <= 1) {
            message.warning("至少保留一个渠道");
            return;
        }
        updateChannels(config.channels.filter((channel) => channel.id !== id));
    };

    const refreshChannelModels = async (channel: ModelChannel) => {
        if (!channel.baseUrl.trim() || !channel.apiKey.trim()) {
            message.error("请先填写该渠道的 Base URL 和 API Key");
            return;
        }
        setLoadingChannelId(channel.id);
        try {
            const models = await fetchChannelModels(channel);
            updateChannels(config.channels.map((item) => (item.id === channel.id ? { ...item, models } : item)));
            message.success(`${channel.name} 模型列表已更新`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取模型失败");
        } finally {
            setLoadingChannelId("");
        }
    };

    const refreshAllModels = async () => {
        const runnable = config.channels.filter((channel) => channel.baseUrl.trim() && channel.apiKey.trim());
        if (!runnable.length) {
            message.error("请先填写至少一个渠道的 Base URL 和 API Key");
            return;
        }
        setLoadingChannelId("all");
        try {
            const entries = await Promise.all(runnable.map(async (channel) => [channel.id, await fetchChannelModels(channel)] as const));
            const modelMap = new Map(entries);
            updateChannels(config.channels.map((channel) => (modelMap.has(channel.id) ? { ...channel, models: modelMap.get(channel.id) || [] } : channel)));
            message.success("模型列表已更新");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "读取模型失败");
        } finally {
            setLoadingChannelId("");
        }
    };

    const updateCapabilityModels = (group: ModelGroup, models: string[]) => {
        const next = uniqueModels(models.map((model) => normalizeModelOptionValue(model, config.channels)).filter(Boolean));
        updateConfig(group.modelsKey, next);
        if (!next.includes(config[group.modelKey])) updateConfig(group.modelKey, next[0] || "");
    };

    const testWebdav = async () => {
        if (!webdavReady) {
            message.error("请先填写 WebDAV 地址");
            return;
        }
        setTestingWebdav(true);
        try {
            await testWebdavConnection(webdav);
            message.success("WebDAV 连接可用");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "WebDAV 连接测试失败");
        } finally {
            setTestingWebdav(false);
        }
    };

    const testComfyUi = async () => {
        if (!comfyUiReady) {
            message.error("请先填写 ComfyUI 地址");
            return;
        }
        setTestingComfyUi(true);
        try {
            await testComfyConnection(comfyui);
            message.success("ComfyUI 连接可用");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "ComfyUI 连接测试失败");
        } finally {
            setTestingComfyUi(false);
        }
    };

    const updateWebdavProgress = (event: AppSyncProgressEvent) => {
        setWebdavSyncStatus(event.stage);
        if (!event.domain) return;
        setWebdavDomainProgress((current) => ({
            ...current,
            [event.domain as AppSyncDomainKey]: {
                label: event.label || webdavDomainLabels[event.domain as AppSyncDomainKey],
                stage: event.stage,
                current: event.current,
                total: event.total,
                status: event.status,
            },
        }));
    };

    const syncWebdav = async () => {
        if (!webdavReady) {
            message.error("请先填写 WebDAV 地址");
            return;
        }
        setSyncingWebdav(true);
        setWebdavDomainProgress(createWebdavDomainProgress());
        setWebdavSyncStatus("准备同步");
        try {
            const result = await syncAppDataToWebdav(webdav, updateWebdavProgress);
            updateWebdavConfig("lastSyncedAt", result.syncedAt);
            message.success(`同步完成：${result.projects} 个画布，${result.assets} 个素材，${result.imageLogs + result.videoLogs} 条记录，本次上传 ${result.uploadedFiles} 个文件 ${formatBytes(result.uploadedBytes)}`);
        } catch (error) {
            setWebdavSyncStatus(error instanceof Error ? error.message : "WebDAV 同步失败");
            message.error(error instanceof Error ? error.message : "WebDAV 同步失败");
        } finally {
            setSyncingWebdav(false);
        }
    };

    return (
        <Modal
            title={
                <div>
                    <div className="text-lg font-semibold">配置与用户偏好</div>
                    <div className="mt-1 text-xs font-normal text-stone-500">渠道聚合、模型选择和同步偏好</div>
                </div>
            }
            open={isConfigOpen}
            width={980}
            centered
            onCancel={() => setConfigDialogOpen(false)}
            styles={{ body: { maxHeight: "72vh", overflowY: "auto", paddingRight: 12 } }}
            footer={
                <Button type="primary" onClick={finishConfig}>
                    完成
                </Button>
            }
        >
            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={[
                    {
                        key: "storage",
                        label: "保存位置",
                        children: (
                            <Form layout="vertical" requiredMark={false}>
                                <section className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                                    <div className="mb-3 text-sm font-semibold">数据保存模式</div>
                                    <Segmented
                                        block
                                        value={saveMode}
                                        onChange={(value) => changeSaveMode(value as SaveMode)}
                                        options={[
                                            { label: "本地浏览器", value: "local" },
                                            { label: "本地后端账号", value: "backend" },
                                            { label: "云端 WebDAV", value: "webdav" },
                                        ]}
                                    />
                                    <div className="mt-3 text-xs text-stone-500">
                                        本地模式保存在当前浏览器；后端模式按登录账号同步画布、素材、配置和媒体；WebDAV 模式保留原有云端同步能力。
                                    </div>
                                </section>

                                <section className="mt-3 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                                    <div className="mb-3 flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-semibold">后端账号</div>
                                            <div className="mt-1 text-xs text-stone-500">仅在“本地后端账号”保存模式下使用。</div>
                                        </div>
                                        {user ? (
                                            <Button danger onClick={() => void logoutBackend()}>
                                                退出登录
                                            </Button>
                                        ) : null}
                                    </div>

                                    {user ? (
                                        <div className="rounded-md bg-stone-100 px-3 py-2 text-sm dark:bg-stone-900">
                                            当前账号：<span className="font-semibold">{user.displayName || user.username}</span>
                                            <span className="ml-2 text-xs text-stone-500">@{user.username}</span>
                                        </div>
                                    ) : (
                                        <div className="grid gap-3 md:grid-cols-2">
                                            <Form.Item label="用户名" className="mb-0">
                                                <Input value={authForm.username} autoComplete="username" onChange={(event) => setAuthForm((current) => ({ ...current, username: event.target.value }))} />
                                            </Form.Item>
                                            {authMode === "register" ? (
                                                <Form.Item label="显示名" className="mb-0">
                                                    <Input value={authForm.displayName} onChange={(event) => setAuthForm((current) => ({ ...current, displayName: event.target.value }))} />
                                                </Form.Item>
                                            ) : null}
                                            <Form.Item label="密码" className="mb-0">
                                                <Input.Password value={authForm.password} autoComplete={authMode === "login" ? "current-password" : "new-password"} onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))} />
                                            </Form.Item>
                                            {authMode === "register" ? (
                                                <Form.Item label="后端鉴权码" extra="填写后端配置中的 AUTH_CODE，用于允许创建新账号。" className="mb-0">
                                                    <Input.Password value={authForm.authCode} autoComplete="off" onChange={(event) => setAuthForm((current) => ({ ...current, authCode: event.target.value }))} />
                                                </Form.Item>
                                            ) : null}
                                            <div className="flex items-end gap-2">
                                                <Button type="primary" loading={authLoading} onClick={() => void submitAuth()}>
                                                    {authMode === "login" ? "登录" : "注册并登录"}
                                                </Button>
                                                <Button onClick={() => setAuthMode((mode) => (mode === "login" ? "register" : "login"))}>{authMode === "login" ? "去注册" : "去登录"}</Button>
                                            </div>
                                        </div>
                                    )}
                                </section>
                            </Form>
                        ),
                    },
                    {
                        key: "channels",
                        label: "渠道",
                        children: (
                            <Form layout="vertical" requiredMark={false}>
                                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex w-fit max-w-full flex-wrap items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
                                            <CircleAlert className="size-3.5 shrink-0" />
                                            <span className="font-semibold">重要：</span>
                                            <span>新增或拉取模型后，需要到“模型”Tab 选择可选项才会显示。</span>
                                            <Button type="link" size="small" className="h-auto p-0 text-xs font-semibold text-amber-900 dark:text-amber-100" onClick={() => setActiveTab("models")}>
                                                去模型设置
                                            </Button>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 gap-2">
                                        <Button icon={<RefreshCw className="size-4" />} loading={Boolean(loadingChannelId)} onClick={() => void refreshAllModels()}>
                                            拉取全部
                                        </Button>
                                        <Button type="primary" icon={<Plus className="size-4" />} onClick={addChannel}>
                                            新增渠道
                                        </Button>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    {config.channels.map((channel) => (
                                        <section key={channel.id} className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                                            <div className="mb-3 flex items-center justify-between gap-3">
                                                <div className="min-w-0">
                                                    <div className="truncate text-sm font-semibold">{channel.name || "未命名渠道"}</div>
                                                    <div className="mt-1 text-xs text-stone-500">
                                                        {apiFormatLabel(channel.apiFormat)} · 已保存 {channel.models.length} 个模型
                                                    </div>
                                                </div>
                                                <div className="flex shrink-0 gap-2">
                                                    <Button size="small" loading={loadingChannelId === channel.id} onClick={() => void refreshChannelModels(channel)}>
                                                        拉取模型
                                                    </Button>
                                                    <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => deleteChannel(channel.id)} />
                                                </div>
                                            </div>
                                            <div className="grid gap-4 md:grid-cols-2">
                                                <Form.Item label="渠道名称" className="mb-0">
                                                    <Input value={channel.name} onChange={(event) => updateChannel(channel.id, { name: event.target.value })} />
                                                </Form.Item>
                                                <Form.Item label="调用格式" className="mb-0">
                                                    <Select value={channel.apiFormat} options={apiFormatOptions} onChange={(value: ApiCallFormat) => updateChannelApiFormat(channel, value)} />
                                                </Form.Item>
                                                <Form.Item label="Base URL" className="mb-0">
                                                    <Input value={channel.baseUrl} onChange={(event) => updateChannel(channel.id, { baseUrl: event.target.value })} />
                                                </Form.Item>
                                                <Form.Item label="API Key" className="mb-0">
                                                    <Input.Password value={channel.apiKey} onChange={(event) => updateChannel(channel.id, { apiKey: event.target.value })} />
                                                </Form.Item>
                                                <Form.Item label="模型列表" className="mb-0 md:col-span-2">
                                                    <Select mode="tags" showSearch allowClear maxTagCount="responsive" placeholder="输入模型名，或点击拉取模型" value={channel.models} onChange={(models) => updateChannel(channel.id, { models })} />
                                                </Form.Item>
                                                <Form.Item
                                                    label={
                                                        <span className="flex items-center gap-1.5">
                                                            <Wifi className="size-3.5" />
                                                            代理模式
                                                        </span>
                                                    }
                                                    extra="服务不支持 CORS 时勾选后端代理，请求会走 FlowCanvas 后端服务。"
                                                    className="mb-0 md:col-span-2"
                                                >
                                                    <Segmented
                                                        block
                                                        value={channel.useProxy ? "backend" : "direct"}
                                                        onChange={(value) => updateChannel(channel.id, { useProxy: value === "backend" })}
                                                        options={[
                                                            { label: "前端直连", value: "direct" },
                                                            { label: "后端代理", value: "backend" },
                                                        ]}
                                                    />
                                                </Form.Item>
                                            </div>
                                        </section>
                                    ))}
                                </div>
                            </Form>
                        ),
                    },
                    {
                        key: "models",
                        label: "模型",
                        children: (
                            <Form layout="vertical" requiredMark={false}>
                                <div className="mb-4 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                                    <div className="text-sm font-semibold">默认模型和可选项</div>
                                    <div className="mt-1 text-xs leading-5 text-stone-500">可选项决定各处下拉框展示哪些模型；同名模型会以括号里的渠道名区分。</div>
                                </div>
                                <div className="grid gap-4 md:grid-cols-2">
                                    {modelGroups.map((group) => (
                                        <Form.Item key={group.modelsKey} label={group.optionsLabel} className="mb-0">
                                            <Select
                                                mode="tags"
                                                showSearch
                                                allowClear
                                                maxTagCount="responsive"
                                                placeholder={config.models.length ? `请选择或输入${group.optionsLabel}` : "先到渠道里填写或拉取模型"}
                                                value={config[group.modelsKey]}
                                                options={modelOptions}
                                                onChange={(models) => updateCapabilityModels(group, models)}
                                            />
                                        </Form.Item>
                                    ))}
                                </div>
                                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                    {modelGroups.map((group) => (
                                        <Form.Item key={group.modelKey} label={group.defaultLabel} className="mb-0">
                                            <ModelPicker config={config} value={config[group.modelKey]} onChange={(model) => updateConfig(group.modelKey, model)} capability={group.capability} fullWidth />
                                        </Form.Item>
                                    ))}
                                </div>
                            </Form>
                        ),
                    },
                    {
                        key: "preferences",
                        label: "生成偏好",
                        children: (
                            <Form layout="vertical" requiredMark={false}>
                                <div className="grid gap-4 md:grid-cols-4">
                                    <Form.Item label="画布默认生图张数" extra="新建画布生图和配置节点默认使用，单个节点仍可单独覆盖。" className="mb-4">
                                        <Input
                                            type="number"
                                            min={1}
                                            max={15}
                                            value={config.canvasImageCount}
                                            onChange={(event) => updateConfig("canvasImageCount", event.target.value)}
                                            onBlur={(event) => updateConfig("canvasImageCount", normalizeImageCount(event.target.value))}
                                        />
                                    </Form.Item>
                                    <Form.Item label="生图响应格式" extra="自定义模型走 litellm 代理时，b64_json 可能触发 UnsupportedParamsError，可切换为自动/URL 模式。" className="mb-4">
                                        <Select value={config.imageResponseFormat || "auto"} options={imageResponseFormatOptions.map(({ value, label }) => ({ value, label }))} onChange={(value) => updateConfig("imageResponseFormat", value)} />
                                    </Form.Item>
                                    <Form.Item label="默认音频声音" className="mb-4">
                                        <Select value={config.audioVoice} options={audioVoiceOptions} onChange={(value) => updateConfig("audioVoice", value)} />
                                    </Form.Item>
                                    <Form.Item label="默认音频格式" className="mb-4">
                                        <Select value={config.audioFormat} options={audioFormatOptions} onChange={(value) => updateConfig("audioFormat", value)} />
                                    </Form.Item>
                                    <Form.Item label="默认音频语速" className="mb-4">
                                        <Input
                                            type="number"
                                            min={0.25}
                                            max={4}
                                            step={0.05}
                                            value={config.audioSpeed}
                                            onChange={(event) => updateConfig("audioSpeed", event.target.value)}
                                            onBlur={(event) => updateConfig("audioSpeed", normalizeAudioSpeedValue(event.target.value))}
                                        />
                                    </Form.Item>
                                </div>
                                <Form.Item label="默认音频指令" className="mb-4">
                                    <Input.TextArea rows={2} value={config.audioInstructions} placeholder="例如：自然、温暖、适合旁白。" onChange={(event) => updateConfig("audioInstructions", event.target.value)} />
                                </Form.Item>
                                <Form.Item label="系统提示词" className="mb-0">
                                    <Input.TextArea rows={4} value={config.systemPrompt} placeholder="例如：你是一位擅长电影感写实摄影的视觉导演。" onChange={(event) => updateConfig("systemPrompt", event.target.value)} />
                                </Form.Item>
                            </Form>
                        ),
                    },
                    {
                        key: "webdav",
                        label: "云端 WebDAV",
                        children: (
                            <Form layout="vertical" requiredMark={false}>
                                <section className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <div className="flex items-center gap-2 text-sm font-semibold">
                                                <Cloud className="size-4" />
                                                WebDAV 同步
                                            </div>
                                            <div className="mt-1 text-xs text-stone-500">同步画布、我的素材、生成记录和本地媒体文件，不包含 AI API Key；服务不支持 CORS 时可走后端代理。</div>
                                        </div>
                                        <div className="text-xs text-stone-500">{webdav.lastSyncedAt ? `上次同步 ${formatWebdavTime(webdav.lastSyncedAt)}` : "尚未同步"}</div>
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <Form.Item label="连接方式" className="mb-4 md:col-span-2">
                                            <Segmented
                                                block
                                                value={webdav.proxyMode}
                                                onChange={(value) => updateWebdavConfig("proxyMode", value as typeof webdav.proxyMode)}
                                                options={[
                                                    { label: "前端直连", value: "direct" },
                                                    { label: "后端代理", value: "backend" },
                                                ]}
                                            />
                                        </Form.Item>
                                        <Form.Item label="WebDAV 地址" className="mb-4">
                                            <Input value={webdav.url} placeholder="https://nas.example.com/webdav" onChange={(event) => updateWebdavConfig("url", event.target.value)} />
                                        </Form.Item>
                                        <Form.Item label="远程目录" extra={`会在该目录下分业务目录保存，每个目录包含 ${WEBDAV_MANIFEST_FILE_NAME} 和 files/`} className="mb-4">
                                            <Input value={webdav.directory} placeholder="infinite-canvas" onChange={(event) => updateWebdavConfig("directory", event.target.value)} />
                                        </Form.Item>
                                        <Form.Item label="用户名" className="mb-0">
                                            <Input value={webdav.username} autoComplete="username" onChange={(event) => updateWebdavConfig("username", event.target.value)} />
                                        </Form.Item>
                                        <Form.Item label="密码 / 应用密码" className="mb-0">
                                            <Input.Password value={webdav.password} autoComplete="current-password" onChange={(event) => updateWebdavConfig("password", event.target.value)} />
                                        </Form.Item>
                                    </div>
                                    <div className="mt-4 flex flex-wrap items-center gap-2">
                                        <Button icon={<Wifi className="size-4" />} disabled={!webdavReady || syncingWebdav} loading={testingWebdav} onClick={() => void testWebdav()}>
                                            测试连接
                                        </Button>
                                        <Button type="primary" icon={<RefreshCw className="size-4" />} disabled={!webdavReady || testingWebdav} loading={syncingWebdav} onClick={() => void syncWebdav()}>
                                            {syncingWebdav ? "同步中" : "立即同步"}
                                        </Button>
                                        {webdavSyncStatus ? <span className="text-xs text-stone-500">{webdavSyncStatus}</span> : null}
                                    </div>
                                    {syncingWebdav || webdavSyncStatus ? <WebdavProgressGrid progress={webdavDomainProgress} /> : null}
                                </section>
                            </Form>
                        ),
                    },
                    {
                        key: "comfyui",
                        label: "ComfyUI",
                        children: (
                            <Form layout="vertical" requiredMark={false}>
                                <section className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <div className="flex items-center gap-2 text-sm font-semibold">
                                                <Workflow className="size-4" />
                                                ComfyUI
                                            </div>
                                            <div className="mt-1 text-xs text-stone-500">配置本地或远端 ComfyUI 地址；工作流导入和暴露参数在独立页面管理。</div>
                                        </div>
                                        <Button href="/comfyui" icon={<Workflow className="size-4" />}>
                                            工作流配置
                                        </Button>
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <Form.Item label="连接方式" className="mb-4 md:col-span-2">
                                            <Segmented
                                                block
                                                value={comfyui.proxyMode}
                                                onChange={(value) => updateComfyUiConfig("proxyMode", value as typeof comfyui.proxyMode)}
                                                options={[
                                                    { label: "前端直连", value: "direct" },
                                                    { label: "后端代理", value: "backend" },
                                                ]}
                                            />
                                        </Form.Item>
                                        <Form.Item label="ComfyUI 地址" extra="本地默认是 http://127.0.0.1:8188；远端请填写完整 http/https 地址。" className="mb-4">
                                            <Input value={comfyui.baseUrl} placeholder="http://127.0.0.1:8188" onChange={(event) => updateComfyUiConfig("baseUrl", event.target.value)} />
                                        </Form.Item>
                                        <Form.Item label="Client ID" className="mb-4">
                                            <Input value={comfyui.clientId} placeholder="flow-canvas" onChange={(event) => updateComfyUiConfig("clientId", event.target.value)} />
                                        </Form.Item>
                                        <Form.Item label="任务超时（秒）" className="mb-0">
                                            <Input type="number" min={10} value={comfyui.timeoutSeconds} onChange={(event) => updateComfyUiConfig("timeoutSeconds", event.target.value)} />
                                        </Form.Item>
                                        <Form.Item label="轮询间隔（毫秒）" className="mb-0">
                                            <Input type="number" min={500} value={comfyui.pollIntervalMs} onChange={(event) => updateComfyUiConfig("pollIntervalMs", event.target.value)} />
                                        </Form.Item>
                                    </div>
                                    <div className="mt-4 flex flex-wrap items-center gap-2">
                                        <Button icon={<Wifi className="size-4" />} disabled={!comfyUiReady} loading={testingComfyUi} onClick={() => void testComfyUi()}>
                                            测试连接
                                        </Button>
                                        <span className="text-xs text-stone-500">后端代理可避免浏览器 CORS；部署公网时不要把它暴露给不可信用户。</span>
                                    </div>
                                </section>
                            </Form>
                        ),
                    },
                ]}
            />
        </Modal>
    );
}

function withChannels(config: AiConfig, channels: ModelChannel[]): AiConfig {
    const models = modelOptionsFromChannels(channels);
    const imageModels = keepOrSuggest(config.imageModels, filterModelsByCapability(models, "image"), models);
    const videoModels = keepOrSuggest(config.videoModels, filterModelsByCapability(models, "video"), models);
    const textModels = keepOrSuggest(config.textModels, filterModelsByCapability(models, "text"), models);
    const audioModels = keepOrSuggest(config.audioModels, filterModelsByCapability(models, "audio"), models);
    return {
        ...config,
        channels,
        models,
        baseUrl: channels[0]?.baseUrl || config.baseUrl,
        apiKey: channels[0]?.apiKey || config.apiKey,
        apiFormat: channels[0]?.apiFormat || config.apiFormat,
        imageModels,
        videoModels,
        textModels,
        audioModels,
        imageModel: normalizeDefaultModel(config.imageModel, imageModels),
        videoModel: normalizeDefaultModel(config.videoModel, videoModels),
        textModel: normalizeDefaultModel(config.textModel, textModels),
        audioModel: normalizeDefaultModel(config.audioModel, audioModels),
    };
}

function keepOrSuggest(current: string[], suggested: string[], allModels: string[]) {
    const available = new Set(allModels);
    const kept = uniqueModels(current).filter((model) => available.has(model));
    return kept.length ? kept : suggested;
}

function normalizeDefaultModel(value: string, options: string[]) {
    if (options.includes(value)) return value;
    return options[0] || value;
}

function normalizeImageCount(value: string) {
    return String(Math.max(1, Math.min(15, Math.floor(Math.abs(Number(value)) || 3))));
}

function uniqueModels(models: string[]) {
    return Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)));
}

function apiFormatLabel(apiFormat: ApiCallFormat) {
    return apiFormat === "gemini" ? "Gemini" : "OpenAI";
}

function formatWebdavTime(value: string) {
    return new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function WebdavProgressGrid({ progress }: { progress: Record<AppSyncDomainKey, WebdavDomainProgress> }) {
    return (
        <div className="mt-3 grid gap-2">
            {webdavDomainKeys.map((key) => {
                const item = progress[key];
                const count = item.total ? `${item.current || 0}/${item.total}` : "";
                return (
                    <div key={key} className="rounded-md border border-stone-200 px-3 py-2 dark:border-stone-800">
                        <div className="mb-1 flex min-w-0 items-center justify-between gap-3 text-xs">
                            <span className="shrink-0 font-medium text-stone-700 dark:text-stone-200">{item.label}</span>
                            <span className="min-w-0 truncate text-right text-stone-500">
                                {item.stage}
                                {count ? ` · ${count}` : ""}
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
    if (item.stage === "读取远端清单") return 12;
    if (item.stage === "读取本地数据") return 24;
    if (item.stage === "下载缺失媒体") return 36;
    if (item.stage === "写入本地合并结果") return 58;
    if (item.stage === "上传新增媒体") return 66;
    if (item.stage === "媒体已齐全" || item.stage === "媒体无需上传") return 74;
    if (item.stage.startsWith("上传清单")) return 90;
    return item.status === "active" ? 30 : 0;
}

function getWebdavProgressStatus(item: WebdavDomainProgress): "normal" | "active" | "success" | "exception" {
    if (item.status === "success" || item.status === "exception") return item.status;
    return item.status === "active" ? "active" : "normal";
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
