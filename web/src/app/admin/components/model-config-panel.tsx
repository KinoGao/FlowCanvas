import { App, Button, Checkbox, Drawer, Form, Input, InputNumber, Segmented, Select, Space, Switch, Table, Tag } from "antd";
import { Pencil, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminCard } from "./admin-card";
import { applyModelCategory, cloneModel, emptyModel, emptyProvider, IMAGE_RATIOS, normalizeModel, normalizePlatformConfig, numberOr, replaceById } from "../platform-config-utils";
import { discoverProviderModels, fetchModelProtocols, savePlatformConfig, verifyPlatformModel, type AudioCapabilities, type ImageCapabilities, type ModelCategory, type ModelProtocol, type PlatformConfigDocument, type PlatformModel, type PlatformProvider, type TextCapabilities, type VideoCapabilities } from "@/services/api/platform-admin";

const CATEGORY_OPTIONS = [{ value: "text", label: "文本" }, { value: "image", label: "图像" }, { value: "video", label: "视频" }, { value: "audio", label: "音频" }];
const CATEGORY_LABELS: Record<ModelCategory, string> = { text: "文本", image: "图像", video: "视频", audio: "音频" };
const TEXT_MODES = [{ value: "text", label: "纯文本" }, { value: "vision", label: "识图 / 多模态" }];
const IMAGE_MODES = [{ value: "text-to-image", label: "文生图" }, { value: "image-to-image", label: "图生图" }, { value: "image-edit", label: "图像编辑" }];
const IMAGE_QUALITIES = [{ value: "low", label: "低画质" }, { value: "standard", label: "标准画质" }, { value: "high", label: "高画质" }];
const IMAGE_RESOLUTIONS = ["1k", "2k", "3k", "4k"].map((value) => ({ value, label: value.toUpperCase() }));
const VIDEO_MODES = [
    { value: "text-to-video", label: "文生视频" }, { value: "all-in-one-reference", label: "全能参考" },
    { value: "image-to-video", label: "首帧图生视频" }, { value: "first-last-frame", label: "首尾帧图生视频" },
    { value: "image-reference", label: "图片参考" }, { value: "multi-frame", label: "智能多帧" },
];
const FALLBACK_PROTOCOLS: ModelProtocol[] = [
    { id: "openai", name: "OpenAI 直连", description: "OpenAI 兼容的同步或异步接口" },
    { id: "gemini", name: "Gemini 协议", description: "Gemini 原生接口" },
    { id: "agnes-v2", name: "异步协议 · Agnes Video V2", description: "Agnes 视频任务接口" },
    { id: "seedance-v1", name: "方舟 / Ark 任务协议 · Seedance 1.0", description: "火山方舟异步视频任务" },
    { id: "seedance-v1.5", name: "方舟 / Ark 任务协议 · Seedance 1.5", description: "火山方舟异步视频任务" },
    { id: "seedance-v2", name: "方舟 / Ark 任务协议 · Seedance 2.0", description: "火山方舟异步视频任务" },
];

type Props = { authToken: string; config: PlatformConfigDocument; onChange: (config: PlatformConfigDocument) => void };

