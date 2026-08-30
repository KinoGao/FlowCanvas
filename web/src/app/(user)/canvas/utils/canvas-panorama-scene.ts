/**
 * 全景场景 studio 的纯逻辑：相机关键帧插值 / 时间轴路径构建。
 * 独立于 three.js 与 React，便于单测。
 */

export type PanoramaCameraSnapshot = {
    fov: number;
    position: [number, number, number];
    target: [number, number, number];
};

export type PanoramaCameraKeyframe = {
    id: string;
    /** 关键帧在时间轴上的位置（0..duration 秒） */
    time: number;
    snapshot: PanoramaCameraSnapshot;
};

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function lerpTuple(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** 在两个时刻的快照之间线性插值。t=0 返回 a，t=1 返回 b。 */
export function lerpPanoramaCameraSnapshot(a: PanoramaCameraSnapshot, b: PanoramaCameraSnapshot, t: number): PanoramaCameraSnapshot {
    const clamped = Math.max(0, Math.min(1, t));
    return {
        fov: lerp(a.fov, b.fov, clamped),
        position: lerpTuple(a.position, b.position, clamped),
        target: lerpTuple(a.target, b.target, clamped),
    };
}

/** 在某一时刻对有序关键帧路径求快照（线性插值；少于 2 帧时返回首帧/最近帧）。 */
export function samplePanoramaCameraPath(keyframes: PanoramaCameraKeyframe[], time: number): PanoramaCameraSnapshot {
    if (keyframes.length === 0) {
        return { fov: 50, position: [0, 1.6, 6], target: [0, 1.1, 0] };
    }
    const sorted = [...keyframes].sort((a, b) => a.time - b.time);
    if (sorted.length === 1) return sorted[0].snapshot;

    const t = Math.max(0, Math.min(sorted[sorted.length - 1].time, time));
    for (let i = 0; i < sorted.length - 1; i += 1) {
        const current = sorted[i];
        const next = sorted[i + 1];
        if (t <= next.time) {
            const span = next.time - current.time;
            const ratio = span <= 0 ? 0 : (t - current.time) / span;
            return lerpPanoramaCameraSnapshot(current.snapshot, next.snapshot, ratio);
        }
    }
    return sorted[sorted.length - 1].snapshot;
}

/** 统一关键帧时长：由相邻关键帧最大间隔、或给定 duration 计算。 */
export function resolvePanoramaDuration(keyframes: PanoramaCameraKeyframe[]): number {
    if (keyframes.length < 2) return 6;
    const max = Math.max(...keyframes.map((frame) => frame.time));
    return Math.max(6, Math.ceil(max / 2) * 2);
}
