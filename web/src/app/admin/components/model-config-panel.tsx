import { App, Button, Checkbox, Drawer, Form, Input, InputNumber, Segmented, Select, Space, Switch, Table, Tag } from "antd";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";

import { AdminCard } from "./admin-card";
import { applyModelCategory, cloneModel, emptyModel, emptyProvider, IMAGE_RATIOS, normalizeModel, numberOr, replaceById } from "../platform-config-utils";
import { discoverProviderModels, type ImageCapabilities, type ModelCategory, type PlatformConfigDocument, type PlatformModel, type PlatformProvider, type TextCapabilities, type VideoCapabilities } from "@/services/api/platform-admin";

const CATEGORY_OPTIONS = [{ value: "text", label: "文本" }, { value: "image", label: "图像" }, { value: "video", label: "视频" }];
const CATEGORY_LABELS: Record<ModelCategory, string> = { text: "文本", image: "图像", video: "视频" };
const TEXT_MODES = [{ value: "text", label: "纯文本" }, { value: "vision", label: "识图 / 多模态" }];
const IMAGE_MODES = [{ value: "text-to-image", label: "文生图" }, { value: "image-to-image", label: "图生图" }, { value: "image-edit", label: "图像编辑" }];
const IMAGE_QUALITIES = [{ value: "low", label: "低画质" }, { value: "standard", label: "标准画质" }, { value: "high", label: "高画质" }];
const IMAGE_RESOLUTIONS = ["1k", "2k", "4k"].map((value) => ({ value, label: value.toUpperCase() }));
const VIDEO_MODES = [
    { value: "text-to-video", label: "文生视频" }, { value: "all-in-one-reference", label: "全能参考" },
    { value: "image-to-video", label: "图生视频" }, { value: "first-last-frame", label: "首尾帧" },
    { value: "image-reference", label: "图片参考" }, { value: "multi-frame", label: "智能多帧" },
];

type Props = { authToken: string; config: PlatformConfigDocument; onChange: (config: PlatformConfigDocument) => void };

