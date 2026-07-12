"use client";

import type { ViewportTransform } from "../types";

export type LeaferViewport = ViewportTransform;

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
    const minZoom = 0.05;
    const maxZoom = 5;
    const k = Math.max(minZoom, Math.min(maxZoom, viewport.k));
    return {
        x: Number.isFinite(viewport.x) ? viewport.x : 0,
        y: Number.isFinite(viewport.y) ? viewport.y : 0,
        k,
    };
}

export function viewportToCssTransform(viewport: LeaferViewport): string {
    return `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})`;
}

export const VIEWPORT_EPSILON = 0.001;

export function sameViewport(a: LeaferViewport, b: LeaferViewport): boolean {
    return Math.abs(a.x - b.x) < VIEWPORT_EPSILON && Math.abs(a.y - b.y) < VIEWPORT_EPSILON && Math.abs(a.k - b.k) < VIEWPORT_EPSILON;
}
