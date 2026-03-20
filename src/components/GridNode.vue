<template>
  <div
    ref="container"
    class="grid-node"
    :class="{ 'is-root': isRoot, 'is-leaf': !node.acceptsChildren }"
    :style="nodeStyle"
    @pointerdown.self="onCanvasPointerDown"
  >
    <div v-if="node.acceptsChildren" class="grid-background" :style="gridBackgroundStyle"></div>

    <div
      v-for="child in sortedChildren"
      :key="child.id"
      class="grid-item"
      :class="{ 'is-selected': isNodeSelected(child.id), 'is-active': selectedId === child.id }"
      :style="rectStyle(child.rect, child.zIndex)"
      @pointerdown.stop="onItemPointerDown($event, child)"
      @contextmenu.stop.prevent="onItemContextMenu($event, child)"
    >
      <GridNode
        :node="child"
        :selected-id="selectedId"
        :selected-ids="selectedIds"
        :is-root="false"
        :allow-external-drop="false"
        :external-drag="null"
        :interaction-scale="interactionScale"
        @update-node="onChildNodeUpdate"
        @select="forwardSelect"
        @context-menu="forwardContextMenu"
      />

      <div class="node-badge">{{ child.name }}</div>

      <div
        v-for="direction in resizeDirections"
        v-show="selectedId === child.id"
        :key="direction"
        class="resize-handle"
        :class="'dir-' + direction"
        @pointerdown.stop.prevent="onResizeHandleDown($event, child, direction)"
      ></div>
    </div>

    <div v-if="!node.acceptsChildren" class="leaf-label">{{ node.name }}</div>

    <div
      v-if="allowExternalDrop && externalPreview"
      class="drag-preview"
      :style="rectStyle(externalPreview, maxChildZ + 2)"
    ></div>
  </div>
</template>

<script lang="ts">
import Vue, { PropType } from "vue";
import type {
  DesignerNode,
  ExternalDragSession,
  GridRect,
  Pointer,
  ResizeDirection
} from "../types/designer";
import {
  clampRectToGrid,
  getGridStepX,
  getGridStepY,
  moveRectFromDelta,
  pointerToCell,
  resizeRectFromDelta,
  spanToPxX,
  spanToPxY
} from "../utils/grid";
import {
  createNodeId,
  maxZIndex,
  replaceDirectChild,
  updateDirectChildRect
} from "../utils/nodeTree";
import { lockUserSelect, unlockUserSelect } from "../utils/selectionGuard";

type MoveAction = {
  kind: "move";
  nodeId: string;
  startPointer: Pointer;
  startRect: GridRect;
};

type ResizeAction = {
  kind: "resize";
  nodeId: string;
  direction: ResizeDirection;
  startPointer: Pointer;
  startRect: GridRect;
};

type MultiMoveAction = {
  kind: "multi-move";
  nodeIds: string[];
  startPointer: Pointer;
  startRects: Record<string, GridRect>;
};

type ActionState = MoveAction | ResizeAction | MultiMoveAction;
type SelectPayload = {
  id: string;
  additive: boolean;
};

