"use client";

import { create } from "zustand";

import { resolvePanoramaDuration, type PanoramaCameraKeyframe } from "../utils/canvas-panorama-scene";

/**
 * 全景场景 studio 的瞬态状态（按 nodeId 键存一份）。
 * 只放编辑器在用的临时数据，不写入 CanvasProject（避免污染版本快照）。
 */
export type PanoramaMannequinState = {
    position: [number, number, number];
    color: string;
    posePresetId: string | null;
};

type PanoramaStudioState = {
    /** 与该 store 关联的画布节点 id */
    nodeId: string | null;
    keyframes: PanoramaCameraKeyframe[];
    duration: number;
    currentTime: number;
    playing: boolean;
    mannequin: PanoramaMannequinState;
    showMannequin: boolean;

    openForNode: (nodeId: string) => void;
    close: () => void;
    addKeyframeAtNow: () => void;
    removeKeyframe: (id: string) => void;
    scrubTo: (time: number) => void;
    setPlaying: (playing: boolean) => void;
    setMannequinPose: (posePresetId: string | null) => void;
    setMannequinColor: (color: string) => void;
    toggleMannequin: () => void;
};

let keyframeSeq = 0;

export const usePanoramaStore = create<PanoramaStudioState>((set) => ({
    nodeId: null,
    keyframes: [],
    duration: 6,
    currentTime: 0,
    playing: false,
    mannequin: { position: [0, 0, -1.2], color: "#4F8EF7", posePresetId: "stand" },
    showMannequin: true,

    openForNode: (nodeId) =>
        set((state) => {
            // 同一节点重开时保留已有关键帧；否则用一组默认关键帧起步
            const keyframes: PanoramaCameraKeyframe[] =
                state.nodeId === nodeId && state.keyframes.length > 0
                    ? state.keyframes
                    : [
                          { id: `kf-${++keyframeSeq}`, time: 0, snapshot: { fov: 50, position: [0, 1.6, 6] as [number, number, number], target: [0, 1.1, 0] as [number, number, number] } },
                          { id: `kf-${++keyframeSeq}`, time: 6, snapshot: { fov: 50, position: [0, 1.6, 2] as [number, number, number], target: [0, 1.1, 0] as [number, number, number] } },
                      ];
            return { nodeId, keyframes, duration: resolvePanoramaDuration(keyframes), currentTime: 0, playing: false };
        }),

    close: () => set({ nodeId: null, playing: false }),
    addKeyframeAtNow: () =>
        set((state) => {
            const time = Math.min(state.duration, Math.round(state.currentTime * 100) / 100);
            const snapshot = sampleAt(state.keyframes, state.currentTime);
            const keyframe: PanoramaCameraKeyframe = { id: `kf-${++keyframeSeq}`, time, snapshot };
            const keyframes = [...state.keyframes, keyframe].sort((x, y) => x.time - y.time);
            return { keyframes, duration: resolvePanoramaDuration(keyframes) };
        }),
    removeKeyframe: (id) =>
        set((state) => {
            const keyframes = state.keyframes.filter((frame) => frame.id !== id);
            return { keyframes, duration: resolvePanoramaDuration(keyframes) };
        }),
    scrubTo: (time) => set({ currentTime: Math.max(0, time) }),
    setPlaying: (playing) => set({ playing }),
    setMannequinPose: (posePresetId) => set((state) => ({ mannequin: { ...state.mannequin, posePresetId } })),
    setMannequinColor: (color) => set((state) => ({ mannequin: { ...state.mannequin, color } })),
    toggleMannequin: () => set((state) => ({ showMannequin: !state.showMannequin })),
}));

function sampleAt(keyframes: PanoramaCameraKeyframe[], time: number) {
    // 见 utils/canvas-panorama-scene.samplePanoramaCameraPath（此处内联避免循环依赖）
    if (keyframes.length === 0) return { fov: 50, position: [0, 1.6, 6] as [number, number, number], target: [0, 1.1, 0] as [number, number, number] };
    const sorted = [...keyframes].sort((a, b) => a.time - b.time);
    if (sorted.length === 1) return sorted[0].snapshot;
    const t = Math.max(0, Math.min(sorted[sorted.length - 1].time, time));
    for (let i = 0; i < sorted.length - 1; i += 1) {
        const current = sorted[i];
        const next = sorted[i + 1];
        if (t <= next.time) {
            const span = next.time - current.time;
            const ratio = span <= 0 ? 0 : (t - current.time) / span;
            return lerp(current.snapshot, next.snapshot, ratio);
        }
    }
    return sorted[sorted.length - 1].snapshot;
}

function lerp(a: PanoramaCameraKeyframe["snapshot"], b: PanoramaCameraKeyframe["snapshot"], t: number): PanoramaCameraKeyframe["snapshot"] {
    const clamp = Math.max(0, Math.min(1, t));
    return {
        fov: a.fov + (b.fov - a.fov) * clamp,
        position: [a.position[0] + (b.position[0] - a.position[0]) * clamp, a.position[1] + (b.position[1] - a.position[1]) * clamp, a.position[2] + (b.position[2] - a.position[2]) * clamp] as [number, number, number],
        target: [a.target[0] + (b.target[0] - a.target[0]) * clamp, a.target[1] + (b.target[1] - a.target[1]) * clamp, a.target[2] + (b.target[2] - a.target[2]) * clamp] as [number, number, number],
    };
}
