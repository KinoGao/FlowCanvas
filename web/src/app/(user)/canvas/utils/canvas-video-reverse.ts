import { pickTrimRecorderMimeType, loadVideoElement, releaseVideoElement, seekVideo } from "./canvas-video-tools";

/** 浏览器端视频倒放：从头到尾逐帧倒退重录，输出无声反向视频。不调用外部模型。 */
export async function reverseVideoFile(src: string, onProgress?: (progress: number) => void): Promise<Blob> {
    if (typeof MediaRecorder === "undefined") throw new Error("当前浏览器不支持视频倒放导出，请换用 Chrome / Edge");
    const mimeType = pickTrimRecorderMimeType((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) throw new Error("当前浏览器不支持视频倒放导出，请换用 Chrome / Edge");
    const video = await loadVideoElement(src);
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (duration <= 0.1) throw new Error("视频时长不足，无法倒放");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d", { alpha: false });
    const stream = canvas.captureStream(30);
    if (!context || !stream) {
        releaseVideoElement(video);
        throw new Error("当前浏览器不支持视频倒放导出");
    }
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
    };
    const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
    });
    const step = 1 / 30;
    try {
        drawFrame(context, canvas, video);
        recorder.start(250);
        let time = duration;
        while (time > 0) {
            time = Math.max(0, time - step);
            await seekVideo(video, time);
            drawFrame(context, canvas, video);
            onProgress?.(Math.min(1, 1 - time / duration));
            if (time === 0) break;
        }
        if (recorder.state !== "inactive") recorder.stop();
        await stopped;
        const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
        if (!blob.size) throw new Error("倒放导出结果为空");
        return blob;
    } finally {
        stream.getTracks().forEach((track) => track.stop());
        releaseVideoElement(video);
    }
}

function drawFrame(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, video: HTMLVideoElement) {
    context.fillStyle = "#000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
}