const RESIZE_DIRECTIONS: ResizeDirection[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

export default Vue.extend({
  name: "GridNode",
  props: {
    node: {
      type: Object as PropType<DesignerNode>,
      required: true
    },
    selectedId: {
      type: String,
      default: ""
    },
    selectedIds: {
      type: Array as PropType<string[]>,
      default: () => []
    },
    isRoot: {
      type: Boolean,
      default: false
    },
    allowExternalDrop: {
      type: Boolean,
      default: false
    },
    externalDrag: {
      type: Object as PropType<ExternalDragSession | null>,
      default: null
    },
    interactionScale: {
      type: Number,
      default: 1
    }
  },
  data() {
    return {
      activeAction: null as ActionState | null,
      externalPreview: null as GridRect | null,
      rafMoveId: 0,
      latestPointerEvent: null as PointerEvent | null,
      isLocalDragLocking: false
    };
  },
  computed: {
    resizeDirections(): ResizeDirection[] {
      return RESIZE_DIRECTIONS;
    },
    gridStepX(): number {
      return getGridStepX(this.node.grid);
    },
    gridStepY(): number {
      return getGridStepY(this.node.grid);
    },
    safeInteractionScale(): number {
      return Math.max(0.01, this.interactionScale);
    },
    gridLineWidth(): number {
      return Math.max(0.5, Math.min(12, 1 / this.safeInteractionScale));
    },
    sortedChildren(): DesignerNode[] {
      return [...this.node.children].sort((a, b) => a.zIndex - b.zIndex);
    },
    maxChildZ(): number {
      return maxZIndex(this.node.children);
    },
    nodeStyle(): Record<string, string> {
      const base: Record<string, string> = {
        position: "relative",
        width: "100%",
        height: "100%"
      };
      if (this.isRoot) {
        base.width = `${spanToPxX(this.node.grid.cols, this.node.grid)}px`;
        base.height = `${spanToPxY(this.node.grid.rows, this.node.grid)}px`;
      }
      return base;
    },
    gridBackgroundStyle(): Record<string, string> {
      return {
        "--cell-width": `${this.node.grid.cellWidth}px`,
        "--cell-height": `${this.node.grid.cellHeight}px`,
        "--grid-gap": `${this.node.grid.gap}px`,
        "--grid-step-x": `${this.gridStepX}px`,
        "--grid-step-y": `${this.gridStepY}px`,
        "--grid-line-width": `${this.gridLineWidth}px`
      };
    }
  },
  watch: {
    externalDrag: {
      deep: true,
      immediate: true,
      handler() {
        this.computeExternalPreview();
      }
    },
    interactionScale() {
      this.computeExternalPreview();
    }
  },
  beforeDestroy() {
    this.detachWindowListeners();
    this.cancelPendingMoveFrame();
    this.endUserSelectLock();
  },
  methods: {
    beginUserSelectLock(): void {
      if (this.isLocalDragLocking) {
        return;
      }
      lockUserSelect();
      this.isLocalDragLocking = true;
    },
    endUserSelectLock(): void {
      if (!this.isLocalDragLocking) {
        return;
      }
      unlockUserSelect();
      this.isLocalDragLocking = false;
    },
    isNodeSelected(nodeId: string): boolean {
      return this.selectedIds.includes(nodeId);
    },
    forwardSelect(payload: SelectPayload): void {
      this.$emit("select", payload);
    },
    forwardContextMenu(payload: { nodeId: string; x: number; y: number }): void {
      this.$emit("context-menu", payload);
    },
    rectStyle(rect: GridRect, zIndex = 1): Record<string, string> {
      return {
        left: `${rect.x * this.gridStepX}px`,
        top: `${rect.y * this.gridStepY}px`,
        width: `${spanToPxX(rect.w, this.node.grid)}px`,
        height: `${spanToPxY(rect.h, this.node.grid)}px`,
        zIndex: `${zIndex}`
      };
    },
    emitNode(nextNode: DesignerNode): void {
      this.$emit("update-node", nextNode);
    },
    onCanvasPointerDown(): void {
      if (!this.isRoot) {
        return;
      }
      this.$emit("select", {
        id: "",
        additive: false
      });
    },
    onItemPointerDown(event: PointerEvent, child: DesignerNode): void {
      if (event.button !== 0) {
        return;
      }
      const additive = event.ctrlKey || event.metaKey;
      const localSelectedIds = this.node.children
        .filter((item) => this.selectedIds.includes(item.id))
        .map((item) => item.id);
      const shouldKeepMultiSelection =
        !additive && this.isNodeSelected(child.id) && localSelectedIds.length > 1;

      if (!shouldKeepMultiSelection) {
        this.$emit("select", {
          id: child.id,
          additive
        });
      }
      if (additive) {
        return;
      }

      if (shouldKeepMultiSelection) {
        const startRects: Record<string, GridRect> = {};
        for (const item of this.node.children) {
          if (localSelectedIds.includes(item.id)) {
            startRects[item.id] = { ...item.rect };
          }
        }
        this.activeAction = {
          kind: "multi-move",
          nodeIds: localSelectedIds,
          startPointer: { x: event.clientX, y: event.clientY },
          startRects
        };
      } else {
        this.activeAction = {
          kind: "move",
          nodeId: child.id,
          startPointer: { x: event.clientX, y: event.clientY },
          startRect: { ...child.rect }
        };
      }
      this.beginUserSelectLock();

      this.attachWindowListeners();
    },
    onItemContextMenu(event: MouseEvent, child: DesignerNode): void {
      if (!this.isNodeSelected(child.id)) {
        this.$emit("select", {
          id: child.id,
          additive: false
        });
      }
      this.$emit("context-menu", {
        nodeId: child.id,
        x: event.clientX,
        y: event.clientY
      });
    },
    onResizeHandleDown(
      event: PointerEvent,
      child: DesignerNode,
      direction: ResizeDirection
    ): void {
      if (event.button !== 0) {
        return;
      }
      this.$emit("select", {
        id: child.id,
        additive: false
      });

      this.activeAction = {
        kind: "resize",
        nodeId: child.id,
        direction,
        startPointer: { x: event.clientX, y: event.clientY },
        startRect: { ...child.rect }
      };
      this.beginUserSelectLock();
      this.attachWindowListeners();
    },
    onWindowPointerMove(event: PointerEvent): void {
      if (!this.activeAction) {
        return;
      }
      this.latestPointerEvent = event;
      if (this.rafMoveId) {
        return;
      }
      this.rafMoveId = window.requestAnimationFrame(() => {
        this.rafMoveId = 0;
        this.applyMoveFrame();
      });
    },
    applyMoveFrame(): void {
      if (!this.activeAction || !this.latestPointerEvent) {
        return;
      }

      const event = this.latestPointerEvent;
      const deltaXCells = this.toCellDelta(
        event.clientX - this.activeAction.startPointer.x,
        this.gridStepX * this.safeInteractionScale
      );
      const deltaYCells = this.toCellDelta(
        event.clientY - this.activeAction.startPointer.y,
        this.gridStepY * this.safeInteractionScale
      );

      if (this.activeAction.kind === "move") {
        const nextRect = moveRectFromDelta(
          this.activeAction.startRect,
          deltaXCells,
          deltaYCells,
          this.node.grid
        );
        const nextNode = updateDirectChildRect(this.node, this.activeAction.nodeId, nextRect);
        this.emitNode(nextNode);
        return;
      }

      if (this.activeAction.kind === "multi-move") {
        const startRects = Object.values(this.activeAction.startRects);
        if (startRects.length === 0) {
          return;
        }
        const minX = Math.min(...startRects.map((rect) => rect.x));
        const minY = Math.min(...startRects.map((rect) => rect.y));
        const maxRight = Math.max(...startRects.map((rect) => rect.x + rect.w));
        const maxBottom = Math.max(...startRects.map((rect) => rect.y + rect.h));

        const clampedDeltaX = Math.max(-minX, Math.min(deltaXCells, this.node.grid.cols - maxRight));
        const clampedDeltaY = Math.max(-minY, Math.min(deltaYCells, this.node.grid.rows - maxBottom));

        const nextNode: DesignerNode = {
          ...this.node,
          children: this.node.children.map((item) => {
            if (!this.activeAction.nodeIds.includes(item.id)) {
              return item;
            }
            const start = this.activeAction.startRects[item.id];
            return {
              ...item,
              rect: {
                ...start,
                x: start.x + clampedDeltaX,
                y: start.y + clampedDeltaY
              }
            };
          })
        };
        this.emitNode(nextNode);
        return;
      }

      if (this.activeAction.kind === "resize") {
        const nextRect = resizeRectFromDelta(
          this.activeAction.startRect,
          deltaXCells,
          deltaYCells,
          this.activeAction.direction,
          this.node.grid,
          1,
          1
        );
        const nextNode = updateDirectChildRect(this.node, this.activeAction.nodeId, nextRect);
        this.emitNode(nextNode);
      }
    },
    toCellDelta(deltaPx: number, stepPx: number): number {
      if (stepPx <= 0) {
        return 0;
      }
      const ratio = deltaPx / stepPx;
      return ratio >= 0 ? Math.floor(ratio) : Math.ceil(ratio);
    },
    cancelPendingMoveFrame(): void {
      if (this.rafMoveId) {
        window.cancelAnimationFrame(this.rafMoveId);
        this.rafMoveId = 0;
      }
      this.latestPointerEvent = null;
    },
    onWindowPointerUp(): void {
      this.activeAction = null;
      this.cancelPendingMoveFrame();
      this.endUserSelectLock();
      this.detachWindowListeners();
    },
    attachWindowListeners(): void {
      window.addEventListener("pointermove", this.onWindowPointerMove);
      window.addEventListener("pointerup", this.onWindowPointerUp);
    },
    detachWindowListeners(): void {
      window.removeEventListener("pointermove", this.onWindowPointerMove);
      window.removeEventListener("pointerup", this.onWindowPointerUp);
    },
    onChildNodeUpdate(updatedChild: DesignerNode): void {
      const nextNode = replaceDirectChild(this.node, updatedChild);
      this.emitNode(nextNode);
    },
    getContainerBounds(): DOMRect | null {
      const el = this.$refs.container as HTMLElement | undefined;
      if (!el) {
        return null;
      }
      return el.getBoundingClientRect();
    },
    computeExternalPreview(): void {
      if (!this.allowExternalDrop || !this.externalDrag || !this.node.acceptsChildren) {
        this.externalPreview = null;
        return;
      }
      const bounds = this.getContainerBounds();
      if (!bounds) {
        this.externalPreview = null;
        return;
      }

      const cellPoint = pointerToCell(
        this.externalDrag.pointer,
        bounds,
        this.node.grid,
        this.safeInteractionScale
      );
      if (!cellPoint.inside) {
        this.externalPreview = null;
        return;
      }

      const rect = clampRectToGrid(
        {
          x: cellPoint.x,
          y: cellPoint.y,
          w: this.externalDrag.template.defaultSize.w,
          h: this.externalDrag.template.defaultSize.h
        },
        this.node.grid,
        1,
        1
      );
      this.externalPreview = rect;
    },
    commitExternalDrop(): boolean {
      this.computeExternalPreview();

      if (!this.allowExternalDrop || !this.externalDrag || !this.externalPreview) {
        return false;
      }

      const template = this.externalDrag.template;
      const nextChild: DesignerNode = {
        id: createNodeId("cmp"),
        type: template.type,
        name: template.name,
        rect: { ...this.externalPreview },
        grid: {
          rows: template.grid?.rows ?? 12,
          cols: template.grid?.cols ?? 12,
          cellWidth: template.grid?.cellWidth ?? this.node.grid.cellWidth,
          cellHeight: template.grid?.cellHeight ?? this.node.grid.cellHeight,
          gap: template.grid?.gap ?? this.node.grid.gap
        },
        acceptsChildren: Boolean(template.acceptsChildren),
        zIndex: this.maxChildZ + 1,
        props: template.props ? { ...template.props } : {},
        children: []
      };

      const nextNode: DesignerNode = {
        ...this.node,
        children: [...this.node.children, nextChild]
      };

      this.emitNode(nextNode);
      this.$emit("select", {
        id: nextChild.id,
        additive: false
      });
      this.externalPreview = null;
      return true;
    }
  }
});
</script>

<style scoped>
.grid-node {
  overflow: hidden;
  background: linear-gradient(180deg, #f8fbff 0%, #f2f7ff 100%);
  position: relative;
}

.grid-node::after {
  content: "";
  position: absolute;
  inset: 0;
  border: 1px solid #b8c2d1;
  pointer-events: none;
  z-index: 2;
}

.grid-node.is-leaf {
  background: linear-gradient(160deg, #e5f0ff 0%, #d3e6ff 100%);
}

.grid-node.is-leaf::after {
  border-color: #8db1dd;
}

.grid-node.is-root::after {
  box-shadow: none;
}

.grid-node.is-root {
  box-shadow: 0 12px 28px rgba(22, 47, 76, 0.2);
}

.grid-background {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background-image:
    repeating-linear-gradient(
      to right,
      rgba(25, 60, 90, 0.12) 0,
      rgba(25, 60, 90, 0.12) var(--grid-line-width),
      rgba(0, 0, 0, 0) var(--grid-line-width),
      rgba(0, 0, 0, 0) var(--grid-step-x)
    ),
    repeating-linear-gradient(
      to bottom,
      rgba(25, 60, 90, 0.12) 0,
      rgba(25, 60, 90, 0.12) var(--grid-line-width),
      rgba(0, 0, 0, 0) var(--grid-line-width),
      rgba(0, 0, 0, 0) var(--grid-step-y)
    );
  background-size: var(--grid-step-x) var(--grid-step-y);
}

.grid-item {
  position: absolute;
  border: 1px solid #6d8fb8;
  overflow: visible;
  box-shadow: 0 8px 20px rgba(12, 38, 65, 0.16);
  background: #ffffff;
  z-index: 1;
  will-change: left, top, width, height;
  transition:
    left 70ms linear,
    top 70ms linear,
    width 70ms linear,
    height 70ms linear,
    border-color 120ms ease,
    box-shadow 120ms ease;
}

.grid-item.is-selected::before {
  content: "";
  position: absolute;
  inset: 0;
  background: rgba(28, 120, 210, 0.12);
  pointer-events: none;
  z-index: 23;
}

.grid-item.is-selected::after {
  content: "";
  position: absolute;
  inset: 0;
  border: 3px solid rgba(16, 108, 214, 0.92);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.68);
  pointer-events: none;
  z-index: 24;
}

.grid-item.is-active::after {
  border-color: rgba(0, 92, 204, 1);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.9),
    0 0 0 1px rgba(0, 92, 204, 0.45),
    0 0 14px rgba(0, 107, 214, 0.35);
}

.grid-item.is-active {
  box-shadow:
    0 0 0 2px rgba(19, 113, 223, 0.35),
    0 10px 24px rgba(9, 31, 54, 0.22);
}

.node-badge {
  position: absolute;
  left: 8px;
  top: 8px;
  font-size: 12px;
  color: #2f4f73;
  background: rgba(243, 248, 255, 0.95);
  border: 1px solid #aac0da;
  border-radius: 4px;
  padding: 2px 6px;
  z-index: 5;
  pointer-events: none;
}

.leaf-label {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #20466f;
  font-size: 13px;
  letter-spacing: 0.3px;
}

.drag-preview {
  position: absolute;
  border: 2px dashed #2f6fb8;
  background: rgba(48, 109, 183, 0.12);
  pointer-events: none;
  transition:
    left 70ms linear,
    top 70ms linear,
    width 70ms linear,
    height 70ms linear;
}

.resize-handle {
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  border: 1px solid #17589f;
  background: #eaf3ff;
  z-index: 10;
}

.dir-n {
  top: -6px;
  left: calc(50% - 5px);
  cursor: n-resize;
}

.dir-s {
  bottom: -6px;
  left: calc(50% - 5px);
  cursor: s-resize;
}

.dir-e {
  right: -6px;
  top: calc(50% - 5px);
  cursor: e-resize;
}

.dir-w {
  left: -6px;
  top: calc(50% - 5px);
  cursor: w-resize;
}

.dir-ne {
  right: -6px;
  top: -6px;
  cursor: ne-resize;
}

.dir-nw {
  left: -6px;
  top: -6px;
  cursor: nw-resize;
}

.dir-se {
  right: -6px;
  bottom: -6px;
  cursor: se-resize;
}

.dir-sw {
  left: -6px;
  bottom: -6px;
  cursor: sw-resize;
}
</style>
