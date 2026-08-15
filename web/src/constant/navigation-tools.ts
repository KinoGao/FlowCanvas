import { FileText, Images, Maximize2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavigationTool = {
    slug: string;
    label: string;
    icon: LucideIcon;
};

/** 工作台侧边栏分组导航（对齐 VOZEB 工作台信息架构）。生图/视频/ComfyUI 能力由画布节点承载，不单列页面。 */
export const navigationGroups: ReadonlyArray<{ label: string; tools: ReadonlyArray<NavigationTool> }> = [
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
