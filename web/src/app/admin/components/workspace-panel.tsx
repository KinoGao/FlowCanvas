import { App, Button, Descriptions, Drawer, Empty, Form, Input, Modal, Select, Space, Table, Tag } from "antd";
import { Eye, HardDrive, Image, KeyRound, PanelsTopLeft, Pencil, Trash2, Users } from "lucide-react";
import { useState } from "react";

import { AdminCard } from "./admin-card";
import { deleteAdminProject, deleteAdminUser, fetchAdminProject, resetAdminUserPassword, updateAdminUser, type AdminProjectDetail, type AdminProjectSummary, type AdminUserWorkspace } from "@/services/api/platform-admin";

type Props = { authToken: string; users: AdminUserWorkspace[]; onRefresh: () => Promise<void> | void };
const T = {
    users: "\u7528\u6237\u6570\u91cf", activeCanvases: "\u6709\u6548\u753b\u5e03", assets: "\u7d20\u6750\u6570\u91cf", files: "\u5a92\u4f53\u6587\u4ef6",
    workspace: "\u8d26\u53f7\u4e0e\u5de5\u4f5c\u533a", description: "\u7ba1\u7406\u5458\u53ef\u4ee5\u4fee\u6539\u8d26\u53f7\u3001\u89d2\u8272\u548c\u5bc6\u7801\uff0c\u5e76\u67e5\u770b\u6216\u5220\u9664\u6bcf\u4e2a\u8d26\u53f7\u4e0b\u7684\u753b\u5e03\u3002",
    account: "\u8d26\u53f7", role: "\u89d2\u8272", canvas: "\u753b\u5e03", updated: "\u6700\u8fd1\u66f4\u65b0", actions: "\u64cd\u4f5c", admin: "\u7ba1\u7406\u5458", user: "\u666e\u901a\u7528\u6237",
    edit: "\u7f16\u8f91\u8d26\u53f7", reset: "\u91cd\u7f6e\u5bc6\u7801", deleteAccount: "\u5220\u9664\u8d26\u53f7", details: "\u753b\u5e03\u8be6\u60c5", canvasData: "\u753b\u5e03\u6570\u636e",
    status: "\u72b6\u6001", deleted: "\u5df2\u5220\u9664", normal: "\u6b63\u5e38", save: "\u4fdd\u5b58", username: "\u7528\u6237\u540d", displayName: "\u663e\u793a\u540d\u79f0", noCanvas: "\u6682\u65e0\u753b\u5e03", untitled: "\u672a\u547d\u540d\u753b\u5e03",
};

