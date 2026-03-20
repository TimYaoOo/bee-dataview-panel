export type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export interface GridRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GridConfig {
  rows: number;
  cols: number;
  cellWidth: number;
  cellHeight: number;
  gap: number;
}

export interface DesignerNode {
  id: string;
  type: string;
  name: string;
  rect: GridRect;
  grid: GridConfig;
  acceptsChildren: boolean;
  zIndex: number;
  props: Record<string, unknown>;
  children: DesignerNode[];
}

export interface ComponentTemplate {
  type: string;
  name: string;
  defaultSize: {
    w: number;
    h: number;
  };
  acceptsChildren?: boolean;
  grid?: Partial<GridConfig>;
  props?: Record<string, unknown>;
}

export interface Pointer {
  x: number;
  y: number;
}

export interface ExternalDragSession {
  template: ComponentTemplate;
  pointer: Pointer;
}