export function ModelConfigPanel({ authToken, config, onChange }: Props) {
    const { message, modal } = App.useApp();
    const [providerDraft, setProviderDraft] = useState<PlatformProvider | null>(null);
    const [providerOriginalId, setProviderOriginalId] = useState("");
    const [modelDraft, setModelDraft] = useState<PlatformModel | null>(null);
    const [modelOriginalId, setModelOriginalId] = useState("");
    const [discovered, setDiscovered] = useState<Record<string, string[]>>({});
    const [protocols, setProtocols] = useState<ModelProtocol[]>(FALLBACK_PROTOCOLS);
    const [discovering, setDiscovering] = useState("");
    const [verifying, setVerifying] = useState("");

    useEffect(() => {
        let cancelled = false;
        void fetchModelProtocols(authToken).then((items) => {
            if (!cancelled && items.length) setProtocols(items);
        }).catch(() => undefined);
        return () => { cancelled = true; };
    }, [authToken]);

    const editProvider = (item?: PlatformProvider) => { setProviderOriginalId(item?.id || ""); setProviderDraft(item ? { ...item } : emptyProvider()); };
    const editModel = (item?: PlatformModel) => { setModelOriginalId(item?.id || ""); setModelDraft(item ? cloneModel(item) : emptyModel(config.providers[0]?.id || "")); };
    const classify = (providerId: string, requestModel: string, category: ModelCategory) => {
        const existing = config.models.find((item) => item.providerId === providerId && item.requestModel === requestModel);
        setModelOriginalId(existing?.id || "");
        setModelDraft(existing ? applyModelCategory(cloneModel(existing), category) : emptyModel(providerId, category, requestModel));
    };

    const saveProvider = () => {
        if (!providerDraft) return;
        const item = { ...providerDraft, id: providerDraft.id.trim().toLowerCase(), name: providerDraft.name.trim(), baseUrl: providerDraft.baseUrl.trim().replace(/\/$/, ""), modelsPath: providerDraft.modelsPath.trim() || (providerDraft.apiFormat === "gemini" ? "/v1beta/models" : "/models") };
        if (!item.id || !item.name) return void message.warning("请填写厂商 ID 和名称");
        if (config.providers.some((next) => next.id === item.id && next.id !== providerOriginalId)) return void message.warning("厂商 ID 已存在");
        const models = providerOriginalId && providerOriginalId !== item.id ? config.models.map((model) => model.providerId === providerOriginalId ? { ...model, providerId: item.id } : model) : config.models;
        onChange({ ...config, providers: replaceById(config.providers, providerOriginalId, item), models });
        setProviderDraft(null);
    };

    const saveModel = () => {
        if (!modelDraft) return;
        const item = normalizeModel(modelDraft);
        if (!item.id || !item.displayName || !item.providerId || !item.requestModel) return void message.warning("请完整填写模型 ID、名称、厂商和实际请求模型");
        if (config.models.some((next) => next.id === item.id && next.id !== modelOriginalId)) return void message.warning("稳定模型 ID 已存在");
        onChange({ ...config, models: replaceById(config.models, modelOriginalId, item) });
        setModelDraft(null);
    };

    const removeProvider = (provider: PlatformProvider) => modal.confirm({ title: "删除厂商？", content: "该厂商下已配置的模型也会移除。", okText: "删除", okButtonProps: { danger: true }, onOk: () => onChange({ ...config, providers: config.providers.filter((item) => item.id !== provider.id), models: config.models.filter((item) => item.providerId !== provider.id) }) });
    const removeModel = (model: PlatformModel) => modal.confirm({ title: "删除模型？", content: model.displayName || model.id, okText: "删除", okButtonProps: { danger: true }, onOk: () => onChange({ ...config, models: config.models.filter((item) => item.id !== model.id) }) });
    const discover = async (provider: PlatformProvider) => {
        setDiscovering(provider.id);
        try {
            const saved = normalizePlatformConfig(await savePlatformConfig(authToken, normalizePlatformConfig(config)));
            onChange(saved);
            const models = await discoverProviderModels(authToken, provider.id);
            setDiscovered((current) => ({ ...current, [provider.id]: models }));
            message.success("厂商认证通过，已获取 " + models.length + " 个模型");
        } catch (error) { message.error(error instanceof Error ? error.message : "厂商认证或模型拉取失败"); }
        finally { setDiscovering(""); }
    };
    const verifyModel = async (model: PlatformModel) => {
        setVerifying(model.id);
        try {
            await savePlatformConfig(authToken, normalizePlatformConfig(config));
            const next = normalizePlatformConfig(await verifyPlatformModel(authToken, model.id));
            onChange(next);
            const verified = next.models.find((item) => item.id === model.id);
            if (verified?.verificationStatus === "verified") message.success("厂商认证通过且模型存在，可以发布到画布");
            else message.warning(verified?.verificationMessage || "模型验证未通过");
        } catch (error) { message.error(error instanceof Error ? error.message : "模型验证失败"); }
        finally { setVerifying(""); }
    };

    return <div className="space-y-5">
        <AdminCard title="模型厂商" description="先配置厂商地址、API Key 和协议，再通过后端认证拉取当前账号真实可用的模型。密钥不会下发到创作端。" action={<Button icon={<Plus className="size-4" />} onClick={() => editProvider()}>添加厂商</Button>}>
            <Table rowKey="id" pagination={false} dataSource={config.providers} columns={[
                { title: "厂商", render: (_, item) => <div><div className="font-medium">{item.name}</div><div className="text-xs text-gray-400">{item.id}</div></div> },
                { title: "协议", dataIndex: "apiFormat", width: 140, render: (value) => { const protocol = protocols.find((item) => item.id === value); return <Tag title={protocol?.description}>{protocol?.name || String(value).toUpperCase()}</Tag>; } },
                { title: "接口地址", dataIndex: "baseUrl", ellipsis: true },
                { title: "状态", dataIndex: "enabled", width: 90, render: (value) => value ? <Tag color="green">启用</Tag> : <Tag>停用</Tag> },
                { title: "操作", width: 260, render: (_, item) => <Space><Button size="small" icon={<RefreshCw className="size-3.5" />} loading={discovering === item.id} onClick={() => void discover(item)}>认证并拉取</Button><Button size="small" title="编辑厂商" icon={<Pencil className="size-3.5" />} onClick={() => editProvider(item)} /><Button size="small" danger title="删除厂商" icon={<Trash2 className="size-3.5" />} onClick={() => removeProvider(item)} /></Space> },
            ]} />
        </AdminCard>

        {Object.entries(discovered).map(([providerId, models]) => {
            const provider = config.providers.find((item) => item.id === providerId);
            if (!provider) return null;
            return <AdminCard key={providerId} title={provider.name + " · 待接入模型"} description="厂商接口证明模型对当前账号可见。选择分类并配置能力后，完成模型验证才允许发布。">
                <Table rowKey={(value) => value} pagination={{ pageSize: 8, hideOnSinglePage: true }} dataSource={models} columns={[
                    { title: "上游模型名称", render: (value: string) => <span className="font-mono text-xs">{value}</span> },
                    { title: "当前分类", width: 110, render: (value: string) => { const configured = config.models.find((item) => item.providerId === providerId && item.requestModel === value); return configured ? <Tag color="blue">{CATEGORY_LABELS[configured.category]}</Tag> : <Tag>未配置</Tag>; } },
                    { title: "分类添加", width: 260, render: (value: string) => <Space>{CATEGORY_OPTIONS.map((option) => <Button key={option.value} size="small" onClick={() => classify(providerId, value, option.value as ModelCategory)}>{option.label}</Button>)}</Space> },
                ]} />
            </AdminCard>;
        })}

        <AdminCard title="已配置模型" description="模型完成能力配置和厂商认证验证后，由管理员明确发布。只有已验证且已发布的模型会进入画布。" action={<Button type="primary" icon={<Plus className="size-4" />} disabled={!config.providers.length} onClick={() => editModel()}>手动添加模型</Button>}>
            <Table rowKey="id" dataSource={config.models} pagination={{ pageSize: 10, hideOnSinglePage: true }} columns={[
                { title: "模型", render: (_, item) => <div><div className="font-medium">{item.displayName}</div><div className="text-xs text-gray-400">{item.id}</div></div> },
                { title: "分类", dataIndex: "category", width: 90, render: (value: ModelCategory) => <Tag color="blue">{CATEGORY_LABELS[value]}</Tag> },
                { title: "实际请求模型", dataIndex: "requestModel", ellipsis: true },
                { title: "能力", width: 220, render: (_, item) => <CapabilitySummary model={item} /> },
                { title: "验证", width: 130, render: (_, item) => <VerificationStatus model={item} /> },
                { title: "可用性", width: 110, render: (_, item) => <ModelAvailability model={item} providers={config.providers} /> },
                { title: "操作", width: 190, render: (_, item) => <Space><Button size="small" icon={<ShieldCheck className="size-3.5" />} loading={verifying === item.id} onClick={() => void verifyModel(item)}>验证</Button><Button size="small" title="编辑模型" icon={<Pencil className="size-3.5" />} onClick={() => editModel(item)} /><Button size="small" danger title="删除模型" icon={<Trash2 className="size-3.5" />} onClick={() => removeModel(item)} /></Space> },
            ]} />
        </AdminCard>

        <ProviderDrawer draft={providerDraft} onChange={setProviderDraft} onClose={() => setProviderDraft(null)} onSave={saveProvider} />
        <ModelDrawer draft={modelDraft} providers={config.providers} discovered={discovered} protocols={protocols} onChange={setModelDraft} onClose={() => setModelDraft(null)} onSave={saveModel} />
    </div>;
}

