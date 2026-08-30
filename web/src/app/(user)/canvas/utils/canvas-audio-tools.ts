export type AudioEditOptions = {
    start: number;
    end: number;
    rate: number;
};

export const AUDIO_EDIT_MIN_DURATION_SECONDS = 0.05;
export const AUDIO_EDIT_MIN_RATE = 0.25;
export const AUDIO_EDIT_MAX_RATE = 4;

/** 校验并夹取音频裁剪区间；返回 null 表示区间无效。 */
export function normalizeAudioEditRange(start: number, end: number, durationSeconds: number): { start: number; end: number } | null {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= AUDIO_EDIT_MIN_DURATION_SECONDS) return null;
    const low = Math.min(start, end);
    const high = Math.max(start, end);
    const safeStart = clamp(low, 0, Math.max(0, durationSeconds - AUDIO_EDIT_MIN_DURATION_SECONDS));
    const safeEnd = clamp(high, safeStart + AUDIO_EDIT_MIN_DURATION_SECONDS, durationSeconds);
    const roundedStart = round(safeStart);
    const roundedEnd = round(safeEnd);
    if (roundedEnd - roundedStart <= AUDIO_EDIT_MIN_DURATION_SECONDS) return null;
    return { start: roundedStart, end: roundedEnd };
}

export function audioEditRate(rate: number) {
    if (!Number.isFinite(rate)) return 1;
    return round(Math.max(AUDIO_EDIT_MIN_RATE, Math.min(AUDIO_EDIT_MAX_RATE, rate)));
}

export function audioEditOutputDuration(start: number, end: number, rate: number) {
    const range = normalizeAudioEditRange(start, end, Math.max(end, 1));
    if (!range) return 0;
    return Math.max(0, round((range.end - range.start) / audioEditRate(rate)));
}

/** 在浏览器中裁剪/变速音频并导出 WAV。仅消耗本地算力，不调用外部模型。 */
export async function editAudioFile(src: string, options: AudioEditOptions): Promise<Blob> {
    if (typeof AudioContext === "undefined") throw new Error("当前浏览器不支持音频处理编辑");
    const response = await fetch(src);
    if (!response.ok) throw new Error("音频读取失败");
    const arrayBuffer = await response.arrayBuffer();
    const context = new AudioContext();
    try {
        const buffer = await context.decodeAudioData(arrayBuffer);
        const range = normalizeAudioEditRange(options.start, options.end, buffer.duration);
        const rate = audioEditRate(options.rate);
        if (!range) throw new Error("音频区间无效");
        const outputDuration = (range.end - range.start) / rate;
        const length = Math.max(1, Math.round(outputDuration * buffer.sampleRate));
        const offline = new OfflineAudioContext(buffer.numberOfChannels, length, buffer.sampleRate);
        const source = offline.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = rate;
        source.connect(offline.destination);
        source.start(0, range.start, range.end - range.start);
        const rendered = await offline.startRendering();
        return audioBufferToWav(rendered);
    } finally {
        void context.close();
    }
}

/** 从视频/音频媒体文件解码首个可读音轨并导出 WAV；本地处理，不调用外部模型。 */
export async function extractAudioFile(src: string): Promise<Blob> {
    if (typeof AudioContext === "undefined") throw new Error("当前浏览器不支持音频提取");
    const context = new AudioContext();
    try {
        const response = await fetch(src);
        if (!response.ok) throw new Error("媒体读取失败");
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        return audioBufferToWav(buffer);
    } finally {
        void context.close();
    }
}

export function audioBufferToWav(buffer: AudioBuffer): Blob {
    const channels = Math.min(2, Math.max(1, buffer.numberOfChannels));
    const sampleRate = buffer.sampleRate;
    const frames = buffer.length;
    const bytesPerSample = 2;
    const blockAlign = channels * bytesPerSample;
    const dataSize = frames * blockAlign;
    const output = new ArrayBuffer(44 + dataSize);
    const view = new DataView(output);
    writeAscii(view, 0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeAscii(view, 8, "WAVE");
    writeAscii(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeAscii(view, 36, "data");
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let frame = 0; frame < frames; frame += 1) {
        for (let channel = 0; channel < channels; channel += 1) {
            const sample = buffer.getChannelData(channel)[frame] ?? 0;
            const value = Math.max(-1, Math.min(1, sample));
            view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
            offset += bytesPerSample;
        }
    }
    return new Blob([output], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, text: string) {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function round(value: number) {
    return Math.max(0, Math.round(value * 100) / 100);
}
