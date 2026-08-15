"use client";

import { Drawer } from "antd";
import { Link } from "react-router-dom";

import { navigationGroups, type NavigationToolSlug } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";

type MobileNavDrawerProps = {
    open: boolean;
    activeToolSlug?: NavigationToolSlug;
    onClose: () => void;
};

export function MobileNavDrawer({ open, activeToolSlug, onClose }: MobileNavDrawerProps) {
    return (
        <Drawer title="导航" placement="left" size={280} open={open} onClose={onClose} className="md:hidden">
            <div className="space-y-5">
                {navigationGroups.map((group) => (
                    <div key={group.label}>
                        <div className="px-3 pb-1.5 text-xs text-stone-400 dark:text-stone-500">{group.label}</div>
                        <div className="space-y-1">
                            {group.tools.map((tool) => {
                                const Icon = tool.icon;
                                const active = tool.slug === activeToolSlug;
                                return (
                                    <Link
                                        key={tool.slug}
                                        to={`/${tool.slug}`}
                                        onClick={onClose}
                                        className={cn(
                                            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-base transition",
                                            active ? "bg-stone-100 font-medium text-stone-950 dark:bg-stone-800 dark:text-stone-100" : "text-stone-600 hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100",
                                        )}
                                    >
                                        <Icon className="size-5" />
                                        <span>{tool.label}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </Drawer>
    );
}
