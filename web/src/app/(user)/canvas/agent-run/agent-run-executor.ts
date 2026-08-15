import type { CanvasNodeData } from "../types";
import type { CanvasAgentOp } from "../utils/canvas-agent-ops";
import type { AgentRun, AgentRunTask } from "./agent-run-types";

const RUN_CONCURRENCY = 2;
const POLL_INTERVAL_MS = 1200;

export type AgentRunExecutorDeps = {
    /** 读取最新画布节点（用于跟踪任务节点状态） */
    getNodes: () => CanvasNodeData[];
    /** 派发 ops（run_generation 走页面既有生成管线） */
    applyOps: (ops: CanvasAgentOp[]) => Promise<unknown> | unknown;
    /** run 状态变化回调（UI 更新 + 后端持久化） */
    onRunChange: (run: AgentRun) => void;
};

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Agent Run 执行器：按依赖拓扑派发任务节点生成（并发 2），轮询节点状态回填任务状态。
 * 暂停只停止派发新任务（进行中的生成继续）；取消标记未完成任务；失败任务可单独重试。
 * 页面关闭后执行中断：run 已持久化，重新打开时由面板侧对账恢复（进行中的任务标回 ready）。
 */
export class AgentRunExecutor {
    private run: AgentRun;
    private deps: AgentRunExecutorDeps;
    private pauseRequested = false;
    private cancelRequested = false;
    private looping = false;

    constructor(run: AgentRun, deps: AgentRunExecutorDeps) {
        this.run = run;
        this.deps = deps;
    }

    get current(): AgentRun {
        return this.run;
    }

    private commit(patch: Partial<AgentRun>) {
        this.run = { ...this.run, ...patch, updatedAt: Date.now() };
        this.deps.onRunChange(this.run);
    }

    private commitTasks(tasks: AgentRunTask[], patch?: Partial<AgentRun>) {
        this.commit({ ...patch, tasks });
    }

    private patchTask(taskId: string, patch: Partial<AgentRunTask>) {
        this.commitTasks(this.run.tasks.map((task) => (task.id === taskId ? { ...task, ...patch } : task)));
    }

    /** 从画布节点状态同步任务状态（生成完成/失败回填）。 */
    private syncFromNodes() {
        const nodes = this.deps.getNodes();
        const statusByNodeId = new Map(nodes.map((node) => [node.id, node.metadata?.status]));
        const errorByNodeId = new Map(nodes.map((node) => [node.id, node.metadata?.errorDetails]));
        let changed = false;
        const tasks = this.run.tasks.map((task) => {
            if (task.status !== "running") return task;
            const nodeStatus = statusByNodeId.get(task.nodeId);
            if (nodeStatus === "success") {
                changed = true;
                return { ...task, status: "completed" as const, error: undefined };
            }
            if (nodeStatus === "error") {
                changed = true;
                return { ...task, status: "failed" as const, error: errorByNodeId.get(task.nodeId) || "生成失败" };
            }
            return task;
        });
        if (changed) this.commitTasks(tasks);
    }

    pause() {
        this.pauseRequested = true;
        if (this.run.status === "running") this.commit({ status: "paused" });
    }

    resume() {
        if (this.run.status === "failed") {
            // 失败任务重新排队后继续
            this.commitTasks(this.run.tasks.map((task) => (task.status === "failed" ? { ...task, status: "ready" as const, error: undefined } : task)), { status: "paused" });
        }
        if (this.run.status !== "paused") return;
        this.pauseRequested = false;
        this.commit({ status: "running" });
        void this.loop();
    }

    cancel() {
        this.cancelRequested = true;
        this.commitTasks(this.run.tasks.map((task) => (task.status === "completed" ? task : { ...task, status: "cancelled" as const })), { status: "cancelled" });
    }

    retryTask(taskId: string) {
        const task = this.run.tasks.find((item) => item.id === taskId);
        if (!task || task.status !== "failed") return;
        this.patchTask(taskId, { status: "ready", error: undefined });
        if (this.run.status === "failed" || this.run.status === "paused" || this.run.status === "completed") {
            this.pauseRequested = false;
            this.commit({ status: "running" });
            void this.loop();
        }
    }

    /** 启动/继续执行循环（幂等：循环已在跑时不重复开）。 */
    start() {
        this.commit({ status: "running" });
        void this.loop();
    }

    private async loop() {
        if (this.looping) return;
        this.looping = true;
        try {
            while (!this.cancelRequested) {
                if (this.pauseRequested || this.run.status === "paused") {
                    await sleep(POLL_INTERVAL_MS);
                    continue;
                }
                this.syncFromNodes();
                const tasks = this.run.tasks;
                const completedIds = new Set(tasks.filter((task) => task.status === "completed").map((task) => task.id));
                const runningCount = tasks.filter((task) => task.status === "running").length;
                const ready = tasks.filter((task) => {
                    if (task.status !== "ready") return false;
                    const deliverable = this.run.plan?.deliverables.find((item) => item.id === task.id);
                    return (deliverable?.dependencies ?? []).every((dep) => completedIds.has(dep));
                });
                if (!ready.length && runningCount === 0) break;
                let dispatched = 0;
                for (const task of ready.slice(0, Math.max(0, RUN_CONCURRENCY - runningCount))) {
                    this.patchTask(task.id, { status: "running", attempts: task.attempts + 1 });
                    dispatched += 1;
                    void Promise.resolve(this.deps.applyOps([{ type: "run_generation", nodeId: task.nodeId }])).catch(() => this.patchTask(task.id, { status: "failed", error: "生成派发失败" }));
                }
                await sleep(dispatched ? 400 : POLL_INTERVAL_MS);
            }
        } finally {
            this.looping = false;
        }
        if (this.cancelRequested) return;
        this.syncFromNodes();
        const tasks = this.run.tasks;
        if (tasks.every((task) => task.status === "completed")) {
            this.commit({ status: "completed" });
        } else if (tasks.some((task) => task.status === "failed")) {
            // 有失败任务：run 标 failed，但已完成的任务保留，可逐个重试
            this.commit({ status: "failed" });
        } else if (!this.pauseRequested && this.run.status === "running") {
            this.commit({ status: tasks.some((task) => task.status === "cancelled") ? "cancelled" : "paused" });
        }
    }
}

/** 页面重新打开时的 run 对账：进行中的任务若节点已不在生成中，标回 ready 可继续执行。 */
export function reconcileAgentRun(run: AgentRun, nodes: CanvasNodeData[]): AgentRun {
    if (run.status !== "running" && run.status !== "paused") return run;
    const statusByNodeId = new Map(nodes.map((node) => [node.id, node.metadata?.status]));
    const tasks = run.tasks.map((task) => {
        if (task.status !== "running") return task;
        const nodeStatus = statusByNodeId.get(task.nodeId);
        if (nodeStatus === "success") return { ...task, status: "completed" as const };
        if (nodeStatus === "error") return { ...task, status: "failed" as const, error: "生成中断" };
        return { ...task, status: "ready" as const };
    });
    return { ...run, tasks, status: "paused", updatedAt: Date.now() };
}
