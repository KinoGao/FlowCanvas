"use client";

import { App, Button, Empty, Form, Input, InputNumber, Modal, Select, Space, Spin, Switch, Tag, Typography } from "antd";
import { Check, Play, Save, Trash2, Upload, Workflow } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { runComfyWorkflow } from "@/services/api/comfyui";
import {
    applyComfyWorkflowFields,
    createComfyWorkflow,
    deleteComfyWorkflow,
    listComfyWorkflowInputCandidates,
    listComfyWorkflows,
    parseComfyWorkflowJson,
    saveComfyWorkflow,
    type ComfyWorkflow,
    type ComfyWorkflowField,
    type ComfyWorkflowFieldType,
} from "@/services/comfyui-workflows";
import { useConfigStore } from "@/stores/use-config-store";
import { cn } from "@/lib/utils";

const fieldTypes: Array<{ label: string; value: ComfyWorkflowFieldType }> = [
    { label: "文本", value: "text" },
    { label: "多行文本", value: "textarea" },
    { label: "数字", value: "number" },
    { label: "滑块", value: "slider" },
    { label: "下拉选项", value: "dropdown" },
    { label: "图片", value: "image" },
    { label: "视频", value: "video" },
    { label: "音频", value: "audio" },
    { label: "开关", value: "boolean" },
];