function ProviderDrawer(props: { draft: PlatformProvider | null; onChange: (value: PlatformProvider | null) => void; onClose: () => void; onSave: () => void }) {
    const update = (patch: Partial<PlatformProvider>) => props.draft && props.onChange({ ...props.draft, ...patch });
    return <Drawer size="default" title="模型厂商" open={Boolean(props.draft)} onClose={props.onClose} extra={<Button type="primary" onClick={props.onSave}>保存</Button>}>{props.draft ? <Form layout="vertical">
        <Form.Item label="厂商 ID" required><Input value={props.draft.id} placeholder="例如 volcengine" onChange={(event) => update({ id: event.target.value })} /></Form.Item>
        <Form.Item label="厂商名称" required><Input value={props.draft.name} placeholder="例如 火山方舟" onChange={(event) => update({ name: event.target.value })} /></Form.Item>
        <Form.Item label="接口地址" required><Input value={props.draft.baseUrl} placeholder={props.draft.apiFormat === "gemini" ? "https://generativelanguage.googleapis.com/v1beta" : "https://api.openai.com/v1 或火山方舟 https://ark.cn-beijing.volces.com/api/v3"} onChange={(event) => update({ baseUrl: event.target.value })} /></Form.Item>
        <Form.Item label="API Key" required><Input.Password value={props.draft.apiKey} onChange={(event) => update({ apiKey: event.target.value })} /></Form.Item>
        <div className="grid gap-x-4 sm:grid-cols-2"><Form.Item label="协议"><Select value={props.draft.apiFormat} options={[{ value: "openai", label: "OpenAI Compatible" }, { value: "gemini", label: "Gemini" }]} onChange={(apiFormat) => {
            const currentDefault = props.draft?.apiFormat === "gemini" ? "/v1beta/models" : "/models";
            const nextDefault = apiFormat === "gemini" ? "/v1beta/models" : "/models";
            update({ apiFormat, modelsPath: !props.draft?.modelsPath || props.draft.modelsPath === currentDefault ? nextDefault : props.draft.modelsPath });
        }} /></Form.Item><Form.Item label="模型列表路径"><Input value={props.draft.modelsPath} placeholder={props.draft.apiFormat === "gemini" ? "/v1beta/models" : "/models"} onChange={(event) => update({ modelsPath: event.target.value })} /></Form.Item></div>
        <div className="-mt-2 mb-3 text-xs leading-5 text-gray-500">厂商级协议用于拉取模型列表（OpenAI 兼容或 Gemini 原生）。每个模型的调用协议（OpenAI 直连 / Seedance 方舟任务 / Agnes 异步等）在「已配置模型」的模型抽屉中按模型单独选择。</div>
        <Toggle label="启用该厂商" checked={props.draft.enabled} onChange={(enabled) => update({ enabled })} />
    </Form> : null}</Drawer>;
}

