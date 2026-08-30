"use client";

import React, { useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { ChevronLeft, Clapperboard, Pause, Play, Plus, Trash2 } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { PrimitiveMannequin } from "../../director/storyai/editor/runtime/PrimitiveMannequin";
import { MANNEQUIN_POSE_PRESETS } from "../../director/storyai/editor/presets/mannequinPosePresets";
import type { CharacterRigState } from "../../director/storyai/editor/schema/directorProject";
import { samplePanoramaCameraPath } from "../../utils/canvas-panorama-scene";
import { usePanoramaStore } from "../../stores/use-panorama-store";
import type { CanvasNodeData } from "../../types";

type PanoramaStudioProps = {
    node: CanvasNodeData;
    onClose: () => void;
};

export function PanoramaStudio({ node, onClose }: PanoramaStudioProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { keyframes, duration, currentTime, playing, mannequin, showMannequin, addKeyframeAtNow, removeKeyframe, scrubTo, setPlaying, setMannequinPose, setMannequinColor, toggleMannequin } = usePanoramaStore();
    const panoramaUrl = node.metadata?.storageKey || node.metadata?.content || "";

    return (
        <div className="fixed inset-0 z-[90] flex flex-col" style={{ background: theme.canvas.background, color: theme.node.text }} data-canvas-no-zoom>
            {/* 顶部栏 */}
            <div className="flex h-11 shrink-0 items-center gap-3 border-b px-3" style={{ borderColor: theme.ui.hairline, background: theme.ui.materialElevated }}>
                <button type="button" className="flex items-center gap-1 rounded-md px-2 py-1 text-sm" onClick={onClose}>
                    <ChevronLeft className="size-4" /> 回到画布
                </button>
                <div className="flex items-center gap-2 text-sm font-medium">
                    <Clapperboard className="size-4 opacity-70" /> 全景场景
                    <span className="text-[11px] opacity-50">{node.title}</span>
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                    <span className="text-[11px] opacity-60">{keyframes.length} 个关键帧</span>
                    <button type="button" className="rounded-md px-2 py-1 text-xs" style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }} onClick={addKeyframeAtNow}>
                        <span className="inline-flex items-center gap-1"><Plus className="size-3.5" /> 当前视角设关键帧</span>
                    </button>
                </div>
            </div>

            {/* 主体 */}
            <div className="relative min-h-0 flex-1">
                <Canvas
                    camera={{ fov: 50, position: [0, 1.6, 6], near: 0.1, far: 1000 }}
                    className="!absolute inset-0"
                >
                    <ambientLight intensity={0.6} />
                    <directionalLight position={[4, 6, 4]} intensity={0.8} />
                    {panoramaUrl ? <PanoramaBackdrop url={panoramaUrl} /> : null}
                    {showMannequin ? (
                        <group position={mannequin.position}>
                            <PrimitiveMannequin color={mannequin.color} rigState={rigStateForPose(mannequin.posePresetId)} />
                        </group>
                    ) : null}
                    <Grid args={[40, 40]} cellSize={1} sectionSize={5} fadeDistance={40} infiniteGrid position={[0, 0, 0]} />
                    <CameraRig />
                </Canvas>

                {/* 左下：时间线 */}
                <div
                    className="absolute bottom-3 left-3 right-3 flex items-center gap-3 rounded-xl border p-2.5"
                    style={{ background: `${theme.ui.materialElevated}f0`, borderColor: theme.ui.hairline, backdropFilter: "blur(8px)" }}
                >
                    <button
                        type="button"
                        className="grid size-8 shrink-0 place-items-center rounded-full"
                        style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}
                        onClick={() => setPlaying(!playing)}
                    >
                        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
                    </button>
                    <input
                        type="range"
                        min={0}
                        max={duration}
                        step={0.01}
                        value={currentTime}
                        aria-label="时间线"
                        className="min-w-0 flex-1"
                        onChange={(event) => {
                            setPlaying(false);
                            scrubTo(Number(event.target.value));
                        }}
                    />
                    <span className="shrink-0 text-[11px] tabular-nums opacity-70">
                        {currentTime.toFixed(1)}s / {duration}s
                    </span>
                    {keyframes.map((frame) => (
                        <span key={frame.id} className="group flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px]" style={{ background: theme.toolbar.itemHover }}>
                            <span className="tabular-nums opacity-80">{frame.time.toFixed(1)}s</span>
                            <button type="button" className="opacity-60 hover:opacity-100" onClick={() => removeKeyframe(frame.id)} title="删除关键帧">
                                <Trash2 className="size-3" />
                            </button>
                        </span>
                    ))}
                </div>

                {/* 右上：人偶姿态 */}
                <div
                    className="absolute right-3 top-3 w-44 rounded-xl border p-2"
                    style={{ background: `${theme.ui.materialElevated}f0`, borderColor: theme.ui.hairline, backdropFilter: "blur(8px)" }}
                >
                    <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[11px] font-medium opacity-70">人偶</span>
                        <button type="button" className="text-[11px] opacity-60 hover:opacity-100" onClick={toggleMannequin}>{showMannequin ? "隐藏" : "显示"}</button>
                    </div>
                    <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
                        {MANNEQUIN_POSE_PRESETS.map((preset) => (
                            <button
                                key={preset.id}
                                type="button"
                                className="rounded-md px-1.5 py-1 text-[11px]"
                                style={{ background: mannequin.posePresetId === preset.id ? theme.toolbar.activeBg : theme.toolbar.itemHover, color: mannequin.posePresetId === preset.id ? theme.toolbar.activeText : theme.node.text }}
                                onClick={() => setMannequinPose(mannequin.posePresetId === preset.id ? null : preset.id)}
                            >
                                {preset.label}
                            </button>
                        ))}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                        <span className="text-[11px] opacity-60">颜色</span>
                        <input type="color" value={mannequin.color} aria-label="人偶颜色" onChange={(event) => setMannequinColor(event.target.value)} className="h-5 w-7 cursor-pointer border-0 bg-transparent p-0" />
                    </div>
                </div>
            </div>
        </div>
    );
}