export default function ComfyUiPage() {
    const { message } = App.useApp();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const comfyui = useConfigStore((state) => state.comfyui);
    const updateComfyUiConfig = useConfigStore((state) => state.updateComfyUiConfig);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [running, setRunning] = useState(false);
    const [workflows, setWorkflows] = useState<ComfyWorkflow[]>([]);
    const [selectedId, setSelectedId] = useState("");
    const [runImages, setRunImages] = useState<string[]>([]);
    const [runPromptId, setRunPromptId] = useState("");
    const selected = workflows.find((workflow) => workflow.id === selectedId) || null;
    const candidates = useMemo(() => (selected ? listComfyWorkflowInputCandidates(selected.workflow) : []), [selected]);
    const selectedFieldKeys = useMemo(() => new Set((selected?.fields || []).map(fieldKey)), [selected?.fields]);

    useEffect(() => {
        void refreshWorkflows();
    }, []);

    const refreshWorkflows = async (nextSelectedId = selectedId) => {
        setLoading(true);
        try {
            const items = await listComfyWorkflows();
            setWorkflows(items);
            const nextId = nextSelectedId && items.some((item) => item.id === nextSelectedId) ? nextSelectedId : items[0]?.id || "";
            setSelectedId(nextId);
        } finally {
            setLoading(false);
        }
    };

    const updateSelected = (patch: Partial<ComfyWorkflow>) => {
        if (!selected) return;
        setWorkflows((items) => items.map((item) => (item.id === selected.id ? { ...item, ...patch } : item)));
    };

    const updateField = (fieldId: string, patch: Partial<ComfyWorkflowField>) => {
        if (!selected) return;
        updateSelected({ fields: selected.fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)) });
    };

    const toggleField = (candidate: (typeof candidates)[number]) => {
        if (!selected) return;
        const key = fieldKey(candidate.field);
        if (selectedFieldKeys.has(key)) {
            updateSelected({ fields: selected.fields.filter((field) => fieldKey(field) !== key) });
            return;
        }
        updateSelected({ fields: [...selected.fields, candidate.field] });
    };

    const importWorkflow = async (file?: File) => {
        if (!file) return;
        try {
            const workflow = parseComfyWorkflowJson(await file.text());
            const created = await createComfyWorkflow({ name: file.name, workflow });
            updateComfyUiConfig("defaultWorkflowId", created.id);
            await refreshWorkflows(created.id);
            message.success("ComfyUI workflow 已导入");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "导入失败");
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const saveSelected = async () => {
        if (!selected) return;
        if (!selected.title.trim()) {
            message.error("请填写工作流名称");
            return;
        }
        setSaving(true);
        try {
            const saved = await saveComfyWorkflow(selected);
            updateComfyUiConfig("defaultWorkflowId", saved.id);
            await refreshWorkflows(saved.id);
            message.success("工作流配置已保存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    const removeSelected = () => {
        if (!selected) return;
        Modal.confirm({
            title: "删除工作流",
            content: `确定删除「${selected.title}」吗？`,
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
                await deleteComfyWorkflow(selected.id);
                if (comfyui.defaultWorkflowId === selected.id) updateComfyUiConfig("defaultWorkflowId", "");
                await refreshWorkflows("");
                message.success("工作流已删除");
            },
        });
    };

    const runSelected = async () => {
        if (!selected) return;
        setRunning(true);
        setRunImages([]);
        setRunPromptId("");
        try {
            const workflow = applyComfyWorkflowFields(selected.workflow, selected.fields, Object.fromEntries(selected.fields.map((field) => [field.id, field.default])));
            const result = await runComfyWorkflow(comfyui, workflow);
            setRunPromptId(result.promptId);
            setRunImages(result.images);
            message.success("ComfyUI 任务完成");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "试运行失败");
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background text-stone-900 dark:text-stone-100">
            <main className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
                <div className="mx-auto flex max-w-7xl flex-col gap-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                        <div>
                            <div className="flex items-center gap-2 text-sm font-medium text-stone-500 dark:text-stone-400">
                                <Workflow className="size-4" />
                                ComfyUI
                            </div>
                            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950 dark:text-stone-100">工作流配置</h1>
                            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-500 dark:text-stone-400">导入 ComfyUI API 格式 workflow，选择要暴露给画布节点的参数。</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button icon={<Upload className="size-4" />} onClick={() => fileInputRef.current?.click()}>
                                导入 workflow
                            </Button>
                            <Button type="primary" icon={<Save className="size-4" />} disabled={!selected} loading={saving} onClick={() => void saveSelected()}>
                                保存配置
                            </Button>
                        </div>
                    </div>

                    <div className="grid min-h-[680px] gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
                        <aside className="rounded-lg border border-stone-200 bg-background p-3 dark:border-stone-800">
                            <div className="mb-3 text-sm font-semibold">工作流</div>
                            {loading ? (
                                <div className="flex h-40 items-center justify-center">
                                    <Spin />
                                </div>
                            ) : workflows.length ? (
                                <div className="space-y-2">
                                    {workflows.map((workflow) => (
                                        <button
                                            key={workflow.id}
                                            type="button"
                                            className={cn(
                                                "w-full rounded-md border px-3 py-2 text-left transition",
                                                workflow.id === selectedId ? "border-stone-900 bg-stone-100 dark:border-stone-200 dark:bg-stone-800" : "border-stone-200 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-900",
                                            )}
                                            onClick={() => setSelectedId(workflow.id)}
                                        >
                                            <div className="line-clamp-1 text-sm font-medium">{workflow.title}</div>
                                            <div className="mt-1 text-xs text-stone-500">{workflow.fields.length} 个暴露参数</div>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有导入工作流" />
                            )}
                        </aside>

                        {selected ? (
                            <section className="min-w-0 rounded-lg border border-stone-200 bg-background p-4 dark:border-stone-800">
                                <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <Form layout="vertical" className="grid flex-1 gap-4 lg:grid-cols-2" requiredMark={false}>
                                        <Form.Item label="名称" className="mb-0">
                                            <Input value={selected.title} onChange={(event) => updateSelected({ title: event.target.value })} />
                                        </Form.Item>
                                        <Form.Item label="文件名" className="mb-0">
                                            <Input value={selected.name} onChange={(event) => updateSelected({ name: event.target.value })} />
                                        </Form.Item>
                                    </Form>
                                    <Space>
                                        <Button icon={<Play className="size-4" />} loading={running} onClick={() => void runSelected()}>
                                            试运行
                                        </Button>
                                        <Button danger icon={<Trash2 className="size-4" />} onClick={removeSelected}>
                                            删除
                                        </Button>
                                    </Space>
                                </div>

                                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                                    <div className="min-w-0">
                                        <div className="mb-3 flex items-center justify-between gap-3">
                                            <div>
                                                <div className="text-sm font-semibold">节点输入</div>
                                                <div className="mt-1 text-xs text-stone-500">勾选后会成为画布节点可以填写或接收的参数。</div>
                                            </div>
                                            <Tag className="m-0">{candidates.length} 个可配置输入</Tag>
                                        </div>
                                        <div className="grid max-h-[560px] gap-2 overflow-y-auto pr-1">
                                            {candidates.map((candidate) => {
                                                const active = selectedFieldKeys.has(fieldKey(candidate.field));
                                                return (
                                                    <button
                                                        key={`${candidate.node}:${candidate.input}`}
                                                        type="button"
                                                        className={cn("rounded-md border p-3 text-left transition", active ? "border-emerald-500 bg-emerald-50 dark:border-emerald-600 dark:bg-emerald-950/30" : "border-stone-200 hover:bg-stone-50 dark:border-stone-800 dark:hover:bg-stone-900")}
                                                        onClick={() => toggleField(candidate)}
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <div className="line-clamp-1 text-sm font-medium">
                                                                    {candidate.nodeTitle} · {candidate.input}
                                                                </div>
                                                                <div className="mt-1 text-xs text-stone-500">
                                                                    {candidate.node} · {candidate.classType || "Unknown"}
                                                                </div>
                                                            </div>
                                                            {active ? <Check className="size-4 shrink-0 text-emerald-600" /> : null}
                                                        </div>
                                                        <Typography.Paragraph ellipsis={{ rows: 2 }} className="!mb-0 !mt-2 !text-xs !text-stone-500">
                                                            {formatValue(candidate.value)}
                                                        </Typography.Paragraph>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="min-w-0 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                                        <div className="mb-3 text-sm font-semibold">暴露参数</div>
                                        {selected.fields.length ? (
                                            <div className="space-y-3">
                                                {selected.fields.map((field) => (
                                                    <div key={field.id} className="rounded-md border border-stone-200 p-3 dark:border-stone-800">
                                                        <div className="mb-2 flex items-center justify-between gap-2">
                                                            <div className="min-w-0 text-xs text-stone-500">
                                                                {field.node} · {field.input}
                                                            </div>
                                                            <Button size="small" danger onClick={() => updateSelected({ fields: selected.fields.filter((item) => item.id !== field.id) })}>
                                                                移除
                                                            </Button>
                                                        </div>
                                                        <div className="grid gap-2">
                                                            <Input value={field.name} onChange={(event) => updateField(field.id, { name: event.target.value })} />
                                                            <Select value={field.type} options={fieldTypes} onChange={(type) => updateField(field.id, { type })} />
                                                            <FieldDefaultEditor field={field} onChange={(value) => updateField(field.id, { default: value })} />
                                                            {field.type === "dropdown" ? <Select mode="tags" value={field.options || []} placeholder="输入选项后回车" onChange={(options) => updateField(field.id, { options })} /> : null}
                                                            {(field.type === "number" || field.type === "slider") && (
                                                                <div className="grid grid-cols-3 gap-2">
                                                                    <InputNumber className="w-full" value={field.min ?? undefined} placeholder="min" onChange={(value) => updateField(field.id, { min: numberOrNull(value) })} />
                                                                    <InputNumber className="w-full" value={field.max ?? undefined} placeholder="max" onChange={(value) => updateField(field.id, { max: numberOrNull(value) })} />
                                                                    <InputNumber className="w-full" value={field.step ?? undefined} placeholder="step" onChange={(value) => updateField(field.id, { step: numberOrNull(value) })} />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有暴露参数" />
                                        )}
                                    </div>
                                </div>

                                {runPromptId || runImages.length ? (
                                    <div className="mt-5 rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                                        <div className="mb-3 text-sm font-semibold">试运行结果 {runPromptId ? <span className="text-xs font-normal text-stone-500">prompt_id: {runPromptId}</span> : null}</div>
                                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                            {runImages.map((url) => (
                                                <img key={url} src={url} alt="" className="aspect-square w-full rounded-md border border-stone-200 object-contain dark:border-stone-800" />
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                            </section>
                        ) : (
                            <section className="flex min-h-[520px] items-center justify-center rounded-lg border border-dashed border-stone-300 dark:border-stone-700">
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="导入 ComfyUI API workflow 后开始配置" />
                            </section>
                        )}
                    </div>
                </div>
            </main>
            <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void importWorkflow(event.target.files?.[0])} />
        </div>
    );
}

function FieldDefaultEditor({ field, onChange }: { field: ComfyWorkflowField; onChange: (value: unknown) => void }) {
    if (field.type === "boolean") return <Switch checked={Boolean(field.default)} onChange={onChange} />;
    if (field.type === "number" || field.type === "slider") return <InputNumber className="w-full" value={Number(field.default) || 0} onChange={(value) => onChange(numberOrNull(value) ?? 0)} />;
    if (field.type === "textarea") return <Input.TextArea rows={3} value={String(field.default ?? "")} onChange={(event) => onChange(event.target.value)} />;
    return <Input value={String(field.default ?? "")} onChange={(event) => onChange(event.target.value)} />;
}

function fieldKey(field: Pick<ComfyWorkflowField, "node" | "input">) {
    return `${field.node}:${field.input}`;
}

function formatValue(value: unknown) {
    if (typeof value === "string") return value || "空字符串";
    return JSON.stringify(value);
}

function numberOrNull(value: string | number | null) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
}