function ModelDrawer(props: { draft: PlatformModel | null; providers: PlatformProvider[]; discovered: Record<string, string[]>; protocols: ModelProtocol[]; onChange: (value: PlatformModel | null) => void; onClose: () => void; onSave: () => void }) {
    const draft = props.draft;
    if (!draft) return <Drawer open={false} onClose={props.onClose} />;
    const update = (patch: Partial<PlatformModel>) => props.onChange({ ...draft, ...patch });
    const updateText = (patch: Partial<TextCapabilities>) => draft.textCapabilities && update({ textCapabilities: { ...draft.textCapabilities, ...patch } });
    const updateImage = (patch: Partial<ImageCapabilities>) => draft.imageCapabilities && update({ imageCapabilities: { ...draft.imageCapabilities, ...patch } });
    const updateVideo = (patch: Partial<VideoCapabilities>) => draft.videoCapabilities && update({ videoCapabilities: { ...draft.videoCapabilities, ...patch } });
    const updateAudio = (patch: Partial<AudioCapabilities>) => draft.audioCapabilities && update({ audioCapabilities: { ...draft.audioCapabilities, ...patch } });
    const discoveredOptions = (props.discovered[draft.providerId] || []).map((value) => ({ value, label: value }));
    const protocolOptions = props.protocols.some((item) => item.id === draft.requestAdapter)
        ? props.protocols
        : [...props.protocols, { id: draft.requestAdapter, name: `当前协议：${draft.requestAdapter}`, description: "保留已有配置；请确认后再改为可选协议" }];
    const selectedProtocol = protocolOptions.find((item) => item.id === draft.requestAdapter);
    return <Drawer size="large" title="模型分类与能力" open onClose={props.onClose} extra={<Button type="primary" onClick={props.onSave}>保存</Button>}><Form layout="vertical">
        <Form.Item label="模型分类" required><Segmented block value={draft.category} options={CATEGORY_OPTIONS} onChange={(category) => props.onChange(applyModelCategory(draft, category as ModelCategory))} /></Form.Item>
        <div className="grid gap-x-4 md:grid-cols-2">
            <Form.Item label="稳定模型 ID" required><Input value={draft.id} placeholder="前端使用，例如 seedance-2-pro" onChange={(event) => update({ id: event.target.value })} /></Form.Item>
            <Form.Item label="画布显示名称" required><Input value={draft.displayName} placeholder="例如 Seedance 2.0 Pro" onChange={(event) => update({ displayName: event.target.value })} /></Form.Item>
            <Form.Item label="厂商" required><Select value={draft.providerId} options={props.providers.map((item) => ({ value: item.id, label: item.name }))} onChange={(providerId) => update({ providerId, requestModel: "" })} /></Form.Item>
            <Form.Item label="实际请求模型名称" required><Select mode="tags" maxCount={1} showSearch options={discoveredOptions} value={draft.requestModel ? [draft.requestModel] : []} placeholder={discoveredOptions.length ? "选择已拉取模型或手动输入" : "先拉取模型，或手动输入"} onChange={(values) => update({ requestModel: values.at(-1) || "" })} /></Form.Item>
            <Form.Item label="调用协议"><Select value={draft.requestAdapter} options={protocolOptions.map((item) => ({ value: item.id, label: item.name }))} onChange={(requestAdapter) => update({ requestAdapter })} /></Form.Item>
            <Form.Item label="模型名称匹配规则"><Select mode="tags" tokenSeparators={[","]} value={draft.modelPatterns} onChange={(modelPatterns) => update({ modelPatterns })} placeholder="例如 seedance-2" /></Form.Item>
        </div>
        {selectedProtocol ? <div className="-mt-2 mb-4 text-xs text-gray-500">{selectedProtocol.description}</div> : null}
        <div className="mb-4"><VerificationStatus model={draft} />{draft.verificationMessage ? <span className="ml-2 text-xs text-gray-500">{draft.verificationMessage}</span> : null}</div>
        {draft.category === "text" && draft.textCapabilities ? <TextCapabilityForm value={draft.textCapabilities} onChange={updateText} /> : null}
        {draft.category === "image" && draft.imageCapabilities ? <ImageCapabilityForm value={draft.imageCapabilities} onChange={updateImage} /> : null}
        {draft.category === "video" && draft.videoCapabilities ? <VideoCapabilityForm value={draft.videoCapabilities} onChange={updateVideo} /> : null}
        {draft.category === "audio" && draft.audioCapabilities ? <AudioCapabilityForm value={draft.audioCapabilities} onChange={updateAudio} /> : null}
        <div className="mt-5 grid gap-4 rounded-lg bg-black/[0.035] p-4 dark:bg-white/[0.05] sm:grid-cols-2"><Toggle label="启用该模型" checked={draft.enabled} onChange={(enabled) => update({ enabled })} /><Toggle label="发布到画布" checked={draft.published} disabled={draft.verificationStatus !== "verified"} onChange={(published) => update({ published })} /></div>
    </Form></Drawer>;
}

