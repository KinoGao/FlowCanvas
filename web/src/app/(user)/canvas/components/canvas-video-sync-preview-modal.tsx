"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Modal, Slider } from "antd";
import { Pause, Play, RotateCcw } from "lucide-react";

export type SyncVideoSource = { id: string; title: string; src: string };

export function CanvasVideoSyncPreviewModal({
    open,
    sources,
    onClose,
}: {
    open: boolean;
    sources: SyncVideoSource[];
    onClose: () => void;
}) {
    const videoRefs = useRef(new Map<string, HTMLVideoElement>());
    const [playing, setPlaying] = useState(false);
    const [time, setTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const durationRef = useRef(0);

    useEffect(() => {
        if (!open) {
            setPlaying(false);
            setTime(0);
            setDuration(0);
            durationRef.current = 0;
            videoRefs.current.forEach((video) => video.pause());
        }
    }, [open]);

    useEffect(() => {
        durationRef.current = duration;
    }, [duration]);

    const playAll = () => {
        videoRefs.current.forEach((video) => void video.play().catch(() => {}));
        setPlaying(true);
    };
    const pauseAll = () => {
        videoRefs.current.forEach((video) => video.pause());
        setPlaying(false);
    };
    const seekAll = (nextTime: number) => {
        setTime(nextTime);
        videoRefs.current.forEach((video) => {
            if (Number.isFinite(video.duration)) video.currentTime = Math.min(nextTime, Math.max(0, video.duration - 0.01));
        });
    };

    return (
        <Modal title="多视频同步预览" open={open} onCancel={onClose} centered width={1100} footer={null} destroyOnHidden>
            <div className="mb-3 flex items-center gap-3">
                <Button icon={playing ? <Pause className="size-4" /> : <Play className="size-4" />} onClick={playing ? pauseAll : playAll}>
                    {playing ? "暂停" : "播放"}
                </Button>
                <Button icon={<RotateCcw className="size-4" />} onClick={() => seekAll(0)}>
                    重置
                </Button>
                <Slider className="min-w-0 flex-1" min={0} max={Math.max(duration, 0.01)} step={0.01} value={Math.min(time, Math.max(duration, 0.01))} onChange={(value) => seekAll(Number(value))} />
                <span className="shrink-0 text-xs tabular-nums opacity-60">{time.toFixed(1)}s</span>
            </div>
            <div className={`grid gap-3 ${sources.length > 1 ? "grid-cols-2" : "grid-cols-1"} max-h-[72vh] overflow-y-auto`}>
                {sources.map((source) => (
                    <div key={source.id} className="relative overflow-hidden rounded-xl border bg-black">
                        <video
                            ref={(element) => {
                                if (element) videoRefs.current.set(source.id, element);
                                else videoRefs.current.delete(source.id);
                            }}
                            src={source.src}
                            preload="metadata"
                            playsInline
                            className="aspect-video w-full object-contain"
                            onLoadedMetadata={(event) => {
                                const nextDuration = event.currentTarget.duration || 0;
                                if (nextDuration > durationRef.current) {
                                    durationRef.current = nextDuration;
                                    setDuration(nextDuration);
                                }
                            }}
                            onTimeUpdate={(event) => {
                                const nextTime = event.currentTarget.currentTime || 0;
                                if (Math.abs(nextTime - time) > 0.01) setTime(nextTime);
                            }}
                            onEnded={() => {
                                if (playing) pauseAll();
                            }}
                        />
                        <span className="absolute left-2 top-2 max-w-[calc(100%-16px)] truncate rounded-md bg-black/60 px-2 py-1 text-[11px] text-white/80">{source.title}</span>
                    </div>
                ))}
            </div>
        </Modal>
    );
}
