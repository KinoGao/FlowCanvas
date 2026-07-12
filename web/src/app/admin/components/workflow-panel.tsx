import { App, Button, Empty, Input, InputNumber, Select, Space, Switch, Table, Tag, Upload } from "antd";
import { FileJson, Plus, Save, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useState } from "react";

import { AdminCard } from "./admin-card";
import { deleteAdminWorkflow, saveAdminWorkflowConfig, uploadAdminWorkflow } from "@/services/api/platform-admin";
import {
    parseComfyWorkflowJson,
    type ComfyWorkflow,
    type ComfyWorkflowField,
    type ComfyWorkflowFieldType,
    type ComfyWorkflowInputCandidate,
} from "@/services/comfyui-workflows";

const FIELD_TYPES: Array<{ value: ComfyWorkflowFieldType; label: string }> = [
    { value: "text", label: "单行文本" }, { value: "textarea", label: "多行文本" },
    { value: "number", label: "数字" }, { value: "slider", label: "滑杆" },
    { value: "dropdown", label: "下拉选择" }, { value: "boolean", label: "开关" },
    { value: "image", label: "图片" }, { value: "video", label: "视频" }, { value: "audio", label: "音频" },
];

type Props = {
    authCode: string;
    workflows: ComfyWorkflow[];
    selectedWorkflow: ComfyWorkflow | null;
    selectedWorkflowId: string;
    candidates: ComfyWorkflowInputCandidate[];
    selectedFieldKeys: Set<string>;
    onSelect: (id: string) => void;
    onWorkflowsChange: (workflows: ComfyWorkflow[]) => void;
};