function TextCapabilityForm(props: { value: TextCapabilities; onChange: (patch: Partial<TextCapabilities>) => void }) {
    return <CapabilitySection title="文本能力" description="纯文本模型只能处理文本；启用识图后才允许图片或多模态消息。"><Checkbox.Group options={TEXT_MODES} value={props.value.modes} onChange={(modes) => props.onChange({ modes: modes as TextCapabilities["modes"] })} /></CapabilitySection>;
}

function ImageCapabilityForm(props: { value: ImageCapabilities; onChange: (patch: Partial<ImageCapabilities>) => void }) {
    return <CapabilitySection title="图像能力" description="这些能力参数会约束画布中可选择的生成方式、画质、尺寸和数量。">
        <Field label="生成方式"><Checkbox.Group options={IMAGE_MODES} value={props.value.modes} onChange={(modes) => {
            const selected = modes as ImageCapabilities["modes"];
            const minimumImages = selected.includes("image-to-image") || selected.includes("image-edit") ? 1 : 0;
            props.onChange({ modes: selected, maxImages: Math.max(props.value.maxImages, minimumImages) });
        }} /></Field>
        <Field label="画质"><Checkbox.Group options={IMAGE_QUALITIES} value={props.value.qualities} onChange={(qualities) => props.onChange({ qualities: qualities as ImageCapabilities["qualities"] })} /></Field>
        <Field label="清晰度"><Checkbox.Group options={IMAGE_RESOLUTIONS} value={props.value.resolutions} onChange={(resolutions) => props.onChange({ resolutions: resolutions as ImageCapabilities["resolutions"] })} /></Field>
        <Field label="比例"><Checkbox.Group options={IMAGE_RATIOS.map((value) => ({ value, label: value }))} value={props.value.ratios} onChange={(ratios) => props.onChange({ ratios: ratios as string[] })} /></Field>
        <Form.Item label="生成数量"><Select mode="tags" tokenSeparators={[","]} value={props.value.counts.map(String)} onChange={(values) => props.onChange({ counts: numberTags(values) })} placeholder="例如 1, 2, 4" /></Form.Item>
        <div className="grid gap-3 md:grid-cols-3"><Form.Item label="最多参考图片"><InputNumber min={0} className="w-full" value={props.value.maxImages} onChange={(value) => props.onChange({ maxImages: numberOr(value, 0) })} /></Form.Item><Form.Item label="最多输出图片"><InputNumber min={0} className="w-full" value={props.value.maxOutputs} onChange={(value) => props.onChange({ maxOutputs: numberOr(value, 0) })} /></Form.Item><Form.Item label="输入与输出总上限"><InputNumber min={0} className="w-full" value={props.value.maxTotalImages} onChange={(value) => props.onChange({ maxTotalImages: numberOr(value, 0) })} /></Form.Item></div>
        <div className="grid gap-4 rounded-lg bg-black/[0.035] p-4 dark:bg-white/[0.05] sm:grid-cols-3"><Toggle label="支持连续多图生成" checked={props.value.sequentialImageGeneration} onChange={(sequentialImageGeneration) => props.onChange({ sequentialImageGeneration })} /><Toggle label="支持交互编辑" checked={props.value.interactiveEdit} onChange={(interactiveEdit) => props.onChange({ interactiveEdit })} /><Toggle label="支持添加水印" checked={props.value.watermark} onChange={(watermark) => props.onChange({ watermark })} /></div>
    </CapabilitySection>;
}