/** 相机时间轴控制器：播放时按当前时间采样关键帧路径并驱动相机。 */
function CameraRig() {
    const keyframes = usePanoramaStore((state) => state.keyframes);
    const duration = usePanoramaStore((state) => state.duration);
    const playing = usePanoramaStore((state) => state.playing);
    const currentTime = usePanoramaStore((state) => state.currentTime);
    const scrubTo = usePanoramaStore((state) => state.scrubTo);
    const setPlaying = usePanoramaStore((state) => state.setPlaying);
    const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
    const controlsRef = useRef<OrbitControlsImpl | null>(null);

    const applySnapshot = (time: number) => {
        const snapshot = samplePanoramaCameraPath(keyframes, time);
        camera.position.set(...snapshot.position);
        camera.fov = snapshot.fov;
        camera.updateProjectionMatrix();
        if (controlsRef.current) controlsRef.current.target.set(...snapshot.target);
    };

    // 非播放态：寻点到关键帧时也同步相机（例如拖动滑块）
    useEffect(() => {
        if (!playing) applySnapshot(currentTime);
    }, [currentTime, playing, keyframes]);

    // 播放态：rAF 推进时间
    useEffect(() => {
        if (!playing) return;
        let frame = 0;
        let last = performance.now();
        const tick = (now: number) => {
            const dt = (now - last) / 1000;
            last = now;
            const next = usePanoramaStore.getState().currentTime + dt;
            if (next >= duration) {
                setPlaying(false);
                scrubTo(duration);
                applySnapshot(duration);
                return;
            }
            scrubTo(next);
            applySnapshot(next);
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [playing, duration, keyframes, scrubTo, setPlaying]);

    return <OrbitControls ref={controlsRef} makeDefault enableDamping />;
}

/** 将人偶姿态 id 映射为 ProceduralMannequin 期望的 rigState。 */
function rigStateForPose(posePresetId: string | null): CharacterRigState {
    const preset = MANNEQUIN_POSE_PRESETS.find((item) => item.id === posePresetId);
    return { rigType: "mannequin", posePresetId: posePresetId || null, controls: preset?.controls ?? {} };
}

/** 把全景图作为等距柱状背景球。 */
function PanoramaBackdrop({ url }: { url: string }) {
    const [texture, setTexture] = useState<THREE.Texture | null>(null);
    useEffect(() => {
        let cancelled = false;
        const loader = new THREE.TextureLoader();
        loader.load(url, (loaded) => {
            if (cancelled) return;
            loaded.colorSpace = THREE.SRGBColorSpace;
            setTexture(loaded);
        }, undefined, () => {
            if (!cancelled) setTexture(null);
        });
        return () => {
            cancelled = true;
        };
    }, [url]);

    if (!texture) return null;
    return (
        <mesh>
            <sphereGeometry args={[80, 60, 40]} />
            <meshBasicMaterial map={texture} side={THREE.BackSide} />
        </mesh>
    );
}
