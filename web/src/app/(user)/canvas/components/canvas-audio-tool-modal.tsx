"use client";

import { useEffect, useState } from "react";
import { Button, InputNumber, Modal, Slider, theme as antdTheme } from "antd";

import { audioEditOutputDuration, normalizeAudioEditRange, type AudioEditOptions } from "../utils/canvas-audio-tools";

export type CanvasAudioToolModalProps = {
    open: boolean;
    src: string;
    onClose: () => void;
    onConfirm: (options: AudioEditOptions) => void;
    busy?: boolean;
};

export function CanvasAudioToolModal({ open, src, onClose, onConfirm, busy = false }: CanvasAudioToolModalProps) {
    const { token } = antdTheme.useToken();
    const [duration, setDuration] = useState(0);
    const [range, setRange] = useState<[number, number]>([0, 0]);
    const [rate, setRate] = useState(1);
    const [loadError, setLoadError] = useState("");

    useEffect(() => {
        if (!open || !src) return;
        setDuration(0);
        setRange([0, 0]);
        setRate(1);
        setLoadError("");
        const audio = document.createElement("audio");
        audio.preload = "metadata";
        audio.src = src;
        const done = () => {
            const nextDuration = Number.isFinite(audio.duration) ? audio.duration : 0;
            setDuration(nextDuration);
            setRange([0, Math.max(0, nextDuration)]);
        };
        audio.addEventListener("loadedmetadata", done);
        audio.addEventListener("error", () => setLoadError("无法读取音频时长，请确认文件可播放"));
        return () => {
            audio.removeAttribute("src");
            audio.load();
        };
    }, [open, src]);

    const normalized = normalizeAudioEditRange(range[0], range[1], duration);
    const valid = Boolean(normalized) && Number.isFinite(rate) && rate >= 0.25 && rate <= 4;
    const outputSeconds = audioEditOutputDuration(range[0], range[1], rate);

    return (
        <Modal
            title="音频裁剪 / 变速"
            open={open}
            centered
            width={520}
            onCancel={onClose}
            destroyOnHidden
            styles={{ body: { background: token.colorBgElevated, color: token.colorText } }}
            footer={[
                <Button key="cancel" onClick={onClose}>取消</Button>,
                <Button key="confirm" type="primary" loading={busy} disabled={!valid} onClick={() => normalized && onConfirm({ ...normalized, rate })}>
                    生成新音频
                </Button>,
            ]}
        >
            <div className="space-y-5 pt-2">
                {loadError ? <div className="rounded-lg border border-red-400/50 px-3 py-2 text-xs text-red-400">{loadError}</div> : null}
                {duration > 0 ? (
                    <>
                        <div>
                            <div className="mb-2 flex items-center justify-between text-xs opacity-70">
                                <span>裁剪区间</span>
                                <span>{outputSeconds.toFixed(1)} 秒输出</span>
                            </div>
                            <Slider
                                range
                                min={0}
                                max={duration}
                                step={0.01}
                                value={range}
                                onChange={(value) => setRange(Array.isArray(value) ? [Number(value[0]), Number(value[1])] : range)}
                            />
                            <div className="flex justify-between text-[11px] tabular-nums opacity-55">
                                <span>入点 {range[0].toFixed(2)}s</span>
                                <span>出点 {range[1].toFixed(2)}s</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <span className="text-xs opacity-70">播放速度</span>
                            <InputNumber
                                min={0.25}
                                max={4}
                                step={0.05}
                                value={rate}
                                onChange={(value) => setRate(Number(value) || 1)}
                                addonAfter="×"
                            />
                        </div>
                    </>
                ) : (
                    <div className="py-6 text-center text-xs opacity-50">正在读取音频时长…</div>
                )}
            </div>
        </Modal>
    );
}