function VideoCapabilityForm(props: { value: VideoCapabilities; onChange: (patch: Partial<VideoCapabilities>) => void }) {
    return <CapabilitySection title="视频能力" description="首帧图生视频对应 1 张 first_frame；首尾帧图生视频对应按顺序连接的 first_frame 和 last_frame。其余选项、输入上限和开关均由你为当前模型配置。">
        <Field label="生成方式"><Checkbox.Group options={VIDEO_MODES} value={props.value.modes} onChange={(modes) => {
            const selected = modes as VideoCapabilities["modes"];
            const minimumImages = selected.includes("multi-frame") ? 3 : selected.includes("first-last-frame") ? 2 : selected.includes("image-to-video") || selected.includes("image-reference") ? 1 : 0;
            props.onChange({ modes: selected, maxImages: Math.max(props.value.maxImages, minimumImages) });
        }} /></Field>
        <div className="grid gap-x-4 md:grid-cols-2"><Form.Item label="画面比例"><Select mode="tags" tokenSeparators={[","]} value={props.value.ratios} onChange={(ratios) => props.onChange({ ratios })} /></Form.Item><Form.Item label="分辨率"><Select mode="tags" tokenSeparators={[","]} value={props.value.resolutions} onChange={(resolutions) => props.onChange({ resolutions })} /></Form.Item><Form.Item label="时长（秒）"><Select mode="tags" tokenSeparators={[","]} value={props.value.durations.map(String)} onChange={(values) => props.onChange({ durations: numberTags(values) })} /></Form.Item><Form.Item label="生成数量"><Select mode="tags" tokenSeparators={[","]} value={props.value.counts.map(String)} onChange={(values) => props.onChange({ counts: numberTags(values) })} /></Form.Item></div>
        <div className="grid gap-3 md:grid-cols-3"><Form.Item label="最多参考图片"><InputNumber min={0} className="w-full" value={props.value.maxImages} onChange={(value) => props.onChange({ maxImages: numberOr(value, 0) })} /></Form.Item><Form.Item label="最多参考视频"><InputNumber min={0} className="w-full" value={props.value.maxVideos} onChange={(value) => props.onChange({ maxVideos: numberOr(value, 0) })} /></Form.Item><Form.Item label="最多参考音频"><InputNumber min={0} className="w-full" value={props.value.maxAudios} onChange={(value) => props.onChange({ maxAudios: numberOr(value, 0) })} /></Form.Item></div>
        <div className="grid gap-4 rounded-lg bg-black/[0.035] p-4 dark:bg-white/[0.05] sm:grid-cols-3"><Toggle label="支持生成音频" checked={props.value.generateAudio} onChange={(generateAudio) => props.onChange({ generateAudio })} /><Toggle label="支持添加水印" checked={props.value.watermark} onChange={(watermark) => props.onChange({ watermark })} /><Toggle label="支持草稿模式" checked={props.value.draft} onChange={(draft) => props.onChange({ draft })} /></div>
    </CapabilitySection>;
}

