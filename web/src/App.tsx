import { Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import UserLayout from "@/app/(user)/layout";
import IndexPage from "@/app/(user)/page";
import AssetsPage from "@/app/(user)/assets/page";
import CanvasLibraryPage from "@/app/(user)/canvas/page";
import CanvasPage from "@/app/(user)/canvas/[id]/canvas-client-page";
import ComfyUiPage from "@/app/(user)/comfyui/page";
import ImagePage from "@/app/(user)/image/page";
import PromptsPage from "@/app/(user)/prompts/page";
import VideoPage from "@/app/(user)/video/page";
import NotFound from "@/app/not-found";

function PageFallback() {
    return <div className="flex h-full items-center justify-center bg-background text-sm text-stone-500">正在加载...</div>;
}

export default function App() {
    return (
        <Suspense fallback={<PageFallback />}>
            <Routes>
                <Route element={<UserLayout />}>
                    <Route index element={<IndexPage />} />
                    <Route path="canvas" element={<CanvasLibraryPage />} />
                    <Route path="canvas/:id" element={<CanvasPage />} />
                    <Route path="image" element={<ImagePage />} />
                    <Route path="video" element={<VideoPage />} />
                    <Route path="assets" element={<AssetsPage />} />
                    <Route path="prompts" element={<PromptsPage />} />
                    <Route path="comfyui" element={<ComfyUiPage />} />
                    <Route path="canvas/:id/*" element={<Navigate to=".." replace />} />
                </Route>
                <Route path="*" element={<NotFound />} />
            </Routes>
        </Suspense>
    );
}
