import type { GridConfig, GridRect, Pointer, ResizeDirection } from "../types/designer";

export const MIN_SIZE = 1;

export function getGridStepX(grid: GridConfig): number {
  return grid.cellWidth + grid.gap;
}

export function getGridStepY(grid: GridConfig): number {
  return grid.cellHeight + grid.gap;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function spanToPxX(span: number, grid: GridConfig): number {
  return span * grid.cellWidth + Math.max(0, span - 1) * grid.gap;
}

export function spanToPxY(span: number, grid: GridConfig): number {
  return span * grid.cellHeight + Math.max(0, span - 1) * grid.gap;
}

export function calcCellSizeFromCanvas(
  rows: number,
  cols: number,
  canvasWidth: number,
  canvasHeight: number,
  gap: number
): { cellWidth: number; cellHeight: number; gap: number } {
  const safeRows = Math.max(1, Math.floor(rows));
  const safeCols = Math.max(1, Math.floor(cols));
  const targetGap = Math.max(0, gap);
  const safeWidth = Math.max(1, canvasWidth);
  const safeHeight = Math.max(1, canvasHeight);
  const minCellSize = 1;

  const maxGapByWidth =
    safeCols > 1 ? Math.max(0, (safeWidth - safeCols * minCellSize) / (safeCols - 1)) : targetGap;
  const maxGapByHeight =
    safeRows > 1 ? Math.max(0, (safeHeight - safeRows * minCellSize) / (safeRows - 1)) : targetGap;
  const safeGap = Math.min(targetGap, maxGapByWidth, maxGapByHeight);

  const cellWidth = (safeWidth - (safeCols - 1) * safeGap) / safeCols;
  const cellHeight = (safeHeight - (safeRows - 1) * safeGap) / safeRows;

  return {
    cellWidth,
    cellHeight,
    gap: safeGap
  };
}

export function pointerToCell(
  pointer: Pointer,
  bounds: DOMRect,
  grid: GridConfig,
  interactionScale = 1
): { x: number; y: number; inside: boolean } {
  const stepX = getGridStepX(grid) * interactionScale;
  const stepY = getGridStepY(grid) * interactionScale;
  const relX = pointer.x - bounds.left;
  const relY = pointer.y - bounds.top;
  const x = Math.floor(relX / stepX);
  const y = Math.floor(relY / stepY);
  const inside = relX >= 0 && relY >= 0 && relX <= bounds.width && relY <= bounds.height;
  return { x, y, inside };
}

export function clampRectToGrid(
  rect: GridRect,
  grid: GridConfig,
  minW = MIN_SIZE,
  minH = MIN_SIZE
): GridRect {
  const w = clamp(rect.w, minW, grid.cols);
  const h = clamp(rect.h, minH, grid.rows);
  const x = clamp(rect.x, 0, grid.cols - w);
  const y = clamp(rect.y, 0, grid.rows - h);
  return { x, y, w, h };
}

export function moveRectFromDelta(
  startRect: GridRect,
  deltaXCells: number,
  deltaYCells: number,
  grid: GridConfig
): GridRect {
  return clampRectToGrid(
    {
      x: startRect.x + deltaXCells,
      y: startRect.y + deltaYCells,
      w: startRect.w,
      h: startRect.h
    },
    grid
  );
}

export function resizeRectFromDelta(
  startRect: GridRect,
  deltaXCells: number,
  deltaYCells: number,
  direction: ResizeDirection,
  grid: GridConfig,
  minW = MIN_SIZE,
  minH = MIN_SIZE
): GridRect {
  let { x, y, w, h } = startRect;

  if (direction.includes("e")) {
    w = startRect.w + deltaXCells;
  }
  if (direction.includes("s")) {
    h = startRect.h + deltaYCells;
  }
  if (direction.includes("w")) {
    x = startRect.x + deltaXCells;
    w = startRect.w - deltaXCells;
  }
  if (direction.includes("n")) {
    y = startRect.y + deltaYCells;
    h = startRect.h - deltaYCells;
  }

  if (w < minW) {
    if (direction.includes("w")) {
      x -= minW - w;
    }
    w = minW;
  }
  if (h < minH) {
    if (direction.includes("n")) {
      y -= minH - h;
    }
    h = minH;
  }

  return clampRectToGrid({ x, y, w, h }, grid, minW, minH);
}