function AudioCapabilityForm(props: { value: AudioCapabilities; onChange: (patch: Partial<AudioCapabilities>) => void }) {
    return <CapabilitySection title="音频能力" description="OpenAI 兼容音频节点使用 /audio/speech；列表留空表示不限制该参数。">
        <Field label="生成方式"><Checkbox.Group options={[{ value: "text-to-speech", label: "文生语音" }]} value={props.value.modes} onChange={(modes) => props.onChange({ modes: modes as AudioCapabilities["modes"] })} /></Field>
        <div className="grid gap-x-4 md:grid-cols-2"><Form.Item label="音色"><Select mode="tags" tokenSeparators={[","]} value={props.value.voices} onChange={(voices) => props.onChange({ voices })} placeholder="例如 alloy, nova" /></Form.Item><Form.Item label="输出格式"><Select mode="tags" tokenSeparators={[","]} value={props.value.formats} onChange={(formats) => props.onChange({ formats })} placeholder="例如 mp3, wav" /></Form.Item><Form.Item label="可用语速"><Select mode="tags" tokenSeparators={[","]} value={props.value.speeds.map(String)} onChange={(values) => props.onChange({ speeds: decimalTags(values) })} placeholder="例如 0.75, 1, 1.25" /></Form.Item></div>
        <Toggle label="支持语音指令" checked={props.value.instructions} onChange={(instructions) => props.onChange({ instructions })} />
    </CapabilitySection>;
}

