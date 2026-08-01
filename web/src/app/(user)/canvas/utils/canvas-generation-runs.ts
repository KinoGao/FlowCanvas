import type { CanvasGenerationRun, CanvasGenerationRunStatus, CanvasNodeMetadata } from "../types";

const MAX_GENERATION_RUNS = 6;

export function upsertCanvasGenerationRun(
    runs: CanvasGenerationRun[] | undefined,
    next: CanvasGenerationRun,
): CanvasGenerationRun[] {
    const existing = runs?.find((run) => run.id === next.id);
    const merged = existing ? { ...existing, ...next, startedAt: existing.startedAt } : next;
    return [merged, ...(runs || []).filter((run) => run.id !== next.id)].slice(0, MAX_GENERATION_RUNS);
}
export function updateCanvasGenerationRun(
    metadata: CanvasNodeMetadata | undefined,
    id: string,
    status: CanvasGenerationRunStatus,
    updatedAt = Date.now(),
    errorDetails?: string,
): CanvasNodeMetadata {
    const runs = metadata?.generationRuns || [];
    const current = runs.find((run) => run.id === id);
    if (!current || current.status !== "running") return metadata || {};
    return {
        ...metadata,
        generationRuns: upsertCanvasGenerationRun(runs, {
            ...current,
            status,
            updatedAt,
            ...(errorDetails ? { errorDetails } : { errorDetails: undefined }),
        }),
    };
}