export function WorkspacePanel(props: Props) {
    const { message, modal } = App.useApp();
    const [detail, setDetail] = useState<AdminProjectDetail | null>(null);
    const [loadingProject, setLoadingProject] = useState("");
    const [editing, setEditing] = useState<AdminUserWorkspace | null>(null);
    const [passwordUser, setPasswordUser] = useState<AdminUserWorkspace | null>(null);
    const [newPassword, setNewPassword] = useState("");

    const inspect = async (userId: string, project: AdminProjectSummary) => {
        setLoadingProject(userId + ":" + project.id);
        try { setDetail(await fetchAdminProject(props.authToken, userId, project.id)); }
        catch (error) { message.error(errorMessage(error, "\u753b\u5e03\u6570\u636e\u52a0\u8f7d\u5931\u8d25")); }
        finally { setLoadingProject(""); }
    };
    const saveUser = async () => {
        if (!editing) return;
        try {
            await updateAdminUser(props.authToken, editing.id, { username: editing.username.trim(), displayName: editing.displayName.trim(), role: editing.role });
            message.success("\u8d26\u53f7\u5df2\u66f4\u65b0"); setEditing(null); await props.onRefresh();
        } catch (error) { message.error(errorMessage(error, "\u8d26\u53f7\u66f4\u65b0\u5931\u8d25")); }
    };
    const resetPassword = async () => {
        if (!passwordUser || newPassword.length < 6) return void message.warning("\u5bc6\u7801\u81f3\u5c11\u9700\u8981 6 \u4e2a\u5b57\u7b26");
        try {
            await resetAdminUserPassword(props.authToken, passwordUser.id, newPassword);
            message.success("\u5bc6\u7801\u5df2\u91cd\u7f6e\uff0c\u8be5\u8d26\u53f7\u73b0\u6709\u4f1a\u8bdd\u5df2\u5931\u6548"); setPasswordUser(null); setNewPassword("");
        } catch (error) { message.error(errorMessage(error, "\u5bc6\u7801\u91cd\u7f6e\u5931\u8d25")); }
    };
    const removeUser = (user: AdminUserWorkspace) => modal.confirm({
        title: "\u5220\u9664\u8d26\u53f7 " + user.username + "\uff1f", content: "\u8d26\u53f7\u3001\u914d\u7f6e\u3001\u753b\u5e03\u3001\u7d20\u6750\u548c\u5a92\u4f53\u6587\u4ef6\u5c06\u4e00\u5e76\u5220\u9664\uff0c\u6b64\u64cd\u4f5c\u65e0\u6cd5\u64a4\u9500\u3002", okText: T.deleteAccount, okButtonProps: { danger: true },
        onOk: async () => { try { await deleteAdminUser(props.authToken, user.id); message.success("\u8d26\u53f7\u5df2\u5220\u9664"); await props.onRefresh(); } catch (error) { message.error(errorMessage(error, "\u8d26\u53f7\u5220\u9664\u5931\u8d25")); throw error; } },
    });
    const removeProject = (user: AdminUserWorkspace, project: AdminProjectSummary) => modal.confirm({
        title: "\u5220\u9664\u753b\u5e03 " + (project.title || project.id) + "\uff1f", content: "\u5c06\u4ece\u8d26\u53f7 " + user.username + " \u4e2d\u5220\u9664\u8be5\u753b\u5e03\uff0c\u6b64\u64cd\u4f5c\u65e0\u6cd5\u64a4\u9500\u3002", okText: "\u5220\u9664\u753b\u5e03", okButtonProps: { danger: true },
        onOk: async () => { try { await deleteAdminProject(props.authToken, user.id, project.id); message.success("\u753b\u5e03\u5df2\u5220\u9664"); await props.onRefresh(); } catch (error) { message.error(errorMessage(error, "\u753b\u5e03\u5220\u9664\u5931\u8d25")); throw error; } },
    });
    const totals = props.users.reduce((result, user) => ({ projects: result.projects + user.activeProjectCount, assets: result.assets + user.assetCount, files: result.files + user.fileCount, bytes: result.bytes + user.fileBytes }), { projects: 0, assets: 0, files: 0, bytes: 0 });

    return <Space direction="vertical" size={18} className="w-full">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric icon={<Users />} label={T.users} value={props.users.length} /><Metric icon={<PanelsTopLeft />} label={T.activeCanvases} value={totals.projects} /><Metric icon={<Image />} label={T.assets} value={totals.assets} /><Metric icon={<HardDrive />} label={T.files} value={totals.files} detail={formatBytes(totals.bytes)} /></div>
        <AdminCard title={T.workspace} description={T.description}><Table rowKey="id" dataSource={props.users} scroll={{ x: 1120 }} pagination={{ pageSize: 15, hideOnSinglePage: true }} expandable={{ rowExpandable: (user) => user.projects.length > 0, expandedRowRender: (user) => <ProjectTable user={user} loadingProject={loadingProject} onInspect={inspect} onDelete={removeProject} /> }} columns={[
            { title: T.account, key: "account", render: (_, user) => <div><div className="font-medium">{user.displayName || user.username}</div><div className="text-xs text-gray-400">{user.username} ? {user.id}</div></div> },
            { title: T.role, dataIndex: "role", width: 100, render: (role) => <Tag color={role === "ADMIN" ? "gold" : "default"}>{role === "ADMIN" ? T.admin : T.user}</Tag> },
            { title: T.canvas, key: "projects", width: 120, render: (_, user) => <span>{user.activeProjectCount} / {user.projectCount}</span> }, { title: T.assets, dataIndex: "assetCount", width: 90 },
            { title: T.files, key: "files", width: 150, render: (_, user) => <span>{user.fileCount} ? {formatBytes(user.fileBytes)}</span> }, { title: T.updated, dataIndex: "updatedAt", width: 180, render: formatDate },
            { title: T.actions, key: "actions", width: 150, render: (_, user) => <Space><Button type="text" title={T.edit} icon={<Pencil className="size-4" />} onClick={() => setEditing({ ...user })} /><Button type="text" title={T.reset} icon={<KeyRound className="size-4" />} onClick={() => { setPasswordUser(user); setNewPassword(""); }} /><Button danger type="text" title={T.deleteAccount} icon={<Trash2 className="size-4" />} onClick={() => removeUser(user)} /></Space> },
        ]} /></AdminCard>
        <Drawer title={detail?.title || T.details} width={760} open={Boolean(detail)} onClose={() => setDetail(null)}>{detail ? <><Descriptions size="small" column={2} className="mb-5" items={[{ key: "id", label: "ID", children: detail.id }, { key: "user", label: "User ID", children: detail.userId }, { key: "updated", label: T.updated, children: formatDate(detail.updatedAt) }, { key: "status", label: T.status, children: detail.deletedAt ? <Tag>{T.deleted}</Tag> : <Tag color="green">{T.normal}</Tag> }]} /><div className="mb-2 text-sm font-medium">{T.canvasData}</div><pre className="max-h-[calc(100vh-220px)] overflow-auto rounded-2xl bg-[#111113] p-4 text-xs leading-6 text-white/80">{JSON.stringify(detail.project, null, 2)}</pre></> : null}</Drawer>
        <Modal title={T.edit} open={Boolean(editing)} onCancel={() => setEditing(null)} onOk={() => void saveUser()} okText={T.save}>{editing ? <Form layout="vertical"><Form.Item label={T.username}><Input value={editing.username} onChange={(event) => setEditing({ ...editing, username: event.target.value })} /></Form.Item><Form.Item label={T.displayName}><Input value={editing.displayName} onChange={(event) => setEditing({ ...editing, displayName: event.target.value })} /></Form.Item><Form.Item label={T.role}><Select value={editing.role} options={[{ value: "USER", label: T.user }, { value: "ADMIN", label: T.admin }]} onChange={(role) => setEditing({ ...editing, role })} /></Form.Item></Form> : null}</Modal>
        <Modal title={T.reset + " ? " + (passwordUser?.username || T.account)} open={Boolean(passwordUser)} onCancel={() => setPasswordUser(null)} onOk={() => void resetPassword()} okText={T.reset}><Input.Password autoFocus placeholder="6+" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} onPressEnter={() => void resetPassword()} /></Modal>
    </Space>;
}

