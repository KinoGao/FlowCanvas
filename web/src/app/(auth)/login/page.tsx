"use client";

import { App, Button, Input } from "antd";
import { ArrowRight, Lock, User } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { loginUser } from "@/services/api/auth";
import { useUserStore } from "@/stores/use-user-store";
import { AuthSplitCard } from "../auth-split-card";

export default function LoginPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const user = useUserStore((state) => state.user);
    const token = useUserStore((state) => state.token);
    const setSession = useUserStore((state) => state.setSession);
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    if (user && token) return <Navigate to="/" replace />;

    const submit = async () => {
        if (!username.trim() || !password) {
            message.warning("请输入用户名和密码");
            return;
        }
        setLoading(true);
        try {
            const session = await loginUser({ username: username.trim(), password });
            setSession(session.user, session.token);
            message.success(`欢迎回来，${session.user.displayName || session.user.username}`);
            navigate("/", { replace: true });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "登录失败");
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthSplitCard
            eyebrow="欢迎回来"
            title="登录 FlowCanvas"
            subtitle="继续你的画布、图片与视频创作。"
            footer={
                <>
                    还没有账号？{" "}
                    <Link to="/register" className="font-medium text-foreground hover:underline">
                        立即注册
                    </Link>
                </>
            }
        >
            <form
                className="space-y-5"
                onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                }}
            >
                <label className="block">
                    <span className="mb-1.5 block text-sm">用户名</span>
                    <Input size="large" autoComplete="username" prefix={<User className="size-4 text-stone-400" />} placeholder="输入用户名" value={username} onChange={(event) => setUsername(event.target.value)} />
                </label>
                <label className="block">
                    <span className="mb-1.5 block text-sm">密码</span>
                    <Input.Password size="large" autoComplete="current-password" prefix={<Lock className="size-4 text-stone-400" />} placeholder="请输入密码" value={password} onChange={(event) => setPassword(event.target.value)} />
                </label>
                <Button type="primary" size="large" block htmlType="submit" loading={loading} icon={<ArrowRight className="size-4" />} iconPlacement="end">
                    登录并继续
                </Button>
            </form>
        </AuthSplitCard>
    );
}
