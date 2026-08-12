"use client";

import { App, Button, Card, Input, Space, Tabs } from "antd";
import { ArrowLeft, Database, FileText, Save, ServerCog, Users, Workflow } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { ComfyConfigPanel } from "./components/comfy-config-panel";
import { ModelConfigPanel } from "./components/model-config-panel";
import { ModelRequestLogPanel } from "./components/model-request-log-panel";
import { WorkflowPanel } from "./components/workflow-panel";
import { WorkspacePanel } from "./components/workspace-panel";
import { normalizePlatformConfig } from "./platform-config-utils";
import { adminLogin, ApiError } from "@/services/api/auth";
import {
    fetchAdminWorkspaces, fetchPlatformConfig, fetchPublishedWorkflows, savePlatformConfig,
    type AdminUserWorkspace, type PlatformConfigDocument,
} from "@/services/api/platform-admin";
import { listComfyWorkflowInputCandidates, type ComfyWorkflow, type ComfyWorkflowField } from "@/services/comfyui-workflows";
import { notifyRuntimeConfigChanged, refreshRuntimeConfig } from "@/services/runtime-config";

const ADMIN_TOKEN_KEY = "flowcanvas:admin-token";

export default function AdminPage() {
    const { message } = App.useApp();
    const [token, setToken] = useState(() => sessionStorage.getItem(ADMIN_TOKEN_KEY) || "");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [adminCode, setAdminCode] = useState("");
    const [config, setConfig] = useState<PlatformConfigDocument | null>(null);
    const [workflows, setWorkflows] = useState<ComfyWorkflow[]>([]);
    const [workspaces, setWorkspaces] = useState<AdminUserWorkspace[]>([]);
    const [selectedWorkflowId, setSelectedWorkflowId] = useState("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const selectedWorkflow = workflows.find((item) => item.id === selectedWorkflowId) || workflows[0] || null;
    const candidates = useMemo(() => selectedWorkflow ? listComfyWorkflowInputCandidates(selectedWorkflow.workflow) : [], [selectedWorkflow]);
    const selectedFieldKeys = useMemo(() => new Set((selectedWorkflow?.fields || []).map(fieldKey)), [selectedWorkflow?.fields]);

    const loadAll = async (nextToken = token) => {
        if (!nextToken) return;
        setLoading(true);
        try {
            const [nextConfig, nextWorkflows, workspaceSummary] = await Promise.all([
                fetchPlatformConfig(nextToken), fetchPublishedWorkflows(), fetchAdminWorkspaces(nextToken),
            ]);
            setConfig(normalizePlatformConfig(nextConfig));
            setWorkflows(nextWorkflows);
            setWorkspaces(workspaceSummary.users);
            setSelectedWorkflowId((current) => current && nextWorkflows.some((item) => item.id === current) ? current : nextWorkflows[0]?.id || "");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "后台数据加载失败");
            if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
                sessionStorage.removeItem(ADMIN_TOKEN_KEY);
                setToken("");
                setConfig(null);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (token && !config) void loadAll(token);
        // Only restore the persisted admin session when the token changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const login = async () => {
        if (!username.trim() || !password || !adminCode.trim()) return void message.warning("请输入管理员账号、密码和授权码");
        setLoading(true);
        try {
            const session = await adminLogin({ username: username.trim(), password, adminCode: adminCode.trim() });
            sessionStorage.setItem(ADMIN_TOKEN_KEY, session.token);
            setToken(session.token);
            await loadAll(session.token);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "管理员登录失败");
        } finally {
            setLoading(false);
        }
    };

    const saveConfig = async () => {
        if (!config) return;
        setSaving(true);
        try {
            setConfig(normalizePlatformConfig(await savePlatformConfig(token, normalizePlatformConfig(config))));
            await refreshRuntimeConfig();
            notifyRuntimeConfigChanged();
            message.success("全局配置已保存并同步到画布");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    if (!token || !config) return <AdminLogin username={username} password={password} adminCode={adminCode} loading={loading} onUsername={setUsername} onPassword={setPassword} onAdminCode={setAdminCode} onLogin={login} />;

    return <div className="h-screen overflow-y-auto overscroll-contain bg-[#f5f5f7] px-6 py-6 pb-12 text-[#1d1d1f] dark:bg-[#111113] dark:text-white"><div className="mx-auto max-w-7xl"><div className="mb-6 flex flex-wrap items-center justify-between gap-3"><Space><Link to="/" className="inline-flex size-10 items-center justify-center rounded-full bg-white/90 text-gray-600 shadow-sm dark:bg-white/10 dark:text-white/70"><ArrowLeft className="size-4" /></Link><div><h1 className="m-0 text-2xl font-semibold">FlowCanvas 管理后台</h1><p className="m-0 text-sm text-gray-500">统一管理模型、ComfyUI、工作流和用户画布</p></div></Space><Space wrap><Button loading={loading} onClick={() => void loadAll()}>刷新</Button><Button icon={<Save className="size-4" />} loading={saving} type="primary" onClick={() => void saveConfig()}>保存配置</Button><Button onClick={() => { sessionStorage.removeItem(ADMIN_TOKEN_KEY); setToken(""); setConfig(null); }}>退出后台</Button></Space></div><Tabs items={[
        { key: "models", label: <TabLabel icon={<Database />} text="模型配置" />, children: <ModelConfigPanel authToken={token} config={config} onChange={setConfig} /> },
        { key: "logs", label: <TabLabel icon={<FileText />} text="请求日志" />, children: <ModelRequestLogPanel authToken={token} modelOptions={(config.models || []).map((item) => item.id)} /> },
        { key: "comfy", label: <TabLabel icon={<ServerCog />} text="ComfyUI" />, children: <ComfyConfigPanel comfyui={config.comfyui} onChange={(comfyui) => setConfig({ ...config, comfyui })} /> },
        { key: "workflows", label: <TabLabel icon={<Workflow />} text="工作流" />, children: <WorkflowPanel authCode={token} workflows={workflows} selectedWorkflow={selectedWorkflow} selectedWorkflowId={selectedWorkflowId} candidates={candidates} selectedFieldKeys={selectedFieldKeys} onSelect={setSelectedWorkflowId} onWorkflowsChange={setWorkflows} /> },
        { key: "workspaces", label: <TabLabel icon={<Users />} text="账号与画布" />, children: <WorkspacePanel authToken={token} users={workspaces} onRefresh={() => loadAll(token)} /> },
    ]} /></div></div>;
}

function AdminLogin(props: { username: string; password: string; adminCode: string; loading: boolean; onUsername: (value: string) => void; onPassword: (value: string) => void; onAdminCode: (value: string) => void; onLogin: () => Promise<void> }) {
    return <div className="min-h-screen bg-[#f5f5f7] px-6 py-10 dark:bg-[#111113]"><Card className="mx-auto mt-24 max-w-md rounded-[28px] bg-white/90 shadow-[0_24px_70px_rgba(0,0,0,0.12)] dark:bg-white/10"><Space direction="vertical" size={16} className="w-full"><Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-500"><ArrowLeft className="size-4" />返回创作端</Link><div><h1 className="m-0 text-2xl font-semibold">管理员登录</h1><p className="mt-2 text-sm text-gray-500">使用管理员账号、密码和管理员授权码登录</p></div><Input size="large" autoComplete="username" placeholder="管理员账号" value={props.username} onChange={(event) => props.onUsername(event.target.value)} /><Input.Password size="large" autoComplete="current-password" placeholder="密码" value={props.password} onChange={(event) => props.onPassword(event.target.value)} /><Input.Password size="large" placeholder="管理员授权码" value={props.adminCode} onChange={(event) => props.onAdminCode(event.target.value)} onPressEnter={() => void props.onLogin()} /><Button type="primary" size="large" block loading={props.loading} onClick={() => void props.onLogin()}>登录后台</Button></Space></Card></div>;
}

function TabLabel(props: { icon: React.ReactNode; text: string }) {
    return <span className="inline-flex items-center gap-2 [&_svg]:size-4">{props.icon}{props.text}</span>;
}

function fieldKey(field: Pick<ComfyWorkflowField, "node" | "input">) { return field.node + ":" + field.input; }
