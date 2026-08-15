import { FileText, ImagePlus, Images, Maximize2, ServerCog, Video } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavigationTool = {
    slug: string;
    label: string;
    icon: LucideIcon;
};

/** 工作台侧边栏分组导航（对齐 VOZEB 工作台信息架构：创作 / 项目 / 资产）。 */
export const navigationGroups: ReadonlyArray<{ label: string; tools: ReadonlyArray<NavigationTool> }> = [
    {
        label: "创作",
        tools: [
            { slug: "image", label: "生图工作台", icon: ImagePlus },
            { slug: "video", label: "视频创作台", icon: Video },
            { slug: "comfyui", label: "ComfyUI", icon: ServerCog },
        ],
    },
    {
        label: "项目",
        tools: [{ slug: "canvas", label: "画布", icon: Maximize2 }],
    },
    {
        label: "资产",
        tools: [
            { slug: "assets", label: "素材", icon: Images },
            { slug: "prompts", label: "提示词", icon: FileText },
        ],
    },
];

export const navigationTools: ReadonlyArray<NavigationTool> = navigationGroups.flatMap((group) => group.tools);

export type NavigationToolSlug = NavigationTool["slug"];

export function findNavigationTool(pathname: string): NavigationTool | undefined {
    const slug = pathname.split("/").filter(Boolean)[0];
    return navigationTools.find((tool) => tool.slug === slug);
}
