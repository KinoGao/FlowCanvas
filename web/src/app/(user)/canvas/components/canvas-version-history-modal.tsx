"use client";

import { Button, Modal, theme as antdTheme } from "antd";
import { Download, History, RotateCcw, Trash2 } from "lucide-react";

import type { CanvasProjectVersion } from "../stores/use-canvas-store";

export function CanvasVersionHistoryModal({
    open,
    versions,
    onClose,
    onSave,
    onRestore,
    onDelete,
}: {
    open: boolean;
    versions: CanvasProjectVersion[];
    onClose: () => void;
    onSave: () => void;
    onRestore: (version: CanvasProjectVersion) => void;
    onDelete: (versionId: string) => void;
}) {
    const { token } = antdTheme.useToken();
    return (
        <Modal
            title={
                <span className="inline-flex items-center gap-2">
                    <History className="size-4" />
                    画布版本历史
                </span>
            }
            open={open}
            centered
            width={720}
            onCancel={onClose}
            destroyOnHidden
            styles={{ body: { background: token.colorBgElevated, color: token.colorText } }}
            footer={[
                <Button key="save" icon={<Download className="size-4" />} onClick={onSave}>
                    保存当前快照
                </Button>,
                <Button key="close" onClick={onClose}>关闭</Button>,
            ]}
        >
            <div className="thin-scrollbar max-h-[62vh] overflow-y-auto pr-1">
                {versions.length ? versions.map((version) => (
                    <div key={version.id} className="mb-2 flex items-center gap-3 rounded-xl border px-3 py-3" style={{ borderColor: token.colorBorderSecondary, background: token.colorFillQuaternary }}>
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{version.label}</div>
                            <div className="mt-1 text-xs opacity-55">
                                {new Date(version.createdAt).toLocaleString()} · {version.nodes.length} 节点 · {version.connections.length} 连线
                            </div>
                        </div>
                        <Button icon={<RotateCcw className="size-3.5" />} onClick={() => onRestore(version)}>恢复</Button>
                        <Button danger icon={<Trash2 className="size-3.5" />} onClick={() => onDelete(version.id)} />
                    </div>
                )) : (
                    <div className="py-12 text-center text-sm opacity-50">还没有版本快照，点击「保存当前快照」创建第一份。</div>
                )}
            </div>
        </Modal>
    );
}