function CapabilitySection(props: { title: string; description: string; children: React.ReactNode }) { return <section className="mt-2 rounded-xl border border-black/5 p-4 dark:border-white/10"><h3 className="m-0 text-sm font-semibold">{props.title}</h3><p className="mb-4 mt-1 text-xs leading-5 text-gray-500">{props.description}</p><div className="space-y-4">{props.children}</div></section>; }
function Field(props: { label: string; children: React.ReactNode }) { return <div><div className="mb-2 text-sm text-gray-600 dark:text-white/65">{props.label}</div>{props.children}</div>; }
function CapabilitySummary({ model }: { model: PlatformModel }) { const modes = model.textCapabilities?.modes || model.imageCapabilities?.modes || model.videoCapabilities?.modes || model.audioCapabilities?.modes || []; return <Space size={[4, 4]} wrap>{modes.slice(0, 3).map((value) => <Tag key={value}>{value}</Tag>)}{modes.length > 3 ? <Tag>+{modes.length - 3}</Tag> : null}</Space>; }
function VerificationStatus({ model }: { model: PlatformModel }) { if (model.verificationStatus === "verified") return <Tag color="green" title={model.verifiedAt ? `验证时间：${model.verifiedAt}` : undefined}>已验证</Tag>; if (model.verificationStatus === "failed") return <Tag color="red" title={model.verificationMessage}>验证失败</Tag>; return <Tag color="orange">待验证</Tag>; }
function ModelAvailability({ model, providers }: { model: PlatformModel; providers: PlatformProvider[] }) { const provider = providers.find((item) => item.id === model.providerId); if (!provider) return <Tag color="red">厂商不存在</Tag>; if (!provider.enabled) return <Tag color="orange">厂商未启用</Tag>; if (!provider.baseUrl.trim()) return <Tag color="orange">缺少接口地址</Tag>; if (!provider.apiKey.trim()) return <Tag color="orange">缺少 API Key</Tag>; if (model.verificationStatus !== "verified") return <Tag color="orange">未验证</Tag>; if (!model.enabled) return <Tag>模型未启用</Tag>; if (!model.published) return <Tag>模型未发布</Tag>; return <Tag color="green">已发布</Tag>; }
function Toggle(props: { label: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) { return <div className="flex items-center justify-between gap-3 text-sm"><span>{props.label}</span><Switch size="small" checked={props.checked} disabled={props.disabled} onChange={props.onChange} /></div>; }
function numberTags(values: string[]) { return [...new Set(values.map(Number).filter((value) => Number.isFinite(value) && value > 0))].sort((a, b) => a - b); }
function decimalTags(values: string[]) { return [...new Set(values.map(Number).filter((value) => Number.isFinite(value) && value > 0 && value <= 4))].sort((a, b) => a - b); }
