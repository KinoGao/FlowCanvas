"use client";

import React from "react";

/** A stable ref object whose `.current` is always the latest canvas scale.
 *  Reading it never triggers a React re-render. */
export const CanvasScaleCtx =
    React.createContext<React.RefObject<number>>({ current: 1 });

export function useCanvasScale(): number {
    return React.useContext(CanvasScaleCtx).current;
}
