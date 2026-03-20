<template>
  <div class="bee-data-view-panel">
    <div class="panel-canvas-stage">
      <div class="panel-canvas-viewport">
        <div class="panel-canvas-scale-box" :style="canvasScaleBoxStyle">
          <div class="panel-canvas-scale-layer" :style="canvasScaleLayerStyle">
            <GridNode
              ref="rootCanvas"
              :node="rootNode"
              :selected-id="innerSelectedId"
              :selected-ids="innerSelectedIds"
              :is-root="true"
              :allow-external-drop="allowExternalDrop"
              :external-drag="externalDrag"
              :interaction-scale="canvasTotalScale"
              @update-node="onRootNodeUpdate"
              @select="onSelect"
              @context-menu="onNodeContextMenu"
            />
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="enableBuiltinContextMenu && contextMenu.visible"
      class="node-context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
    >
      <button class="ctx-item" @click="onContextMenuAction('up')">向上一层</button>
      <button class="ctx-item" @click="onContextMenuAction('down')">向下一层</button>
      <button class="ctx-item" @click="onContextMenuAction('top')">最上层</button>
      <button class="ctx-item" @click="onContextMenuAction('bottom')">最下层</button>
      <div class="ctx-divider"></div>
      <button class="ctx-item" @click="copySelectionToClipboard">复制</button>
      <button class="ctx-item" @click="pasteFromClipboard">粘贴</button>
      <button class="ctx-item danger" @click="removeNodes(innerSelectedIds)">删除</button>
    </div>
  </div>
</template>

<script lang="ts">
import Vue, { PropType } from "vue";
import GridNode from "../components/GridNode.vue";
import type { DesignerNode, ExternalDragSession } from "../types/designer";
import { calcCellSizeFromCanvas, clampRectToGrid } from "../utils/grid";
import {
  type ClipboardItem,
  createClipboardFromIds,
  moveNodeLayer,
  pasteClipboardItems,
  removeNodeById
} from "../utils/nodeTree";
import {
  createDesignSchemaFromRoot,
  restoreRootFromDesignSchema
} from "./schema";
import type { BeeDataViewSchema } from "./types/schema";

type SelectPayload = {
  id: string;
  additive: boolean;
};

const DEFAULT_ROWS = 16;
const DEFAULT_COLS = 24;
const DEFAULT_CANVAS_WIDTH = 1600;
const DEFAULT_CANVAS_HEIGHT = 900;
const DEFAULT_GAP = 1;

function deepCloneNode(node: DesignerNode): DesignerNode {
  return JSON.parse(JSON.stringify(node)) as DesignerNode;
}

function createRootNode(
  rows: number,
  cols: number,
  canvasWidth: number,
  canvasHeight: number
): DesignerNode {
  const sizing = calcCellSizeFromCanvas(rows, cols, canvasWidth, canvasHeight, DEFAULT_GAP);
  return {
    id: "root_canvas",
    type: "canvas",
    name: "RootCanvas",
    rect: { x: 0, y: 0, w: cols, h: rows },
    grid: {
      rows,
      cols,
      cellWidth: sizing.cellWidth,
      cellHeight: sizing.cellHeight,
      gap: sizing.gap
    },
    acceptsChildren: true,
    zIndex: 0,
    props: {},
    children: []
  };
}

