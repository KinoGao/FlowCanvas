"use client";

import { App, Button, Input } from "antd";
import { ArrowRight, KeyRound, Lock, SmilePlus, User } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { registerUser } from "@/services/api/auth";
import { useUserStore } from "@/stores/use-user-store";
import { AuthSplitCard } from "../auth-split-card";

export default function RegisterPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const user = useUserStore((state) => state.user);
    const token = useUserStore((state) => state.token);
    const setSession = useUserStore((state) => state.setSession);
    const [username, setUsername] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [authCode, setAuthCode] = useState("");
    const [loading, setLoading] = useState(false);

    if (user && token) return <Navigate to="/" replace />;

    const submit = async () => {
        if (!username.trim() || !password) {
            message.warning("请输入用户名和密码");
            return;
        }
        if (password !== confirmPassword) {
            message.warning("两次输入的密码不一致");
            return;
        }
        setLoading(true);
        try {
            const session = await registerUser({ username: username.trim(), password, displayName: displayName.trim() || undefined, authCode: authCode.trim() });
            setSession(session.user, session.token);
            message.success("注册成功，已进入你的工作区");
            navigate("/", { replace: true });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "注册失败");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthSplitCard
            eyebrow="创建账号"
            title="注册 FlowCanvas"
            subtitle="一个账号保存你的画布、素材与生成记录。"
            footer={
                <>
                    已有账号？{" "}
                    <Link to="/login" className="font-medium text-foreground hover:underline">
                        直接登录
                    </Link>
                </>
            }
        >
            <form
                className="space-y-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                }}
            >
                <label className="block">
                    <span className="mb-1.5 block text-sm">用户名</span>
                    <Input size="large" autoComplete="username" prefix={<User className="size-4 text-stone-400" />} placeholder="用于登录的用户名" value={username} onChange={(event) => setUsername(event.target.value)} />
                </label>
                <label className="block">
                    <span className="mb-1.5 block text-sm">昵称（可选）</span>
                    <Input size="large" autoComplete="nickname" prefix={<SmilePlus className="size-4 text-stone-400" />} placeholder="对外显示的名称" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                        <span className="mb-1.5 block text-sm">密码</span>
                        <Input.Password size="large" autoComplete="new-password" prefix={<Lock className="size-4 text-stone-400" />} placeholder="设置密码" value={password} onChange={(event) => setPassword(event.target.value)} />
                    </label>
                    <label className="block">
                        <span className="mb-1.5 block text-sm">确认密码</span>
                        <Input.Password size="large" autoComplete="new-password" prefix={<Lock className="size-4 text-stone-400" />} placeholder="再次输入密码" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
                    </label>
                </div>
                <label className="block">
                    <span className="mb-1.5 block text-sm">注册鉴权码</span>
                    <Input.Password size="large" prefix={<KeyRound className="size-4 text-stone-400" />} placeholder="部署方提供的注册鉴权码" value={authCode} onChange={(event) => setAuthCode(event.target.value)} />
                </label>
                <Button type="primary" size="large" block htmlType="submit" loading={loading} icon={<ArrowRight className="size-4" />} iconPlacement="end">
                    注册并进入
                </Button>
            </form>
        </AuthSplitCard>
    );
}