export function ModelConfigPanel({ authToken, config, onChange }: Props) {
    const { message, modal } = App.useApp();
    const [providerDraft, setProviderDraft] = useState<PlatformProvider | null>(null);
    const [providerOriginalId, setProviderOriginalId] = useState("");
    const [modelDraft, setModelDraft] = useState<PlatformModel | null>(null);
    const [modelOriginalId, setModelOriginalId] = useState("");
    const [discovered, setDiscovered] = useState<Record<string, string[]>>({});
    const [discovering, setDiscovering] = useState("");

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
            const models = await discoverProviderModels(authToken, provider.id);
            setDiscovered((current) => ({ ...current, [provider.id]: models }));
            message.success("已从 " + provider.name + " 获取 " + models.length + " 个模型");
        } catch (error) { message.error(error instanceof Error ? error.message : "获取模型失败，请先保存供应商配置"); }
        finally { setDiscovering(""); }
    };

    return <div className="space-y-5">
        <AdminCard title="模型厂商" description="厂商只配置接口、密钥和协议。保存全局配置后，再拉取模型并逐一分类。" action={<Button icon={<Plus className="size-4" />} onClick={() => editProvider()}>添加厂商</Button>}>
            <Table rowKey="id" pagination={false} dataSource={config.providers} columns={[
                { title: "厂商", render: (_, item) => <div><div className="font-medium">{item.name}</div><div className="text-xs text-gray-400">{item.id}</div></div> },
                { title: "协议", dataIndex: "apiFormat", width: 100, render: (value) => <Tag>{String(value).toUpperCase()}</Tag> },
                { title: "接口地址", dataIndex: "baseUrl", ellipsis: true },
                { title: "状态", dataIndex: "enabled", width: 90, render: (value) => value ? <Tag color="green">启用</Tag> : <Tag>停用</Tag> },
                { title: "操作", width: 230, render: (_, item) => <Space><Button size="small" icon={<RefreshCw className="size-3.5" />} loading={discovering === item.id} onClick={() => void discover(item)}>拉取模型</Button><Button size="small" icon={<Pencil className="size-3.5" />} onClick={() => editProvider(item)} /><Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => removeProvider(item)} /></Space> },
            ]} />
        </AdminCard>

        {Object.entries(discovered).map(([providerId, models]) => {
            const provider = config.providers.find((item) => item.id === providerId);
            if (!provider) return null;
            return <AdminCard key={providerId} title={provider.name + " · 已拉取模型"} description="上游只返回模型名称。管理员确认分类后，再配置该分类的具体能力。">
                <Table rowKey={(value) => value} pagination={{ pageSize: 8, hideOnSinglePage: true }} dataSource={models} columns={[
                    { title: "上游模型名称", render: (value: string) => <span className="font-mono text-xs">{value}</span> },
                    { title: "当前分类", width: 110, render: (value: string) => { const configured = config.models.find((item) => item.providerId === providerId && item.requestModel === value); return configured ? <Tag color="blue">{CATEGORY_LABELS[configured.category]}</Tag> : <Tag>未配置</Tag>; } },
                    { title: "分类添加", width: 260, render: (value: string) => <Space>{CATEGORY_OPTIONS.map((option) => <Button key={option.value} size="small" onClick={() => classify(providerId, value, option.value as ModelCategory)}>{option.label}</Button>)}</Space> },
                ]} />
            </AdminCard>;
        })}

        <AdminCard title="已配置模型" description="画布只展示已启用、已发布且厂商连接完整的模型。实际模型名和密钥不会下发前端。" action={<Button type="primary" icon={<Plus className="size-4" />} disabled={!config.providers.length} onClick={() => editModel()}>手动添加模型</Button>}>
            <Table rowKey="id" dataSource={config.models} pagination={{ pageSize: 10, hideOnSinglePage: true }} columns={[
                { title: "模型", render: (_, item) => <div><div className="font-medium">{item.displayName}</div><div className="text-xs text-gray-400">{item.id}</div></div> },
                { title: "分类", dataIndex: "category", width: 90, render: (value: ModelCategory) => <Tag color="blue">{CATEGORY_LABELS[value]}</Tag> },
                { title: "实际请求模型", dataIndex: "requestModel", ellipsis: true },
                { title: "能力", width: 260, render: (_, item) => <CapabilitySummary model={item} /> },
                { title: "可用性", width: 110, render: (_, item) => <ModelAvailability model={item} providers={config.providers} /> },
                { title: "操作", width: 100, render: (_, item) => <Space><Button size="small" icon={<Pencil className="size-3.5" />} onClick={() => editModel(item)} /><Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => removeModel(item)} /></Space> },
            ]} />
        </AdminCard>

        <ProviderDrawer draft={providerDraft} onChange={setProviderDraft} onClose={() => setProviderDraft(null)} onSave={saveProvider} />
        <ModelDrawer draft={modelDraft} providers={config.providers} discovered={discovered} onChange={setModelDraft} onClose={() => setModelDraft(null)} onSave={saveModel} />
    </div>;
}

function ProviderDrawer(props: { draft: PlatformProvider | null; onChange: (value: PlatformProvider | null) => void; onClose: () => void; onSave: () => void }) {
    const update = (patch: Partial<PlatformProvider>) => props.draft && props.onChange({ ...props.draft, ...patch });
    return <Drawer size="default" title="模型厂商" open={Boolean(props.draft)} onClose={props.onClose} extra={<Button type="primary" onClick={props.onSave}>保存</Button>}>{props.draft ? <Form layout="vertical">
        <Form.Item label="厂商 ID" required><Input value={props.draft.id} placeholder="例如 volcengine" onChange={(event) => update({ id: event.target.value })} /></Form.Item>
        <Form.Item label="厂商名称" required><Input value={props.draft.name} placeholder="例如 火山方舟" onChange={(event) => update({ name: event.target.value })} /></Form.Item>
        <Form.Item label="接口地址" required><Input value={props.draft.baseUrl} placeholder="https://ark.cn-beijing.volces.com/api/v3" onChange={(event) => update({ baseUrl: event.target.value })} /></Form.Item>
        <Form.Item label="API Key" required><Input.Password value={props.draft.apiKey} onChange={(event) => update({ apiKey: event.target.value })} /></Form.Item>
        <div className="grid gap-x-4 sm:grid-cols-2"><Form.Item label="协议"><Select value={props.draft.apiFormat} options={[{ value: "openai", label: "OpenAI Compatible" }, { value: "gemini", label: "Gemini" }]} onChange={(apiFormat) => {
            const currentDefault = props.draft?.apiFormat === "gemini" ? "/v1beta/models" : "/models";
            const nextDefault = apiFormat === "gemini" ? "/v1beta/models" : "/models";
            update({ apiFormat, modelsPath: !props.draft?.modelsPath || props.draft.modelsPath === currentDefault ? nextDefault : props.draft.modelsPath });
        }} /></Form.Item><Form.Item label="模型列表路径"><Input value={props.draft.modelsPath} placeholder={props.draft.apiFormat === "gemini" ? "/v1beta/models" : "/models"} onChange={(event) => update({ modelsPath: event.target.value })} /></Form.Item></div>
        <Toggle label="启用该厂商" checked={props.draft.enabled} onChange={(enabled) => update({ enabled })} />
    </Form> : null}</Drawer>;
}