export default Vue.extend({
  name: "BeeDataViewPanel",
  components: {
    GridNode
  },
  props: {
    value: {
      type: Object as PropType<DesignerNode | null>,
      default: null
    },
    rows: {
      type: Number,
      default: DEFAULT_ROWS
    },
    cols: {
      type: Number,
      default: DEFAULT_COLS
    },
    canvasWidth: {
      type: Number,
      default: DEFAULT_CANVAS_WIDTH
    },
    canvasHeight: {
      type: Number,
      default: DEFAULT_CANVAS_HEIGHT
    },
    scalePercent: {
      type: Number,
      default: 100
    },
    selectedId: {
      type: String,
      default: ""
    },
    selectedIds: {
      type: Array as PropType<string[]>,
      default: () => []
    },
    externalDrag: {
      type: Object as PropType<ExternalDragSession | null>,
      default: null
    },
    allowExternalDrop: {
      type: Boolean,
      default: true
    },
    enableBuiltinContextMenu: {
      type: Boolean,
      default: true
    },
    enableBuiltinShortcuts: {
      type: Boolean,
      default: true
    }
  },
  data() {
    const safeRows = Math.max(1, Math.floor(this.rows || 1));
    const safeCols = Math.max(1, Math.floor(this.cols || 1));
    const safeCanvasWidth = Math.max(1, Math.floor(this.canvasWidth || 1));
    const safeCanvasHeight = Math.max(1, Math.floor(this.canvasHeight || 1));
    return {
      rootNode: this.value
        ? deepCloneNode(this.value)
        : (createRootNode(safeRows, safeCols, safeCanvasWidth, safeCanvasHeight) as DesignerNode),
      innerSelectedId: this.selectedId,
      innerSelectedIds: [...this.selectedIds],
      clipboardItems: [] as ClipboardItem[],
      contextMenu: {
        visible: false,
        nodeId: "",
        targetIds: [] as string[],
        x: 0,
        y: 0
      }
    };
  },
  computed: {
    canvasTotalScale(): number {
      return Math.max(0.01, (this.scalePercent || 1) / 100);
    },
    canvasScaleBoxStyle(): Record<string, string> {
      return {
        width: `${this.canvasWidth * this.canvasTotalScale}px`,
        height: `${this.canvasHeight * this.canvasTotalScale}px`
      };
    },
    canvasScaleLayerStyle(): Record<string, string> {
      return {
        width: `${this.canvasWidth}px`,
        height: `${this.canvasHeight}px`,
        transform: `scale(${this.canvasTotalScale})`,
        transformOrigin: "left top"
      };
    }
  },
  watch: {
    value: {
      deep: true,
      handler(nextValue: DesignerNode | null) {
        if (!nextValue) {
          return;
        }
        this.rootNode = deepCloneNode(nextValue);
      }
    },
    rows() {
      this.applyCanvasConfig();
    },
    cols() {
      this.applyCanvasConfig();
    },
    canvasWidth() {
      this.applyCanvasConfig();
    },
    canvasHeight() {
      this.applyCanvasConfig();
    },
    selectedId(nextId: string) {
      this.innerSelectedId = nextId || "";
    },
    selectedIds(nextIds: string[]) {
      this.innerSelectedIds = Array.isArray(nextIds) ? [...nextIds] : [];
    },
    externalDrag(nextSession: ExternalDragSession | null) {
      if (nextSession) {
        window.addEventListener("pointerup", this.onExternalDragPointerUp);
      } else {
        window.removeEventListener("pointerup", this.onExternalDragPointerUp);
      }
    }
  },
  mounted() {
    window.addEventListener("keydown", this.onGlobalKeydown);
    window.addEventListener("pointerdown", this.onGlobalPointerDown);
    if (this.externalDrag) {
      window.addEventListener("pointerup", this.onExternalDragPointerUp);
    }
  },
  beforeDestroy() {
    window.removeEventListener("keydown", this.onGlobalKeydown);
    window.removeEventListener("pointerdown", this.onGlobalPointerDown);
    window.removeEventListener("pointerup", this.onExternalDragPointerUp);
  },
  methods: {
    emitSchema(nextRoot: DesignerNode): void {
      this.$emit("input", deepCloneNode(nextRoot));
      this.$emit("change", deepCloneNode(nextRoot));
      this.$emit("schema-change", this.getDesignSchema());
    },
    emitSelectionChange(): void {
      this.$emit("update:selectedId", this.innerSelectedId);
      this.$emit("update:selectedIds", [...this.innerSelectedIds]);
      this.$emit("selection-change", {
        selectedId: this.innerSelectedId,
        selectedIds: [...this.innerSelectedIds]
      });
    },
    onRootNodeUpdate(nextNode: DesignerNode): void {
      this.rootNode = nextNode;
      this.emitSchema(nextNode);
    },
    applyCanvasConfig(): void {
      const rows = Math.max(1, Math.floor(this.rows || 1));
      const cols = Math.max(1, Math.floor(this.cols || 1));
      const canvasWidth = Math.max(1, Math.floor(this.canvasWidth || 1));
      const canvasHeight = Math.max(1, Math.floor(this.canvasHeight || 1));
      const sizing = calcCellSizeFromCanvas(rows, cols, canvasWidth, canvasHeight, this.rootNode.grid.gap);

      const nextGrid = {
        ...this.rootNode.grid,
        rows,
        cols,
        cellWidth: sizing.cellWidth,
        cellHeight: sizing.cellHeight,
        gap: sizing.gap
      };

      const nextChildren = this.rootNode.children.map((child) => ({
        ...child,
        rect: clampRectToGrid(child.rect, nextGrid, 1, 1)
      }));

      this.rootNode = {
        ...this.rootNode,
        rect: { x: 0, y: 0, w: cols, h: rows },
        grid: nextGrid,
        children: nextChildren
      };
      this.emitSchema(this.rootNode);
    },
    onSelect(payload: SelectPayload): void {
      this.contextMenu.visible = false;
      if (!payload.id) {
        this.innerSelectedId = "";
        this.innerSelectedIds = [];
        this.emitSelectionChange();
        this.$emit("select", payload);
        return;
      }

      if (payload.additive) {
        if (this.innerSelectedIds.includes(payload.id)) {
          const nextIds = this.innerSelectedIds.filter((id) => id !== payload.id);
          this.innerSelectedIds = nextIds;
          this.innerSelectedId = nextIds[nextIds.length - 1] || "";
        } else {
          this.innerSelectedIds = [...this.innerSelectedIds, payload.id];
          this.innerSelectedId = payload.id;
        }
      } else {
        this.innerSelectedId = payload.id;
        this.innerSelectedIds = [payload.id];
      }

      this.emitSelectionChange();
      this.$emit("select", payload);
    },
    onNodeContextMenu(payload: { nodeId: string; x: number; y: number }): void {
      if (!this.enableBuiltinContextMenu) {
        this.$emit("node-context-menu", payload);
        return;
      }
      const useSelectedSet =
        this.innerSelectedIds.includes(payload.nodeId) && this.innerSelectedIds.length > 1;
      const targetIds = useSelectedSet ? [...this.innerSelectedIds] : [payload.nodeId];
      if (!useSelectedSet) {
        this.innerSelectedId = payload.nodeId;
        this.innerSelectedIds = [payload.nodeId];
        this.emitSelectionChange();
      }
      this.contextMenu.nodeId = payload.nodeId;
      this.contextMenu.targetIds = targetIds;
      this.contextMenu.visible = true;
      this.contextMenu.x = Math.max(6, Math.min(window.innerWidth - 166, payload.x));
      this.contextMenu.y = Math.max(6, Math.min(window.innerHeight - 220, payload.y));
      this.$emit("node-context-menu", payload);
    },
    onContextMenuAction(action: "up" | "down" | "top" | "bottom"): void {
      const targetIds =
        this.contextMenu.targetIds.length > 0
          ? [...this.contextMenu.targetIds]
          : [...this.innerSelectedIds];
      if (targetIds.length === 0) {
        this.contextMenu.visible = false;
        return;
      }
      const primaryId = this.contextMenu.nodeId || this.innerSelectedId || targetIds[0];
      const moved = moveNodeLayer(this.rootNode, primaryId, action);
      if (moved.moved) {
        this.rootNode = moved.nextNode;
        this.innerSelectedId = primaryId;
        this.innerSelectedIds = [primaryId];
        this.emitSchema(this.rootNode);
        this.emitSelectionChange();
      }
      this.contextMenu.visible = false;
    },
    onGlobalPointerDown(event: PointerEvent): void {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      const inContextMenu = Boolean(target.closest(".node-context-menu"));
      const onContextItem = Boolean(target.closest(".ctx-item"));
      if (!inContextMenu || !onContextItem) {
        this.contextMenu.visible = false;
      }
    },
    onGlobalKeydown(event: KeyboardEvent): void {
      if (!this.enableBuiltinShortcuts) {
        return;
      }
      const activeEl = document.activeElement as HTMLElement | null;
      const tag = activeEl?.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") {
        return;
      }

      const isMeta = event.metaKey || event.ctrlKey;
      const lowerKey = event.key.toLowerCase();

      if (isMeta && lowerKey === "c") {
        event.preventDefault();
        this.copySelectionToClipboard();
        return;
      }
      if (isMeta && lowerKey === "v") {
        event.preventDefault();
        this.pasteFromClipboard();
        return;
      }
      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }
      if (this.innerSelectedIds.length === 0) {
        return;
      }

      event.preventDefault();
      this.removeNodes(this.innerSelectedIds);
      this.contextMenu.visible = false;
    },
    findNode(nodeId: string): DesignerNode | null {
      const stack: DesignerNode[] = [this.rootNode];
      while (stack.length > 0) {
        const current = stack.pop() as DesignerNode;
        if (current.id === nodeId) {
          return current;
        }
        for (const child of current.children) {
          stack.push(child);
        }
      }
      return null;
    },
    copySelectionToClipboard(): void {
      if (this.innerSelectedIds.length === 0) {
        return;
      }
      this.clipboardItems = createClipboardFromIds(this.rootNode, this.innerSelectedIds);
      this.contextMenu.visible = false;
    },
    pasteFromClipboard(): void {
      if (this.clipboardItems.length === 0) {
        return;
      }
      const selectedNode = this.innerSelectedId ? this.findNode(this.innerSelectedId) : null;
      const fallbackParentId =
        this.innerSelectedIds.length === 1 && selectedNode && selectedNode.acceptsChildren
          ? this.innerSelectedId
          : this.rootNode.id;
      const pasted = pasteClipboardItems(this.rootNode, this.clipboardItems, fallbackParentId);
      if (pasted.pastedIds.length > 0) {
        this.rootNode = pasted.nextNode;
        this.innerSelectedIds = pasted.pastedIds;
        this.innerSelectedId = pasted.pastedIds[pasted.pastedIds.length - 1] || "";
        this.emitSchema(this.rootNode);
        this.emitSelectionChange();
      }
      this.contextMenu.visible = false;
    },
    removeNodes(targetIds: string[]): void {
      let next = this.rootNode;
      let removedAny = false;
      for (const id of targetIds) {
        const removed = removeNodeById(next, id);
        if (removed.removed) {
          next = removed.nextNode;
          removedAny = true;
        }
      }
      if (!removedAny) {
        this.contextMenu.visible = false;
        return;
      }
      this.rootNode = next;
      this.innerSelectedId = "";
      this.innerSelectedIds = [];
      this.emitSchema(this.rootNode);
      this.emitSelectionChange();
      this.contextMenu.visible = false;
    },
    commitExternalDrop(): boolean {
      const rootCanvas = this.$refs.rootCanvas as Vue & {
        commitExternalDrop?: () => boolean;
      };
      if (!rootCanvas || typeof rootCanvas.commitExternalDrop !== "function") {
        return false;
      }
      const dropped = rootCanvas.commitExternalDrop();
      if (dropped) {
        this.$emit("external-drop-commit");
      }
      return dropped;
    },
    onExternalDragPointerUp(): void {
      if (!this.externalDrag) {
        return;
      }
      this.commitExternalDrop();
    },
    getSchema(): DesignerNode {
      return deepCloneNode(this.rootNode);
    },
    setSchema(nextRoot: DesignerNode): void {
      this.rootNode = deepCloneNode(nextRoot);
      this.emitSchema(this.rootNode);
    },
    getDesignSchema(): BeeDataViewSchema {
      return createDesignSchemaFromRoot(this.rootNode, {
        canvasWidth: this.canvasWidth,
        canvasHeight: this.canvasHeight,
        scalePercent: this.scalePercent
      });
    },
    setDesignSchema(schema: BeeDataViewSchema): void {
      try {
        const restored = restoreRootFromDesignSchema(schema);
        this.rootNode = deepCloneNode(restored.rootNode);
        this.innerSelectedId = "";
        this.innerSelectedIds = [];
        this.emitSelectionChange();
        this.$emit("restore-canvas-config", restored.canvasConfig);
        this.emitSchema(this.rootNode);
      } catch (error) {
        this.$emit("restore-error", error);
      }
    },
    clearSelection(): void {
      this.innerSelectedId = "";
      this.innerSelectedIds = [];
      this.emitSelectionChange();
    }
  }
});
</script>

<style scoped>
.bee-data-view-panel {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  position: relative;
}

.panel-canvas-stage {
  width: 100%;
  height: 100%;
  overflow: auto;
  padding: 16px;
}

.panel-canvas-viewport {
  min-width: 100%;
}

.panel-canvas-scale-box {
  position: relative;
  margin: 0 auto;
}

.panel-canvas-scale-layer {
  position: absolute;
  left: 0;
  top: 0;
}

.node-context-menu {
  position: fixed;
  min-width: 148px;
  border: 1px solid #b5c7db;
  background: #ffffff;
  box-shadow: 0 12px 24px rgba(15, 38, 63, 0.2);
  z-index: 320;
  padding: 4px;
}

.ctx-item {
  width: 100%;
  border: 0;
  background: transparent;
  text-align: left;
  font-size: 13px;
  color: #244a72;
  padding: 6px 8px;
  cursor: pointer;
}

.ctx-item:hover {
  background: #eaf2fc;
}

.ctx-divider {
  height: 1px;
  background: #e2eaf3;
  margin: 4px 0;
}

.ctx-item.danger {
  color: #b63f3f;
}
</style>
