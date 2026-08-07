"use client";

import { useEffect, useState } from "react";
import { Button, Input, Modal } from "antd";
import { Copy, Plus, Save, Trash2 } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasWorkflowTemplate } from "../utils/canvas-workflow-template";

export function CanvasWorkflowToolbox({
    open,
    templates,
    loading = false,
    selectedCount,
    onClose,
    onSaveSelection,
    onInsert,
    onDelete,
}: {
    open: boolean;
    templates: CanvasWorkflowTemplate[];
    loading?: boolean;
    selectedCount: number;
    onClose: () => void;
    onSaveSelection: (name: string) => Promise<CanvasWorkflowTemplate | null>;
    onInsert: (template: CanvasWorkflowTemplate) => void;
    onDelete: (templateId: string) => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const [name, setName] = useState("");
    const [createdId, setCreatedId] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setName("");
            setCreatedId(null);
        }
    }, [open]);

    const save = async () => {
        if (!selectedCount) return;
        const template = await onSaveSelection(name || "");
        if (template) setCreatedId(template.id);
    };

    return (
        <Modal title="工作流工具箱" open={open} centered width={560} footer={null} onCancel={onClose} destroyOnHidden styles={{ body: { background: theme.node.panel, color: theme.node.text } }}>
            <div className="mb-3 flex items-center gap-2">
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={`将选中的 ${selectedCount} 个节点保存为模板`} allowClear disabled={!selectedCount} onPressEnter={save} />
                <Button type="primary" icon={<Save className="size-4" />} disabled={!selectedCount} onClick={save}>
                    保存选中
                </Button>
            </div>
            <div className="thin-scrollbar max-h-[320px] space-y-2 overflow-y-auto pr-1">
                {!templates.length ? (
                    <div className="rounded-lg border border-dashed py-8 text-center text-xs opacity-55" style={{ borderColor: theme.toolbar.border }}>
                        {loading ? "正在加载模板..." : "还没有模板。选中画布上的一组节点后，输入名称点「保存选中」。"}
                    </div>
                ) : (
                    templates.map((template) => (
                        <div
                            key={template.id}
                            className="flex items-center gap-2 rounded-lg border p-2.5"
                            style={{ borderColor: template.id === createdId ? theme.ui.accent : theme.toolbar.border, background: theme.node.fill }}
                        >
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">{template.name}</div>
                                <div className="mt-0.5 text-[11px] opacity-55">
                                    {template.nodes.length} 个节点 · {template.connections.length} 条连线
                                </div>
                            </div>
                            <Button size="small" icon={<Copy className="size-3.5" />} onClick={() => onInsert(template)}>
                                插入
                            </Button>
                            <Button size="small" type="text" danger icon={<Trash2 className="size-3.5" />} onClick={() => onDelete(template.id)} aria-label={`删除模板 ${template.name}`} />
                        </div>
                    ))
                )}
            </div>
        </Modal>
    );
}
