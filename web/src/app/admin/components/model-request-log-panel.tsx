import { App, Button, Input, Select, Space, Table, Tag, Tooltip } from "antd";
import { Activity, AlertCircle, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { AdminCard } from "./admin-card";
import { fetchModelRequestLogs, type ModelRequestLogEntry, type ModelRequestLogPage } from "@/services/api/platform-admin";

type Props = { authToken: string; modelOptions: string[] };

const PAGE_SIZE = 50;

function errorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

function formatDuration(ms: number) {
    if (ms < 1000) return `${ms} ms`;
    return `${(ms / 1000).toFixed(1)} s`;
}

function statusTag(statusCode: number) {
    if (statusCode === 0) return <Tag color="red">无响应</Tag>;
    if (statusCode >= 500) return <Tag color="red">{statusCode}</Tag>;
    if (statusCode >= 400) return <Tag color="orange">{statusCode}</Tag>;
    return <Tag color="green">{statusCode}</Tag>;
}

function kindLabel(kind: string | null) {
    if (kind === "create") return "创建";
    if (kind === "poll") return "轮询";
    if (kind === "content") return "下载";
    return kind || "-";
}

export function ModelRequestLogPanel(props: Props) {
    const { message } = App.useApp();
    const [logs, setLogs] = useState<ModelRequestLogPage | null>(null);
    const [loading, setLoading] = useState(false);
    const [modelId, setModelId] = useState("");
    const [onlyErrors, setOnlyErrors] = useState(false);
    const [page, setPage] = useState(0);

    const load = useCallback(async (nextPage = page, nextModel = modelId, nextErrors = onlyErrors) => {
        setLoading(true);
        try {
            setLogs(await fetchModelRequestLogs(props.authToken, { modelId: nextModel || undefined, onlyErrors: nextErrors, page: nextPage, size: PAGE_SIZE }));
        } catch (error) {
            message.error(errorMessage(error, "请求日志加载失败"));
        } finally {
            setLoading(false);
        }
    }, [props.authToken, page, modelId, onlyErrors, message]);

    useEffect(() => {
        void load(0, modelId, onlyErrors);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [props.authToken]);

    const refresh = () => void load();
    const search = () => {
        setPage(0);
        void load(0, modelId, onlyErrors);
    };

    const columns = [
        {
            title: "时间",
            dataIndex: "createdAt",
            width: 168,
            render: (value: string) => new Date(value).toLocaleString(),
        },
        {
            title: "模型",
            dataIndex: "modelId",
            width: 200,
            ellipsis: true,
            render: (value: string | null) => value || "-",
        },
        {
            title: "类型",
            dataIndex: "requestKind",
            width: 72,
            render: (value: string | null) => kindLabel(value),
        },
        {
            title: "请求",
            dataIndex: "method",
            width: 76,
            render: (value: string, record: ModelRequestLogEntry) => (
                <Tooltip title={record.path}><span>{value} {record.path}</span></Tooltip>
            ),
        },
        {
            title: "耗时",
            dataIndex: "durationMs",
            width: 96,
            sorter: (a: ModelRequestLogEntry, b: ModelRequestLogEntry) => a.durationMs - b.durationMs,
            render: (value: number, record: ModelRequestLogEntry) => (
                <span style={{ color: record.durationMs > 60_000 ? "#cf1322" : record.durationMs > 10_000 ? "#d46b08" : undefined }}>
                    {formatDuration(value)}
                </span>
            ),
        },
        {
            title: "状态",
            dataIndex: "statusCode",
            width: 84,
            render: (value: number) => statusTag(value),
        },
        {
            title: "错误信息",
            dataIndex: "errorMessage",
            ellipsis: true,
            render: (value: string | null) => value ? <Tooltip title={value}><span style={{ color: "#cf1322" }}>{value}</span></Tooltip> : "-",
        },
    ];

    return (
        <AdminCard
            title="模型请求日志"
            description="记录经模型代理发出的每一次上游请求（创建 / 轮询 / 下载），用于排查生成失败与超时；日志保留 7 天。"
            action={
                <Space wrap>
                    <Input
                        allowClear
                        placeholder="按模型 ID 筛选"
                        value={modelId}
                        onChange={(event) => setModelId(event.target.value)}
                        onPressEnter={search}
                        style={{ width: 200 }}
                        prefix={<Search className="size-3.5" />}
                    />
                    <Select
                        value={onlyErrors ? "errors" : "all"}
                        onChange={(value) => {
                            setOnlyErrors(value === "errors");
                            setPage(0);
                            void load(0, modelId, value === "errors");
                        }}
                        style={{ width: 120 }}
                        options={[
                            { value: "all", label: "全部请求" },
                            { value: "errors", label: "仅错误" },
                        ]}
                    />
                    <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={refresh}>刷新</Button>
                </Space>
            }
        >
            <Table<ModelRequestLogEntry>
                rowKey="id"
                size="small"
                loading={loading}
                columns={columns}
                dataSource={logs?.content || []}
                pagination={{
                    current: page + 1,
                    pageSize: PAGE_SIZE,
                    total: logs?.totalElements || 0,
                    showSizeChanger: false,
                    onChange: (next) => {
                        setPage(next - 1);
                        void load(next - 1, modelId, onlyErrors);
                    },
                }}
                locale={{ emptyText: <span className="inline-flex items-center gap-2 opacity-60"><Activity className="size-4" />暂无请求日志，生成一次图片 / 视频 / 文本后这里会出现记录</span> }}
            />
        </AdminCard>
    );
}