function ProjectTable(props: { user: AdminUserWorkspace; loadingProject: string; onInspect: (userId: string, project: AdminProjectSummary) => void; onDelete: (user: AdminUserWorkspace, project: AdminProjectSummary) => void }) {
    if (!props.user.projects.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={T.noCanvas} />;
    return <Table rowKey="id" size="small" pagination={false} dataSource={props.user.projects} columns={[
        { title: T.canvas, key: "title", render: (_, project) => <div><div>{project.title || T.untitled}</div><div className="text-xs text-gray-400">{project.id}</div></div> },
        { title: T.status, key: "status", width: 100, render: (_, project) => project.deletedAt ? <Tag>{T.deleted}</Tag> : <Tag color="green">{T.normal}</Tag> }, { title: T.updated, dataIndex: "updatedAt", width: 180, render: formatDate },
        { title: T.actions, key: "actions", width: 110, render: (_, project) => <Space><Button type="text" title={T.details} icon={<Eye className="size-4" />} loading={props.loadingProject === props.user.id + ":" + project.id} onClick={() => void props.onInspect(props.user.id, project)} /><Button danger type="text" title="Delete" icon={<Trash2 className="size-4" />} onClick={() => props.onDelete(props.user, project)} /></Space> },
    ]} />;
}

function Metric(props: { icon: React.ReactNode; label: string; value: number; detail?: string }) { return <div className="flex items-center gap-3 rounded-[22px] border border-white/70 bg-white/86 px-4 py-4 shadow-[0_12px_35px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-white/8"><div className="flex size-10 items-center justify-center rounded-full bg-black/[0.05] text-gray-600 dark:bg-white/10 dark:text-white/70 [&_svg]:size-4">{props.icon}</div><div><div className="text-xs text-gray-400">{props.label}</div><div className="text-xl font-semibold">{props.value}<span className="ml-2 text-xs font-normal text-gray-400">{props.detail}</span></div></div></div>; }
function formatDate(value: string) { if (!value) return "-"; const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false }); }
function formatBytes(value: number) { if (!value) return "0 B"; const units = ["B", "KB", "MB", "GB", "TB"]; const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1); return (value / 1024 ** index).toFixed(index ? 1 : 0) + " " + units[index]; }
function errorMessage(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }
