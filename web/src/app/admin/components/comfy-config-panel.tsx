import { Form, Input, InputNumber, Switch } from "antd";

import { AdminCard } from "./admin-card";
import { numberOr } from "../platform-config-utils";
import type { PlatformComfyUi } from "@/services/api/platform-admin";

export function ComfyConfigPanel(props: { comfyui: PlatformComfyUi; onChange: (comfyui: PlatformComfyUi) => void }) {
    const update = (patch: Partial<PlatformComfyUi>) => props.onChange({ ...props.comfyui, ...patch });
    return <AdminCard title="ComfyUI 全局连接" description="所有账号共用后端配置的 ComfyUI 地址和工作流能力。"><div className="grid gap-4 md:grid-cols-2"><Form.Item label="启用 ComfyUI" className="mb-0"><Switch checked={props.comfyui.enabled} onChange={(enabled) => update({ enabled })} /></Form.Item><Form.Item label="默认工作流 ID" className="mb-0"><Input value={props.comfyui.defaultWorkflowId} onChange={(event) => update({ defaultWorkflowId: event.target.value })} /></Form.Item><Form.Item label="ComfyUI 地址" className="mb-0"><Input value={props.comfyui.baseUrl} onChange={(event) => update({ baseUrl: event.target.value })} /></Form.Item><Form.Item label="Client ID" className="mb-0"><Input value={props.comfyui.clientId} onChange={(event) => update({ clientId: event.target.value })} /></Form.Item><Form.Item label="超时时间 / 秒" className="mb-0"><InputNumber className="w-full" min={30} value={props.comfyui.timeoutSeconds} onChange={(value) => update({ timeoutSeconds: numberOr(value, 300) })} /></Form.Item><Form.Item label="轮询间隔 / ms" className="mb-0"><InputNumber className="w-full" min={300} value={props.comfyui.pollIntervalMs} onChange={(value) => update({ pollIntervalMs: numberOr(value, 1200) })} /></Form.Item></div></AdminCard>;
}