function ModelDrawer(props: { draft: PlatformModel | null; providers: PlatformProvider[]; discovered: Record<string, string[]>; onChange: (value: PlatformModel | null) => void; onClose: () => void; onSave: () => void }) {
    const draft = props.draft;
    if (!draft) return <Drawer open={false} onClose={props.onClose} />;
    const update = (patch: Partial<PlatformModel>) => props.onChange({ ...draft, ...patch });
    const updateText = (patch: Partial<TextCapabilities>) => draft.textCapabilities && update({ textCapabilities: { ...draft.textCapabilities, ...patch } });
    const updateImage = (patch: Partial<ImageCapabilities>) => draft.imageCapabilities && update({ imageCapabilities: { ...draft.imageCapabilities, ...patch } });
    const updateVideo = (patch: Partial<VideoCapabilities>) => draft.videoCapabilities && update({ videoCapabilities: { ...draft.videoCapabilities, ...patch } });
    const discoveredOptions = (props.discovered[draft.providerId] || []).map((value) => ({ value, label: value }));
    return <Drawer size="large" title="模型分类与能力" open onClose={props.onClose} extra={<Button type="primary" onClick={props.onSave}>保存</Button>}><Form layout="vertical">
        <Form.Item label="模型分类" required><Segmented block value={draft.category} options={CATEGORY_OPTIONS} onChange={(category) => props.onChange(applyModelCategory(draft, category as ModelCategory))} /></Form.Item>
        <div className="grid gap-x-4 md:grid-cols-2">
            <Form.Item label="稳定模型 ID" required><Input value={draft.id} placeholder="前端使用，例如 seedance-2-pro" onChange={(event) => update({ id: event.target.value })} /></Form.Item>
            <Form.Item label="画布显示名称" required><Input value={draft.displayName} placeholder="例如 Seedance 2.0 Pro" onChange={(event) => update({ displayName: event.target.value })} /></Form.Item>
            <Form.Item label="厂商" required><Select value={draft.providerId} options={props.providers.map((item) => ({ value: item.id, label: item.name }))} onChange={(providerId) => update({ providerId, requestModel: "" })} /></Form.Item>
            <Form.Item label="实际请求模型名称" required><Select mode="tags" maxCount={1} showSearch options={discoveredOptions} value={draft.requestModel ? [draft.requestModel] : []} placeholder={discoveredOptions.length ? "选择已拉取模型或手动输入" : "先拉取模型，或手动输入"} onChange={(values) => update({ requestModel: values.at(-1) || "" })} /></Form.Item>
            <Form.Item label="请求适配器"><Input value={draft.requestAdapter} placeholder="openai / seedance-v2 / agnes" onChange={(event) => update({ requestAdapter: event.target.value })} /></Form.Item>
            <Form.Item label="模型名称匹配规则"><Select mode="tags" tokenSeparators={[","]} value={draft.modelPatterns} onChange={(modelPatterns) => update({ modelPatterns })} placeholder="例如 seedance-2" /></Form.Item>
        </div>
        {draft.category === "text" && draft.textCapabilities ? <TextCapabilityForm value={draft.textCapabilities} onChange={updateText} /> : null}
        {draft.category === "image" && draft.imageCapabilities ? <ImageCapabilityForm value={draft.imageCapabilities} onChange={updateImage} /> : null}
        {draft.category === "video" && draft.videoCapabilities ? <VideoCapabilityForm value={draft.videoCapabilities} onChange={updateVideo} /> : null}
        <div className="mt-5 rounded-lg bg-black/[0.035] p-4 dark:bg-white/[0.05]"><Toggle label="启用并发布到画布" checked={draft.enabled && draft.published} onChange={(enabled) => update({ enabled, published: enabled })} /></div>
    </Form></Drawer>;
}