export function WorkflowPanel(props: Props) {
    const { message, modal } = App.useApp();
    const [title, setTitle] = useState("");
    const [fields, setFields] = useState<ComfyWorkflowField[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setTitle(props.selectedWorkflow?.title || "");
        setFields((props.selectedWorkflow?.fields || []).map((field) => ({ ...field, options: [...(field.options || [])] })));
    }, [props.selectedWorkflow]);

    const upload = async (file: File) => {
        try {
            const workflow = parseComfyWorkflowJson(await file.text());
            const saved = await uploadAdminWorkflow(props.authCode, file.name, workflow);
            props.onWorkflowsChange([saved, ...props.workflows.filter((item) => item.id !== saved.id)]);
            props.onSelect(saved.id);
            message.success("工作流已上传，选择需要暴露的输入参数");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "工作流上传失败");
        }
        return false;
    };
    const save = async () => {
        if (!props.selectedWorkflow) return;
        setSaving(true);
        try {
            const saved = await saveAdminWorkflowConfig(props.authCode, props.selectedWorkflow.id, { title: title.trim() || props.selectedWorkflow.title, fields });
            props.onWorkflowsChange(props.workflows.map((item) => item.id === saved.id ? saved : item));
            message.success("工作流参数已发布");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "工作流保存失败");
        } finally {
            setSaving(false);
        }
    };
    const remove = () => props.selectedWorkflow && modal.confirm({
        title: "删除工作流？", content: "删除后所有用户都无法再使用该工作流。", okText: "删除",
        okButtonProps: { danger: true }, cancelText: "取消",
        onOk: async () => {
            await deleteAdminWorkflow(props.authCode, props.selectedWorkflow!.id);
            const next = props.workflows.filter((item) => item.id !== props.selectedWorkflow!.id);
            props.onWorkflowsChange(next);
            props.onSelect(next[0]?.id || "");
            message.success("工作流已删除");
        },
    });
    const addField = (candidate: ComfyWorkflowInputCandidate) => {
        const key = fieldKey(candidate);
        if (fields.some((field) => fieldKey(field) === key)) return;
        setFields([...fields, { ...candidate.field, options: [...(candidate.field.options || [])] }]);
    };
    const updateField = (id: string, patch: Partial<ComfyWorkflowField>) => setFields(fields.map((field) => field.id === id ? { ...field, ...patch } : field));

    return <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
        <AdminCard title="全局工作流" description="上传 ComfyUI API 格式 JSON。" action={<Upload accept=".json,application/json" showUploadList={false} beforeUpload={(file) => upload(file as File)}><Button type="primary" icon={<UploadCloud className="size-4" />}>上传</Button></Upload>}>
            <Space direction="vertical" size={8} className="w-full">
                {props.workflows.length ? props.workflows.map((workflow) => <button type="button" key={workflow.id} onClick={() => props.onSelect(workflow.id)} className={"w-full rounded-2xl border px-3 py-3 text-left transition " + (workflow.id === props.selectedWorkflowId ? "border-blue-500 bg-blue-500/8" : "border-black/5 bg-black/[0.02] hover:bg-black/[0.04] dark:border-white/10 dark:bg-white/[0.03]")}><div className="flex items-center gap-2"><FileJson className="size-4 text-gray-400" /><span className="truncate text-sm font-medium">{workflow.title}</span></div><div className="mt-1 truncate pl-6 text-xs text-gray-400">{workflow.fields.length} 个参数 · {workflow.name}</div></button>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有工作流" />}
            </Space>
        </AdminCard>

        {props.selectedWorkflow ? <Space direction="vertical" size={18} className="min-w-0 w-full">
            <AdminCard title="工作流参数" description="只把创作端真正需要调整的输入暴露出来。" action={<Space><Button danger icon={<Trash2 className="size-4" />} onClick={remove}>删除</Button><Button type="primary" loading={saving} icon={<Save className="size-4" />} onClick={() => void save()}>保存参数</Button></Space>}>
                <div className="mb-5 grid gap-4 md:grid-cols-2"><label className="text-sm"><span className="mb-2 block text-gray-500">显示名称</span><Input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="text-sm"><span className="mb-2 block text-gray-500">工作流 ID</span><Input disabled value={props.selectedWorkflow.id} /></label></div>
                <Table rowKey="id" pagination={false} dataSource={fields} scroll={{ x: 950 }} locale={{ emptyText: "从下方候选输入中添加参数" }} columns={[
                    { title: "参数名", key: "name", width: 180, render: (_, field) => <Input value={field.name} onChange={(event) => updateField(field.id, { name: event.target.value })} /> },
                    { title: "节点输入", key: "path", width: 160, render: (_, field) => <div><div className="text-xs">{field.node}:{field.input}</div><div className="text-xs text-gray-400">{String(field.default ?? "")}</div></div> },
                    { title: "控件", key: "type", width: 140, render: (_, field) => <Select className="w-full" value={field.type} options={FIELD_TYPES} onChange={(type) => updateField(field.id, { type })} /> },
                    { title: "范围 / 选项", key: "limits", width: 240, render: (_, field) => field.type === "number" || field.type === "slider" ? <Space.Compact><InputNumber placeholder="最小" value={field.min} onChange={(min) => updateField(field.id, { min })} /><InputNumber placeholder="最大" value={field.max} onChange={(max) => updateField(field.id, { max })} /><InputNumber placeholder="步长" value={field.step} onChange={(step) => updateField(field.id, { step })} /></Space.Compact> : field.type === "dropdown" ? <Select className="w-full" mode="tags" value={field.options || []} onChange={(options) => updateField(field.id, { options })} /> : <span className="text-xs text-gray-400">自动</span> },
                    { title: "绑定提示词", key: "prompt", width: 100, render: (_, field) => <Switch size="small" checked={field.bindPrompt} onChange={(bindPrompt) => updateField(field.id, { bindPrompt })} /> },
                    { title: "", key: "remove", width: 48, fixed: "right", render: (_, field) => <Button danger type="text" icon={<Trash2 className="size-4" />} onClick={() => setFields(fields.filter((item) => item.id !== field.id))} /> },
                ]} />
            </AdminCard>
            <AdminCard title="可用输入" description="后台已自动排除节点之间的连线，只列出可以覆盖的常量输入。">
                <div className="flex flex-wrap gap-2">{props.candidates.map((candidate) => {
                    const selected = props.selectedFieldKeys.has(fieldKey(candidate)) || fields.some((field) => fieldKey(field) === fieldKey(candidate));
                    return <Button key={fieldKey(candidate)} size="small" disabled={selected} icon={!selected ? <Plus className="size-3.5" /> : undefined} onClick={() => addField(candidate)}>{candidate.nodeTitle} · {candidate.input}</Button>;
                })}</div>
                {!props.candidates.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未检测到可配置输入" /> : null}
            </AdminCard>
        </Space> : <AdminCard title="工作流参数"><Empty description="选择或上传一个工作流" /></AdminCard>}
    </div>;
}

function fieldKey(field: Pick<ComfyWorkflowField, "node" | "input">) {
    return field.node + ":" + field.input;
}
