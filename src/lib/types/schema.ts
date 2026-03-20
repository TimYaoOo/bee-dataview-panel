import type { GridRect } from "../../types/designer";

export interface BeeNodeGridSchema {
  rows: number;
  cols: number;
  gap: number;
}

export interface BeeNodeSchema {
  id: string;
  name: string;
  rect: GridRect;
  zIndex: number;
  grid?: BeeNodeGridSchema;
  component: Record<string, unknown>;
  children: BeeNodeSchema[];
}

export interface BeeLayerGroupSchema {
  id: string;
  name: string;
  parentId: string | null;
  nodeIds: string[];
  groupIds: string[];
}

export interface BeeDataViewSchema {
  title: string;
  modifyTime: string;
  width: number;
  height: number;
  rows: number;
  cols: number;
  gap: number;
  scalePercent: number;
  root: BeeNodeSchema;
  layerGroups: BeeLayerGroupSchema[];
}
