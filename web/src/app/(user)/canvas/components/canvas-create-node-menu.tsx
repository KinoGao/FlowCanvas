"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
    Bug,
    CircleDot,
    Clapperboard,
    Clock3,
    Copy,
    FileText,
    Globe,
    Grid2x2,
    Image as ImageIcon,
    Layers3,
    MessageCircle,
    Mic,
    Music2,
    PackagePlus,
    PenTool,
    StickyNote,
    Type,
    Upload,
    UserRoundCog,
    Video,
    Workflow,
} from "lucide-react";

import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { useModelFeatureAvailable } from "@/hooks/use-model-feature-available";

export type CanvasCreateMenuAction =
    | "text"
    | "image"
    | "video"
    | "comfyui"
    | "videoComposition"
    | "director"
    | "panorama360"
    | "audio"
    | "script"
    | "materialLibrary"
    | "upload"
    | "generationHistory"
    | "annotation"
    | "commentNote"
    | "whiteboard"
    | "webpreview"
    | "collage"
    | "storyboard"
    | "personReplacement"
    | "videoReplication"
    | "voiceStudio"
    | "debug";

const MENU_WIDTH = 424;

/** 统一的「添加节点」菜单：右侧 dock +、双击空白、右键空白三个入口共用（对齐 TapNow）。position 为 client 坐标。 */
export function CanvasCreateNodeMenu({
    position,
    onAction,
    onClose,
}: {
    position: { x: number; y: number };
    onAction: (action: CanvasCreateMenuAction) => void;
    onClose: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const menuRef = useRef<HTMLDivElement>(null);
    const [menuPosition, setMenuPosition] = useState(position);

    const personReplace = useModelFeatureAvailable("person_replace");
    const videoReplicate = useModelFeatureAvailable("video_replicate");
    const voiceStudio = useModelFeatureAvailable("asr");
    const unavailableTip = "该模型未接入，请联系管理员（可在设置「模型接入/功能开关」临时开启）";
    const personReplaceAvailable = personReplace.available;
    const videoReplicateAvailable = videoReplicate.available;
    const voiceStudioAvailable = voiceStudio.available;
    const personReplaceUnavailableTip = personReplace.available ? undefined : unavailableTip;
    const videoReplicateUnavailableTip = videoReplicate.available ? undefined : unavailableTip;
    const voiceStudioUnavailableTip = voiceStudio.available ? undefined : unavailableTip;

    useLayoutEffect(() => {
        const element = menuRef.current;
        if (!element) return;
        let frame = 0;
        const updatePosition = () => {
            const padding = 8;
            const { width, height } = element.getBoundingClientRect();
            if (!width || !height) return;
            const nextPosition = {
                x: Math.min(Math.max(padding, position.x), Math.max(padding, window.innerWidth - width - padding)),
                y: Math.min(Math.max(padding, position.y), Math.max(padding, window.innerHeight - height - padding)),
            };
            setMenuPosition((current) => (current.x === nextPosition.x && current.y === nextPosition.y ? current : nextPosition));
        };
        const scheduleUpdate = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(updatePosition);
        };
        scheduleUpdate();
        const observer = new ResizeObserver(scheduleUpdate);
        observer.observe(element);
        window.addEventListener("resize", scheduleUpdate);
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            window.removeEventListener("resize", scheduleUpdate);
        };
    }, [position.x, position.y]);

    useEffect(() => {
        const close = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest(".ant-popover")) return;
            onClose();
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("pointerdown", close);
        window.addEventListener("keydown", closeOnEscape);
        return () => {
            window.removeEventListener("pointerdown", close);
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [onClose]);

    return (
        <div
            ref={menuRef}
            className="canvas-create-menu-enter creative-os-panel thin-scrollbar pointer-events-auto fixed z-[80] max-h-[calc(100vh-16px)] overflow-y-auto rounded-[8px] border p-2"
            style={{
                left: menuPosition.x,
                top: menuPosition.y,
                width: MENU_WIDTH,
                background: theme.ui.materialElevated,
                borderColor: theme.ui.hairline,
                color: theme.node.text,
                boxShadow: theme.ui.shadow,
            }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div className="flex items-center justify-between px-2 pb-2">
                <div className="text-xs font-medium opacity-70">添加节点</div>
                <div className="text-[10px] opacity-35">画布工具</div>
            </div>
            <div className="px-2 pb-1 pt-1 text-xs font-medium opacity-60">生成节点</div>
            <div className="grid grid-cols-2 gap-1">
            <CreateMenuOption theme={theme} icon={<ImageIcon className="size-4" />} label="图片" description="图片、海报、角色素材" onClick={() => onAction("image")} />
            <CreateMenuOption theme={theme} icon={<Video className="size-4" />} label="视频" description="短片、转场、动态镜头" onClick={() => onAction("video")} />
            <CreateMenuOption theme={theme} icon={<Music2 className="size-4" />} label="音频" description="配音、音效、音乐" onClick={() => onAction("audio")} />
            <CreateMenuOption theme={theme} icon={<Type className="size-4" />} label="文本" description="文案、脚本、提示词" onClick={() => onAction("text")} />
            </div>
            <div className="px-2 pb-1 pt-2 text-xs font-medium opacity-60">功能节点</div>
            <div className="grid grid-cols-2 gap-1">
            <CreateMenuOption theme={theme} icon={<FileText className="size-4" />} label="脚本" description="脚本、分镜与逐 beat 生成" onClick={() => onAction("script")} />
            <CreateMenuOption theme={theme} icon={<Workflow className="size-4" />} label="ComfyUI" description="连接自定义工作流" onClick={() => onAction("comfyui")} />
            <CreateMenuOption theme={theme} icon={<Clapperboard className="size-4" />} label="剪辑时间线" description="时间轴串联多段素材" tag="Beta" onClick={() => onAction("videoComposition")} />
            <CreateMenuOption theme={theme} icon={<Layers3 className="size-4" />} label="导演台" description="3D 场景、人物、机位" tag="NEW" onClick={() => onAction("director")} />
            <CreateMenuOption theme={theme} icon={<CircleDot className="size-4" />} label="360场景" description="全景画面与空间关系" tag="NEW" onClick={() => onAction("panorama360")} />
            <CreateMenuOption theme={theme} icon={<Layers3 className="size-4" />} label="故事板" description="电影感分镜成片网格" tag="NEW" onClick={() => onAction("storyboard")} />
            <CreateMenuOption theme={theme} icon={<PenTool className="size-4" />} label="白板" description="画图、标注、文字说明" tag="BETA" onClick={() => onAction("whiteboard")} />
            <CreateMenuOption theme={theme} icon={<Globe className="size-4" />} label="网页预览" description="输入网址并在画布内浏览" tag="BETA" onClick={() => onAction("webpreview")} />
            <CreateMenuOption theme={theme} icon={<StickyNote className="size-4" />} label="注释" description="画布便签、批注与灵感" onClick={() => onAction("annotation")} />
            <CreateMenuOption theme={theme} icon={<MessageCircle className="size-4" />} label="注释便签" description="引用文本并标记待解决/已解决" onClick={() => onAction("commentNote")} />
            <CreateMenuOption theme={theme} icon={<Grid2x2 className="size-4" />} label="拼图" description="图片排版与导出" tag="NEW" onClick={() => onAction("collage")} />
            <CreateMenuOption theme={theme} icon={<Bug className="size-4" />} label="调试节点" description="查看 Payload 与任务状态" onClick={() => onAction("debug")} />
            <CreateMenuOption theme={theme} icon={<UserRoundCog className="size-4" />} label="人物替换" description="角色/人脸替换工作室" tag="Beta" disabled={!personReplaceAvailable} onClick={() => onAction("personReplacement")} tooltip={personReplaceUnavailableTip} />
            <CreateMenuOption theme={theme} icon={<Copy className="size-4" />} label="视频复刻" description="参考视频的生成复刻" tag="Beta" disabled={!videoReplicateAvailable} onClick={() => onAction("videoReplication")} tooltip={videoReplicateUnavailableTip} />
            <CreateMenuOption theme={theme} icon={<Mic className="size-4" />} label="语音工作台" description="语音识别与声音克隆" tag="Beta" disabled={!voiceStudioAvailable} onClick={() => onAction("voiceStudio")} tooltip={voiceStudioUnavailableTip} />
            <CreateMenuOption theme={theme} icon={<Layers3 className="size-4" />} label="3D 世界" description="空间创作能力即将开放" tag="Beta" disabled />
            </div>
            <div className="px-2 pb-1 pt-2 text-xs font-medium opacity-60">资源</div>
            <div className="grid grid-cols-2 gap-1">
            <CreateMenuOption theme={theme} icon={<Upload className="size-4" />} label="上传" description="图片、视频、音频与文件" onClick={() => onAction("upload")} />
            <CreateMenuOption theme={theme} icon={<PackagePlus className="size-4" />} label="素材库" description="素材、数字人与音色资产" tag="NEW" onClick={() => onAction("materialLibrary")} />
            <CreateMenuOption theme={theme} icon={<Clock3 className="size-4" />} label="从生成历史选择" description="回到已有生成结果" onClick={() => onAction("generationHistory")} />
            </div>
        </div>
    );
}

function CreateMenuOption({ theme, icon, label, description, tag, disabled = false, tooltip, onClick }: { theme: CanvasTheme; icon: ReactNode; label: string; description?: string; tag?: string; disabled?: boolean; tooltip?: string; onClick?: () => void }) {
    return (
        <button
            type="button"
            disabled={disabled}
            aria-disabled={disabled}
            title={tooltip}
            className="creative-os-menu-item flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: theme.node.text }}
            onMouseEnter={(event) => (event.currentTarget.style.background = theme.toolbar.itemHover)}
            onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
            onClick={() => onClick?.()}
        >
            <span className="grid size-7 shrink-0 place-items-center rounded-md" style={{ background: theme.toolbar.activeBg, color: theme.ui.accent }}>{icon}</span>
            <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{label}</span>
                {description ? <span className="mt-0.5 block truncate text-[10px] opacity-50">{description}</span> : null}
            </span>
            {tag ? <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold leading-3" style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}>{tag}</span> : null}
        </button>
    );
}