function TextCapabilityForm(props: { value: TextCapabilities; onChange: (patch: Partial<TextCapabilities>) => void }) {
    return <CapabilitySection title="文本能力" description="纯文本模型只能处理文本；启用识图后才允许图片或多模态消息。"><Checkbox.Group options={TEXT_MODES} value={props.value.modes} onChange={(modes) => props.onChange({ modes: modes as TextCapabilities["modes"] })} /></CapabilitySection>;
}

function ImageCapabilityForm(props: { value: ImageCapabilities; onChange: (patch: Partial<ImageCapabilities>) => void }) {
    const hasOfficialTemplate = Boolean(props.value.officialTemplate);
    return <CapabilitySection title="图像能力" description="画质、清晰度、比例和生成数量会约束画布选项，并由后端复核请求。命中官方模板后，保存时以后端目录为准。">
        <Field label="生成方式"><Checkbox.Group options={IMAGE_MODES} value={props.value.modes} onChange={(modes) => props.onChange({ modes: modes as ImageCapabilities["modes"] })} /></Field>
        <Field label="画质"><Checkbox.Group options={IMAGE_QUALITIES} value={props.value.qualities} onChange={(qualities) => props.onChange({ qualities: qualities as ImageCapabilities["qualities"] })} /></Field>
        <Field label="清晰度"><Checkbox.Group options={IMAGE_RESOLUTIONS} value={props.value.resolutions} onChange={(resolutions) => props.onChange({ resolutions: resolutions as ImageCapabilities["resolutions"] })} /></Field>
        <Field label="比例"><Checkbox.Group options={IMAGE_RATIOS.map((value) => ({ value, label: value }))} value={props.value.ratios} onChange={(ratios) => props.onChange({ ratios: ratios as string[] })} /></Field>
        <Form.Item label="生成数量"><Select mode="tags" tokenSeparators={[","]} value={props.value.counts.map(String)} onChange={(values) => props.onChange({ counts: numberTags(values) })} placeholder="例如 1, 2, 4" /></Form.Item>
        <div className="grid gap-3 md:grid-cols-3"><Form.Item label="最多参考图片"><InputNumber min={0} className="w-full" value={props.value.maxImages} onChange={(value) => props.onChange({ maxImages: numberOr(value, 0) })} /></Form.Item><Form.Item label="最多输出图片"><InputNumber min={0} className="w-full" value={props.value.maxOutputs} onChange={(value) => props.onChange({ maxOutputs: numberOr(value, 0) })} /></Form.Item><Form.Item label="输入与输出总上限"><InputNumber min={0} className="w-full" value={props.value.maxTotalImages} onChange={(value) => props.onChange({ maxTotalImages: numberOr(value, 0) })} /></Form.Item></div>
        <div className="grid gap-4 rounded-lg bg-black/[0.035] p-4 dark:bg-white/[0.05] sm:grid-cols-2"><Toggle label="支持连续多图生成" checked={props.value.sequentialImageGeneration} onChange={(sequentialImageGeneration) => props.onChange({ sequentialImageGeneration })} /><Toggle label="支持添加水印" checked={props.value.watermark} onChange={(watermark) => props.onChange({ watermark })} /></div>
        <div className="grid gap-x-4 md:grid-cols-2"><Form.Item label="官方能力模板"><Input value={props.value.officialTemplate} readOnly placeholder="未匹配官方模板" status={hasOfficialTemplate ? undefined : "warning"} /></Form.Item><Form.Item label="官方文档"><Input value={props.value.documentationUrl} readOnly placeholder="暂无官方文档" /></Form.Item></div>
        {hasOfficialTemplate ? <p className="m-0 text-xs leading-5 text-gray-500">该模型已匹配后端官方能力模板。保存配置时，分类、适配器、模型匹配规则和能力参数会由后端重新校准。</p> : null}
    </CapabilitySection>;
}

