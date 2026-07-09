import type { ReactNode } from "react";

import { AppProviders } from "@/components/layout/app-providers";
import "antd/dist/reset.css";
import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
    return <AppProviders>{children}</AppProviders>;
}
