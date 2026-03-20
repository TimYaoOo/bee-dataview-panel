import type { DesignerNode, GridConfig, GridRect } from "../types/designer";
import { calcCellSizeFromCanvas, spanToPxX, spanToPxY } from "../utils/grid";
import {
  type BeeDataViewSchema,
  type BeeLayerGroupSchema,
  type BeeNodeGridSchema,
  type BeeNodeSchema
} from "./types/schema";

type ExportOptions = {
  canvasWidth: number;
  canvasHeight: number;
  scalePercent: number;
  title?: string;
  layerGroups?: BeeLayerGroupSchema[];
};

type RestoreResult = {
  rootNode: DesignerNode;
  canvasConfig: {
    canvasWidth: number;
    canvasHeight: number;
    rows: number;
    cols: number;
    gap: number;
    scalePercent: number;
  };
};

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toNodeGrid(node: DesignerNode): BeeNodeGridSchema | undefined {
  if (!node.acceptsChildren) {
    return undefined;
  }
  return {
    rows: node.grid.rows,
    cols: node.grid.cols,
    gap: node.grid.gap
  };
}

function toNodeSchema(node: DesignerNode): BeeNodeSchema {
  const children = [...node.children]
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((child) => toNodeSchema(child));

  const nodeSchema: BeeNodeSchema = {
    id: node.id,
    name: node.name,
    rect: { ...node.rect },
    zIndex: node.zIndex,
    component: {},
    children
  };

  const grid = toNodeGrid(node);
  if (grid) {
    nodeSchema.grid = grid;
  }

  return nodeSchema;
}

function normalizeRect(rect: GridRect): GridRect {
  return {
    x: Math.max(0, Math.floor(rect.x || 0)),
    y: Math.max(0, Math.floor(rect.y || 0)),
    w: Math.max(1, Math.floor(rect.w || 1)),
    h: Math.max(1, Math.floor(rect.h || 1))
  };
}

function normalizeNodeGrid(grid: BeeNodeGridSchema | undefined): BeeNodeGridSchema | undefined {
  if (!grid) {
    return undefined;
  }
  return {
    rows: Math.max(1, Math.floor(grid.rows || 1)),
    cols: Math.max(1, Math.floor(grid.cols || 1)),
    gap: Math.max(0, Number(grid.gap ?? 1))
  };
}

function buildChildGrid(
  childGrid: BeeNodeGridSchema,
  parentGrid: GridConfig,
  childRect: GridRect
): GridConfig {
  const panelWidth = spanToPxX(childRect.w, parentGrid);
  const panelHeight = spanToPxY(childRect.h, parentGrid);
  const sizing = calcCellSizeFromCanvas(
    childGrid.rows,
    childGrid.cols,
    panelWidth,
    panelHeight,
    childGrid.gap
  );

  return {
    rows: childGrid.rows,
    cols: childGrid.cols,
    gap: sizing.gap,
    cellWidth: sizing.cellWidth,
    cellHeight: sizing.cellHeight
  };
}

function fromNodeSchema(nodeSchema: BeeNodeSchema, fallbackGrid: GridConfig): DesignerNode {
  const safeRect = normalizeRect(nodeSchema.rect || { x: 0, y: 0, w: 1, h: 1 });
  const safeNodeGrid = normalizeNodeGrid(nodeSchema.grid);

  let ownGrid = fallbackGrid;
  let acceptsChildren = false;

  if (safeNodeGrid) {
    ownGrid = buildChildGrid(safeNodeGrid, fallbackGrid, safeRect);
    acceptsChildren = true;
  }

  const props = { component: deepClone(nodeSchema.component || {}) };

  const children = [...(nodeSchema.children || [])]
    .sort((a, b) => Number(a.zIndex || 0) - Number(b.zIndex || 0))
    .map((child) => fromNodeSchema(child, ownGrid));

  if (children.length > 0) {
    acceptsChildren = true;
  }

  return {
    id: nodeSchema.id,
    type: acceptsChildren ? "container" : "component",
    name: nodeSchema.name,
    rect: safeRect,
    grid: ownGrid,
    acceptsChildren,
    zIndex: Math.max(0, Math.floor(nodeSchema.zIndex || 0)),
    props,
    children
  };
}

export function createDesignSchemaFromRoot(
  rootNode: DesignerNode,
  options: ExportOptions
): BeeDataViewSchema {
  const safeWidth = Math.max(1, Math.floor(options.canvasWidth || 1));
  const safeHeight = Math.max(1, Math.floor(options.canvasHeight || 1));

  return {
    title: options.title || rootNode.name || "Untitled Panel",
    modifyTime: new Date().toISOString(),
    width: safeWidth,
    height: safeHeight,
    rows: Math.max(1, Math.floor(rootNode.grid.rows || 1)),
    cols: Math.max(1, Math.floor(rootNode.grid.cols || 1)),
    gap: Math.max(0, Number(rootNode.grid.gap ?? 1)),
    scalePercent: Math.max(1, Number((options.scalePercent || 100).toFixed(2))),
    root: toNodeSchema(rootNode),
    layerGroups: options.layerGroups ? deepClone(options.layerGroups) : []
  };
}

export function restoreRootFromDesignSchema(schema: BeeDataViewSchema): RestoreResult {
  if (!schema || !schema.root) {
    throw new Error("Invalid schema structure. Missing root node.");
  }

  const canvasWidth = Math.max(1, Math.floor(schema.width || 1));
  const canvasHeight = Math.max(1, Math.floor(schema.height || 1));
  const rows = Math.max(1, Math.floor(schema.rows || 1));
  const cols = Math.max(1, Math.floor(schema.cols || 1));
  const gap = Math.max(0, Number(schema.gap ?? 1));
  const scalePercent = Math.max(1, Number((schema.scalePercent || 100).toFixed(2)));

  const sizing = calcCellSizeFromCanvas(rows, cols, canvasWidth, canvasHeight, gap);
  const baseGrid: GridConfig = {
    rows,
    cols,
    gap: sizing.gap,
    cellWidth: sizing.cellWidth,
    cellHeight: sizing.cellHeight
  };

  const rootNode = fromNodeSchema(schema.root, baseGrid);
  rootNode.rect = { x: 0, y: 0, w: cols, h: rows };
  rootNode.type = "canvas";
  rootNode.name = schema.title || rootNode.name || "RootCanvas";
  rootNode.zIndex = 0;
  rootNode.acceptsChildren = true;
  rootNode.grid = baseGrid;

  return {
    rootNode,
    canvasConfig: {
      canvasWidth,
      canvasHeight,
      rows,
      cols,
      gap,
      scalePercent
    }
  };
}