function VideoCapabilityForm(props: { value: VideoCapabilities; onChange: (patch: Partial<VideoCapabilities>) => void }) {
    return <CapabilitySection title="视频能力" description="参考方式和输入数量决定画布菜单是否可用；有声开关只在模型明确支持时开放。">
        <Field label="生成方式"><Checkbox.Group options={VIDEO_MODES} value={props.value.modes} onChange={(modes) => {
            const selected = modes as VideoCapabilities["modes"];
            const minimumImages = selected.includes("first-last-frame") || selected.includes("multi-frame") ? 2 : selected.includes("image-to-video") || selected.includes("image-reference") ? 1 : 0;
            props.onChange({ modes: selected, maxImages: Math.max(props.value.maxImages, minimumImages) });
        }} /></Field>
        <div className="grid gap-x-4 md:grid-cols-2"><Form.Item label="画面比例"><Select mode="tags" tokenSeparators={[","]} value={props.value.ratios} onChange={(ratios) => props.onChange({ ratios })} /></Form.Item><Form.Item label="分辨率"><Select mode="tags" tokenSeparators={[","]} value={props.value.resolutions} onChange={(resolutions) => props.onChange({ resolutions })} /></Form.Item><Form.Item label="时长（秒）"><Select mode="tags" tokenSeparators={[","]} value={props.value.durations.map(String)} onChange={(values) => props.onChange({ durations: numberTags(values) })} /></Form.Item><Form.Item label="生成数量"><Select mode="tags" tokenSeparators={[","]} value={props.value.counts.map(String)} onChange={(values) => props.onChange({ counts: numberTags(values) })} /></Form.Item></div>
        <div className="grid gap-3 md:grid-cols-3"><Form.Item label="最多参考图片"><InputNumber min={0} className="w-full" value={props.value.maxImages} onChange={(value) => props.onChange({ maxImages: numberOr(value, 0) })} /></Form.Item><Form.Item label="最多参考视频"><InputNumber min={0} className="w-full" value={props.value.maxVideos} onChange={(value) => props.onChange({ maxVideos: numberOr(value, 0) })} /></Form.Item><Form.Item label="最多参考音频"><InputNumber min={0} className="w-full" value={props.value.maxAudios} onChange={(value) => props.onChange({ maxAudios: numberOr(value, 0) })} /></Form.Item></div>
        <div className="grid gap-4 rounded-lg bg-black/[0.035] p-4 dark:bg-white/[0.05] sm:grid-cols-3"><Toggle label="支持生成音频" checked={props.value.generateAudio} onChange={(generateAudio) => props.onChange({ generateAudio })} /><Toggle label="支持添加水印" checked={props.value.watermark} onChange={(watermark) => props.onChange({ watermark })} /><Toggle label="支持草稿模式" checked={props.value.draft} onChange={(draft) => props.onChange({ draft })} /></div>
    </CapabilitySection>;
}

function CapabilitySection(props: { title: string; description: string; children: React.ReactNode }) { return <section className="mt-2 rounded-xl border border-black/5 p-4 dark:border-white/10"><h3 className="m-0 text-sm font-semibold">{props.title}</h3><p className="mb-4 mt-1 text-xs leading-5 text-gray-500">{props.description}</p><div className="space-y-4">{props.children}</div></section>; }
function Field(props: { label: string; children: React.ReactNode }) { return <div><div className="mb-2 text-sm text-gray-600 dark:text-white/65">{props.label}</div>{props.children}</div>; }
function CapabilitySummary({ model }: { model: PlatformModel }) { const modes = model.textCapabilities?.modes || model.imageCapabilities?.modes || model.videoCapabilities?.modes || []; return <Space size={[4, 4]} wrap>{modes.slice(0, 3).map((value) => <Tag key={value}>{value}</Tag>)}{modes.length > 3 ? <Tag>+{modes.length - 3}</Tag> : null}</Space>; }
function ModelAvailability({ model, providers }: { model: PlatformModel; providers: PlatformProvider[] }) { const provider = providers.find((item) => item.id === model.providerId); if (!provider) return <Tag color="red">厂商不存在</Tag>; if (!provider.enabled) return <Tag color="orange">厂商未启用</Tag>; if (!provider.baseUrl.trim()) return <Tag color="orange">缺少接口地址</Tag>; if (!provider.apiKey.trim()) return <Tag color="orange">缺少 API Key</Tag>; if (!model.enabled) return <Tag>模型未启用</Tag>; if (!model.published) return <Tag>模型未发布</Tag>; return <Tag color="green">已发布</Tag>; }
function Toggle(props: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <div className="flex items-center justify-between gap-3 text-sm"><span>{props.label}</span><Switch size="small" checked={props.checked} onChange={props.onChange} /></div>; }
function numberTags(values: string[]) { return [...new Set(values.map(Number).filter((value) => Number.isFinite(value) && value > 0))].sort((a, b) => a - b); }
