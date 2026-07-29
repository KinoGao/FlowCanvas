"use client";

import type { ViewportTransform } from "../types";

export type LeaferViewport = ViewportTransform;

export const MIN_CANVAS_ZOOM = 0.2;
export const MAX_CANVAS_ZOOM = 1.25;
const CANVAS_ZOOM_STEP_FACTOR = 1.2;

export function clampCanvasZoom(scale: number): number {
    const finiteScale = Number.isFinite(scale) ? scale : 1;
    return Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, finiteScale));
}

export function stepCanvasZoom(scale: number, direction: "in" | "out"): number {
    const current = clampCanvasZoom(scale);
    return clampCanvasZoom(direction === "in" ? current * CANVAS_ZOOM_STEP_FACTOR : current / CANVAS_ZOOM_STEP_FACTOR);
}

export function screenToCanvas(clientX: number, clientY: number, containerRect: DOMRect, viewport: LeaferViewport): { x: number; y: number } {
    return {
        x: (clientX - containerRect.left - viewport.x) / viewport.k,
        y: (clientY - containerRect.top - viewport.y) / viewport.k,
    };
}

export function canvasToScreen(canvasX: number, canvasY: number, viewport: LeaferViewport): { x: number; y: number } {
    return {
        x: canvasX * viewport.k + viewport.x,
        y: canvasY * viewport.k + viewport.y,
    };
}

export function clampViewport(viewport: LeaferViewport, _containerWidth: number, _containerHeight: number): LeaferViewport {
    return {
        x: Number.isFinite(viewport.x) ? viewport.x : 0,
        y: Number.isFinite(viewport.y) ? viewport.y : 0,
        k: clampCanvasZoom(viewport.k),
    };
}

export function viewportToCssTransform(viewport: LeaferViewport): string {
    return `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})`;
}

export const VIEWPORT_EPSILON = 0.001;

export function sameViewport(a: LeaferViewport, b: LeaferViewport): boolean {
    return Math.abs(a.x - b.x) < VIEWPORT_EPSILON && Math.abs(a.y - b.y) < VIEWPORT_EPSILON && Math.abs(a.k - b.k) < VIEWPORT_EPSILON;
}
