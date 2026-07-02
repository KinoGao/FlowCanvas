import { create } from "zustand";

type DragOffset = { dx: number; dy: number };

type CanvasDragStore = {
    offset: DragOffset | null;
    draggedIds: Set<string> | null;
    startDrag: (ids: Set<string>) => void;
    updateOffset: (offset: DragOffset) => void;
    endDrag: () => void;
};

/** Ephemeral drag state — only dragged nodes/connections re-render via selectors. */
export const useCanvasDragStore = create<CanvasDragStore>((set) => ({
    offset: null,
    draggedIds: null,
    startDrag: (draggedIds) => set({ draggedIds, offset: { dx: 0, dy: 0 } }),
    updateOffset: (offset) => set({ offset }),
    endDrag: () => set({ offset: null, draggedIds: null }),
}));