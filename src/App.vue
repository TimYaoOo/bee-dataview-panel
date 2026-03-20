<template>
  <div class="app-shell">
    <aside class="palette-panel">
      <h2>组件库</h2>
      <p class="panel-tip">按住组件并拖拽到画布中。</p>

      <button
        v-for="template in templates"
        :key="template.type"
        class="palette-item"
        @pointerdown.prevent="startExternalDrag(template, $event)"
      >
        <span class="item-name">{{ template.name }}</span>
        <span class="item-size">{{ template.defaultSize.w }}x{{ template.defaultSize.h }}</span>
      </button>
    </aside>

    <section class="workspace-panel">
      <header class="workspace-toolbar">
        <div class="field-group">
          <label>
            分辨率
            <select v-model="selectedPresetKey" @change="onPresetChange">
              <option v-for="preset in resolutionPresets" :key="preset.key" :value="preset.key">
                {{ preset.label }}
              </option>
              <option :value="CUSTOM_PRESET_KEY">自定义</option>
            </select>
          </label>
          <label>
            画布宽
            <input
              v-model.number="inputCanvasWidth"
              type="number"
              min="1"
              @input="onCanvasSizeInput"
            />
          </label>
          <label>
            画布高
            <input
              v-model.number="inputCanvasHeight"
              type="number"
              min="1"
              @input="onCanvasSizeInput"
            />
          </label>
          <label>
            Rows
            <input v-model.number="inputRows" type="number" min="1" />
          </label>
          <label>
            Cols
            <input v-model.number="inputCols" type="number" min="1" />
          </label>
          <label>
            Gap
            <input v-model.number="inputGap" type="number" min="0" step="0.1" />
          </label>
          <label class="zoom-field">
            缩放
            <input
              v-model.number="scalePercent"
              class="zoom-slider"
              type="range"
              min="1"
              max="400"
              step="0.1"
              @input="onScaleSliderInput"
            />
            <span class="zoom-value">{{ displayScalePercent }}%</span>
          </label>
          <button class="apply-btn" @click="applyCanvasConfig">应用配置</button>
          <button class="schema-btn" @click="onExportSchema">获取Schema</button>

          <div class="layer-manager">
            <button class="layer-btn" @click.stop="toggleLayerPanel">层级管理</button>
            <div
              v-if="showLayerPanel"
              class="layer-dropdown"
              @click.stop
              @contextmenu.prevent.stop
            >
              <div class="layer-root-row">RootCanvas（组）</div>
              <div v-if="layerEntries.length === 0" class="layer-empty">暂无组件</div>
              <button
                v-for="entry in layerEntries"
                :key="entry.id"
                class="layer-row"
                :class="{
                  'is-group-row': entry.isVirtualGroup,
                  'is-active': entry.isVirtualGroup
                    ? selectedGroupId === entry.id
                    : selectedIds.includes(entry.id)
                }"
                :style="{ paddingLeft: `${10 + entry.depth * 16}px` }"
                @click="onLayerEntryClick(entry, $event)"
                @dblclick.stop="onLayerEntryDblClick(entry)"
                @contextmenu.prevent.stop="
                  !entry.isVirtualGroup && openContextMenu(entry.id, $event.clientX, $event.clientY)
                "
              >
                <span class="layer-kind">{{ entry.isVirtualGroup ? "组" : "层" }}</span>
                <input
                  v-if="renamingEntryId === entry.id"
                  ref="layerRenameInput"
                  v-model="renamingValue"
                  class="layer-name-input"
                  type="text"
                  @click.stop
                  @pointerdown.stop
                  @dblclick.stop
                  @keydown="onLayerRenameKeydown"
                  @blur="commitLayerRename"
                />
                <span v-else class="layer-name">{{ entry.name }}</span>
              </button>
              <div class="layer-footer">
                <button class="layer-add-btn" @click="onAddGroup">新增组</button>
              </div>
            </div>
          </div>
        </div>
        <div class="status-text">
          当前选中：
          <strong>{{ selectedSummary }}</strong>
          <span class="status-tip">（Delete / Backspace 删除）</span>
          <span class="metric">
            画布 {{ canvasWidth }}x{{ canvasHeight }} px，格子
            {{ rootNode.grid.cellWidth.toFixed(2) }} x {{ rootNode.grid.cellHeight.toFixed(2) }} px
          </span>
        </div>
      </header>

      <div class="canvas-stage">
        <div ref="canvasViewport" class="canvas-viewport">
          <div class="canvas-scale-box" :style="canvasScaleBoxStyle">
            <div class="canvas-scale-layer" :style="canvasScaleLayerStyle">
              <GridNode
                ref="rootCanvas"
                :node="rootNode"
                :selected-id="selectedId"
                :selected-ids="selectedIds"
                :is-root="true"
                :allow-external-drop="true"
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
    </section>

    <div
      v-if="contextMenu.visible"
      class="node-context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
    >
      <template v-if="contextMenu.targetIds.length > 1">
        <button class="ctx-item" @click="onContextMenuAction('copy')">复制</button>
        <button class="ctx-item" @click="onContextMenuAction('group')">创建层级组</button>
        <button class="ctx-item danger" @click="onContextMenuAction('delete')">删除</button>
      </template>
      <template v-else>
        <button class="ctx-item" @click="onContextMenuAction('up')">向上一层</button>
        <button class="ctx-item" @click="onContextMenuAction('down')">向下一层</button>
        <button class="ctx-item" @click="onContextMenuAction('top')">最上层</button>
        <button class="ctx-item" @click="onContextMenuAction('bottom')">最下层</button>
        <div class="ctx-divider"></div>
        <div class="ctx-submenu-group">
          <button class="ctx-item ctx-item-with-submenu" type="button" @click.stop>
            <span>移动至</span>
            <span class="ctx-submenu-arrow">▶</span>
          </button>
          <div class="ctx-submenu">
            <button
              v-for="group in availableMoveTargets"
              :key="group.id"
              class="ctx-item ctx-sub-item"
              @click="onMoveToGroup(group.id)"
            >
              {{ group.name }}
            </button>
          </div>
        </div>
        <div class="ctx-divider"></div>
        <button class="ctx-item" @click="onContextMenuAction('copy')">复制</button>
        <button class="ctx-item danger" @click="onContextMenuAction('delete')">删除</button>
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import Vue from "vue";
import GridNode from "./components/GridNode.vue";
import type { ComponentTemplate, DesignerNode, ExternalDragSession } from "./types/designer";
import { calcCellSizeFromCanvas, clampRectToGrid } from "./utils/grid";
import { createDesignSchemaFromRoot } from "./lib/schema";
import {
  type ClipboardItem,
  createNodeId,
  createClipboardFromIds,
  moveNodeLayer,
  pasteClipboardItems,
  removeNodeById
} from "./utils/nodeTree";
import { lockUserSelect, unlockUserSelect } from "./utils/selectionGuard";

type ResolutionPreset = {
  key: string;
  label: string;
  width: number;
  height: number;
};

type LayerEntry = {
  id: string;
  name: string;
  depth: number;
  isGroup: boolean;
  isVirtualGroup: boolean;
};

type SelectPayload = {
  id: string;
  additive: boolean;
};

type VirtualLayerGroup = {
  id: string;
  name: string;
  parentId: string | null;
  nodeIds: string[];
  groupIds: string[];
};

const DEFAULT_ROWS = 16;
const DEFAULT_COLS = 24;
const DEFAULT_CANVAS_WIDTH = 1600;
const DEFAULT_CANVAS_HEIGHT = 900;
const DEFAULT_GAP = 1;
const CUSTOM_PRESET_KEY = "custom";

const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { key: "1366x768", label: "1366 x 768", width: 1366, height: 768 },
  { key: "1440x900", label: "1440 x 900", width: 1440, height: 900 },
  { key: "1600x900", label: "1600 x 900", width: 1600, height: 900 },
  { key: "1920x1080", label: "1920 x 1080", width: 1920, height: 1080 },
  { key: "2560x1440", label: "2560 x 1440", width: 2560, height: 1440 },
  { key: "3840x2160", label: "3840 x 2160 (4K)", width: 3840, height: 2160 }
];

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

const TEMPLATE_LIST: ComponentTemplate[] = [
  {
    type: "chart-line",
    name: "折线图",
    defaultSize: { w: 6, h: 4 }
  },
  {
    type: "data-card",
    name: "指标卡",
    defaultSize: { w: 4, h: 3 }
  },
  {
    type: "table",
    name: "数据表",
    defaultSize: { w: 8, h: 5 }
  },
  {
    type: "container",
    name: "容器组件",
    defaultSize: { w: 10, h: 6 },
    acceptsChildren: true,
    grid: {
      rows: 12,
      cols: 12
    }
  }
];

export default Vue.extend({
  name: "App",
  components: {
    GridNode
  },
  data() {
    const rows = DEFAULT_ROWS;
    const cols = DEFAULT_COLS;
    const canvasWidth = DEFAULT_CANVAS_WIDTH;
    const canvasHeight = DEFAULT_CANVAS_HEIGHT;
    return {
      CUSTOM_PRESET_KEY,
      templates: TEMPLATE_LIST,
      resolutionPresets: RESOLUTION_PRESETS,
      selectedPresetKey: "1600x900",
      inputRows: rows,
      inputCols: cols,
      inputGap: DEFAULT_GAP,
      inputCanvasWidth: canvasWidth,
      inputCanvasHeight: canvasHeight,
      canvasWidth,
      canvasHeight,
      scalePercent: 100,
      autoFitToViewport: true,
      viewportWidth: 0,
      viewportObserver: null as ResizeObserver | null,
      isExternalDragLocking: false,
      showLayerPanel: false,
      contextMenu: {
        visible: false,
        nodeId: "",
        targetIds: [] as string[],
        x: 0,
        y: 0
      },
      clipboardItems: [] as ClipboardItem[],
      virtualGroups: [] as VirtualLayerGroup[],
      groupNameSeed: 1,
      rootNode: createRootNode(rows, cols, canvasWidth, canvasHeight) as DesignerNode,
      selectedId: "",
      selectedIds: [] as string[],
      selectedGroupId: "",
      renamingEntryId: "",
      renamingValue: "",
      externalDrag: null as ExternalDragSession | null
    };
  },
  computed: {
    fitScale(): number {
      if (this.viewportWidth <= 0 || this.canvasWidth <= 0) {
        return 1;
      }
      return this.viewportWidth / this.canvasWidth;
    },
    displayScalePercent(): number {
      return Math.max(1, Number((this.canvasTotalScale * 100).toFixed(1)));
    },
    canvasTotalScale(): number {
      return Math.max(0.01, this.scalePercent / 100);
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
    },
    layerEntries(): LayerEntry[] {
      const list: LayerEntry[] = [];
      const allNodes = this.collectAllNodes();
      const nodeMap = new Map(allNodes.map((node) => [node.id, node]));
      const nodeOrder = new Map(allNodes.map((node, index) => [node.id, index]));

      const validGroups = this.virtualGroups.filter((group) => {
        if (group.parentId && !this.virtualGroups.some((it) => it.id === group.parentId)) {
          return false;
        }
        return true;
      });
      const groupMap = new Map(validGroups.map((group) => [group.id, group]));
      const groupedNodeSet = new Set<string>();
      for (const group of validGroups) {
        for (const nodeId of group.nodeIds) {
          if (nodeMap.has(nodeId)) {
            groupedNodeSet.add(nodeId);
          }
        }
      }

      const walkGroup = (groupId: string, depth: number): void => {
        const group = groupMap.get(groupId);
        if (!group) {
          return;
        }
        list.push({
          id: group.id,
          name: group.name,
          depth,
          isGroup: true,
          isVirtualGroup: true
        });
        const childrenGroups = group.groupIds.filter((id) => groupMap.has(id));
        for (const childGroupId of childrenGroups) {
          walkGroup(childGroupId, depth + 1);
        }
        const childrenNodes = group.nodeIds
          .filter((id) => nodeMap.has(id))
          .sort((a, b) => (nodeOrder.get(a) || 0) - (nodeOrder.get(b) || 0));
        for (const nodeId of childrenNodes) {
          const node = nodeMap.get(nodeId) as DesignerNode;
          list.push({
            id: node.id,
            name: node.name,
            depth: depth + 1,
            isGroup: false,
            isVirtualGroup: false
          });
        }
      };

      const rootGroups = validGroups.filter((group) => group.parentId === null);
      for (const group of rootGroups) {
        walkGroup(group.id, 0);
      }

      const ungroupedNodes = allNodes.filter((node) => !groupedNodeSet.has(node.id));
      for (const node of ungroupedNodes) {
        list.push({
          id: node.id,
          name: node.name,
          depth: 0,
          isGroup: false,
          isVirtualGroup: false
        });
      }
      return list;
    },
    selectedSummary(): string {
      if (this.selectedIds.length === 0) {
        return "无";
      }
      if (this.selectedIds.length === 1) {
        return this.selectedId || this.selectedIds[0];
      }
      return `${this.selectedIds.length} 项`;
    },
    availableMoveTargets(): Array<{ id: string; name: string }> {
      const sourceIds = new Set(this.contextMenu.targetIds);
      const targets: Array<{ id: string; name: string }> = [
        { id: "__ungrouped__", name: "移出分组" },
        ...this.virtualGroups.map((group) => ({
          id: group.id,
          name: group.name
        }))
      ];
      return targets.filter((target) => !sourceIds.has(target.id));
    }
  },
  mounted() {
    window.addEventListener("keydown", this.onGlobalKeydown);
    window.addEventListener("pointerdown", this.onGlobalPointerDown);
    this.setupViewportObserver();
    this.$nextTick(() => {
      this.updateViewportWidth();
      this.resetScaleToFit();
    });
  },
  beforeDestroy() {
    this.clearExternalDragListeners();
    if (this.isExternalDragLocking) {
      unlockUserSelect();
      this.isExternalDragLocking = false;
    }
    window.removeEventListener("keydown", this.onGlobalKeydown);
    window.removeEventListener("pointerdown", this.onGlobalPointerDown);
    this.teardownViewportObserver();
  },
  methods: {
    onRootNodeUpdate(nextNode: DesignerNode): void {
      this.rootNode = nextNode;
    },
    collectAllNodes(): DesignerNode[] {
      const list: DesignerNode[] = [];
      const walk = (parent: DesignerNode): void => {
        const children = [...parent.children].sort((a, b) => b.zIndex - a.zIndex);
        for (const child of children) {
          list.push(child);
          walk(child);
        }
      };
      walk(this.rootNode);
      return list;
    },
    cleanupVirtualGroups(): void {
      const nodeIdSet = new Set(this.collectAllNodes().map((node) => node.id));
      const groupIdSet = new Set(this.virtualGroups.map((group) => group.id));
      this.virtualGroups = this.virtualGroups.map((group) => ({
        ...group,
        parentId: group.parentId && groupIdSet.has(group.parentId) ? group.parentId : null,
        groupIds: group.groupIds.filter((id) => groupIdSet.has(id)),
        nodeIds: group.nodeIds.filter((id) => nodeIdSet.has(id))
      }));
      if (this.selectedGroupId && !this.virtualGroups.some((group) => group.id === this.selectedGroupId)) {
        this.selectedGroupId = "";
      }
    },
    detachNodesFromGroups(nodeIds: string[]): void {
      const idSet = new Set(nodeIds);
      this.virtualGroups = this.virtualGroups.map((group) => ({
        ...group,
        nodeIds: group.nodeIds.filter((id) => !idSet.has(id))
      }));
    },
    attachNodesToGroup(nodeIds: string[], groupId: string): void {
      if (!this.virtualGroups.some((group) => group.id === groupId)) {
        return;
      }
      this.detachNodesFromGroups(nodeIds);
      const uniqueIds = Array.from(new Set(nodeIds));
      this.virtualGroups = this.virtualGroups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              nodeIds: [...group.nodeIds, ...uniqueIds]
            }
          : group
      );
    },
    createVirtualGroup(nodeIds: string[] = []): string {
      const groupId = createNodeId("vgrp");
      const groupName = `层级组 ${this.groupNameSeed}`;
      this.groupNameSeed += 1;
      this.virtualGroups = [
        ...this.virtualGroups,
        {
          id: groupId,
          name: groupName,
          parentId: null,
          nodeIds: [],
          groupIds: []
        }
      ];
      if (nodeIds.length > 0) {
        this.attachNodesToGroup(nodeIds, groupId);
      }
      return groupId;
    },
    getGroupNodeIds(groupId: string): string[] {
      const groupMap = new Map(this.virtualGroups.map((group) => [group.id, group]));
      const walk = (id: string): string[] => {
        const group = groupMap.get(id);
        if (!group) {
          return [];
        }
        let ids = [...group.nodeIds];
        for (const childGroupId of group.groupIds) {
          ids = ids.concat(walk(childGroupId));
        }
        return ids;
      };
      return Array.from(new Set(walk(groupId)));
    },
    onSelect(payload: SelectPayload): void {
      this.contextMenu.visible = false;
      this.cancelLayerRename();
      this.selectedGroupId = "";
      if (!payload.id) {
        this.selectedId = "";
        this.selectedIds = [];
        return;
      }
      if (payload.additive) {
        if (this.selectedIds.includes(payload.id)) {
          const nextIds = this.selectedIds.filter((id) => id !== payload.id);
          this.selectedIds = nextIds;
          this.selectedId = nextIds[nextIds.length - 1] || "";
        } else {
          this.selectedIds = [...this.selectedIds, payload.id];
          this.selectedId = payload.id;
        }
        return;
      }
      this.selectedId = payload.id;
      this.selectedIds = [payload.id];
    },
    toggleLayerPanel(): void {
      if (this.showLayerPanel) {
        this.commitLayerRename();
      }
      this.showLayerPanel = !this.showLayerPanel;
    },
    onLayerEntryDblClick(entry: LayerEntry): void {
      this.startLayerRename(entry.id, entry.name);
    },
    onLayerEntryClick(entry: LayerEntry, event: MouseEvent): void {
      if (this.renamingEntryId) {
        return;
      }
      if (entry.isVirtualGroup) {
        const groupNodeIds = this.getGroupNodeIds(entry.id);
        this.selectedGroupId = entry.id;
        this.selectedIds = groupNodeIds;
        this.selectedId = groupNodeIds[groupNodeIds.length - 1] || "";
        this.contextMenu.visible = false;
        return;
      }
      this.onSelect({
        id: entry.id,
        additive: event.metaKey || event.ctrlKey
      });
      this.contextMenu.visible = false;
    },
    onGlobalPointerDown(event: PointerEvent): void {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      if (!target.closest(".layer-manager")) {
        this.commitLayerRename();
        this.showLayerPanel = false;
      }
      const inContextMenu = Boolean(target.closest(".node-context-menu"));
      const onContextItem = Boolean(target.closest(".ctx-item"));
      if (!inContextMenu || !onContextItem) {
        this.contextMenu.visible = false;
      }
    },
    startLayerRename(entryId: string, name: string): void {
      this.renamingEntryId = entryId;
      this.renamingValue = name;
      this.contextMenu.visible = false;
      this.$nextTick(() => {
        const inputRef = this.$refs.layerRenameInput as
          | HTMLInputElement
          | HTMLInputElement[]
          | undefined;
        const input = Array.isArray(inputRef) ? inputRef[0] : inputRef;
        if (input) {
          input.focus();
          input.select();
        }
      });
    },
    commitLayerRename(): void {
      if (!this.renamingEntryId) {
        return;
      }
      const entryId = this.renamingEntryId;
      const nextName = this.renamingValue.trim();
      this.cancelLayerRename();
      if (!nextName) {
        return;
      }

      const groupIndex = this.virtualGroups.findIndex((group) => group.id === entryId);
      if (groupIndex >= 0) {
        const currentGroup = this.virtualGroups[groupIndex];
        if (currentGroup.name === nextName) {
          return;
        }
        this.virtualGroups = this.virtualGroups.map((group) =>
          group.id === entryId
            ? {
                ...group,
                name: nextName
              }
            : group
        );
        return;
      }

      const renamed = this.renameNodeById(this.rootNode, entryId, nextName);
      if (renamed !== this.rootNode) {
        this.rootNode = renamed;
      }
    },
    cancelLayerRename(): void {
      this.renamingEntryId = "";
      this.renamingValue = "";
    },
    onLayerRenameKeydown(event: KeyboardEvent): void {
      if (event.key === "Enter") {
        event.preventDefault();
        this.commitLayerRename();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        this.cancelLayerRename();
      }
    },
    renameNodeById(node: DesignerNode, targetId: string, nextName: string): DesignerNode {
      const renamedSelf = node.id === targetId && node.name !== nextName;
      let changedChild = false;
      const nextChildren = node.children.map((child) => {
        const nextChild = this.renameNodeById(child, targetId, nextName);
        if (nextChild !== child) {
          changedChild = true;
        }
        return nextChild;
      });
      if (!renamedSelf && !changedChild) {
        return node;
      }
      return {
        ...node,
        name: renamedSelf ? nextName : node.name,
        children: changedChild ? nextChildren : node.children
      };
    },
    openContextMenu(nodeId: string, x: number, y: number): void {
      this.commitLayerRename();
      const useSelectedSet = this.selectedIds.includes(nodeId) && this.selectedIds.length > 1;
      const targetIds = useSelectedSet ? [...this.selectedIds] : [nodeId];
      this.selectedGroupId = "";
      if (!useSelectedSet) {
        this.selectedId = nodeId;
        this.selectedIds = [nodeId];
      }
      this.contextMenu.nodeId = nodeId;
      this.contextMenu.targetIds = targetIds;
      this.contextMenu.visible = true;
      this.contextMenu.x = Math.max(6, Math.min(window.innerWidth - 166, x));
      this.contextMenu.y = Math.max(6, Math.min(window.innerHeight - 220, y));
    },
    onNodeContextMenu(payload: { nodeId: string; x: number; y: number }): void {
      this.openContextMenu(payload.nodeId, payload.x, payload.y);
    },
    onContextMenuAction(
      action: "up" | "down" | "top" | "bottom" | "copy" | "delete" | "group"
    ): void {
      const targetIds =
        this.contextMenu.targetIds.length > 0 ? [...this.contextMenu.targetIds] : [...this.selectedIds];
      if (targetIds.length === 0) {
        this.contextMenu.visible = false;
        return;
      }
      const primaryId = this.contextMenu.nodeId || this.selectedId || targetIds[0];

      if (action === "copy") {
        this.copySelectionToClipboard();
      } else if (action === "delete") {
        this.removeNodes(targetIds);
      } else if (action === "group") {
        this.createGroupFromSelection(targetIds);
      } else {
        const moved = moveNodeLayer(this.rootNode, primaryId, action);
        if (moved.moved) {
          this.rootNode = moved.nextNode;
          this.selectedId = primaryId;
          this.selectedIds = [primaryId];
        }
      }

      this.contextMenu.visible = false;
    },
    onMoveToGroup(groupId: string): void {
      const targets =
        this.contextMenu.targetIds.length > 0 ? [...this.contextMenu.targetIds] : [...this.selectedIds];
      if (targets.length === 0) {
        return;
      }
      if (groupId === "__ungrouped__") {
        this.detachNodesFromGroups(targets);
      } else {
        this.attachNodesToGroup(targets, groupId);
      }
      this.selectedGroupId = "";
      this.selectedId = "";
      this.selectedIds = [];
      this.contextMenu.visible = false;
    },
    onAddGroup(): void {
      this.createVirtualGroup();
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
    createGroupFromSelection(targetIds: string[]): void {
      const filtered = targetIds.filter((id) => id !== this.rootNode.id);
      if (filtered.length < 2) {
        return;
      }
      this.createVirtualGroup(filtered);
      this.selectedId = "";
      this.selectedIds = [];
    },
    copySelectionToClipboard(): void {
      if (this.selectedIds.length === 0) {
        return;
      }
      this.clipboardItems = createClipboardFromIds(this.rootNode, this.selectedIds);
    },
    pasteFromClipboard(): void {
      if (this.clipboardItems.length === 0) {
        return;
      }
      const selectedNode = this.selectedId ? this.findNode(this.selectedId) : null;
      const fallbackParentId =
        this.selectedIds.length === 1 && selectedNode && selectedNode.acceptsChildren
          ? this.selectedId
          : this.rootNode.id;
      const pasted = pasteClipboardItems(this.rootNode, this.clipboardItems, fallbackParentId);
      if (pasted.pastedIds.length > 0) {
        this.rootNode = pasted.nextNode;
        this.cleanupVirtualGroups();
        this.selectedIds = pasted.pastedIds;
        this.selectedId = pasted.pastedIds[pasted.pastedIds.length - 1] || "";
      }
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
      if (removedAny) {
        this.rootNode = next;
        this.cleanupVirtualGroups();
        this.selectedId = "";
        this.selectedIds = [];
      }
    },
    setupViewportObserver(): void {
      const viewport = this.$refs.canvasViewport as HTMLElement | undefined;
      if (!viewport || typeof ResizeObserver === "undefined") {
        return;
      }
      this.viewportObserver = new ResizeObserver(() => {
        this.updateViewportWidth();
      });
      this.viewportObserver.observe(viewport);
    },
    teardownViewportObserver(): void {
      if (this.viewportObserver) {
        this.viewportObserver.disconnect();
      }
      this.viewportObserver = null;
    },
    updateViewportWidth(): void {
      const viewport = this.$refs.canvasViewport as HTMLElement | undefined;
      if (!viewport) {
        return;
      }
      this.viewportWidth = Math.max(1, viewport.clientWidth);
      if (this.autoFitToViewport) {
        this.resetScaleToFit();
      }
    },
    resetScaleToFit(): void {
      const fitPercent = Math.max(1, Math.min(400, Number((this.fitScale * 100).toFixed(2))));
      this.scalePercent = fitPercent;
    },
    onScaleSliderInput(): void {
      this.autoFitToViewport = false;
      this.scalePercent = Math.max(1, Math.min(400, Number((this.scalePercent || 1).toFixed(2))));
    },
    onExportSchema(): void {
      const schema = createDesignSchemaFromRoot(this.rootNode, {
        canvasWidth: this.canvasWidth,
        canvasHeight: this.canvasHeight,
        scalePercent: this.scalePercent,
        layerGroups: this.virtualGroups.map((group) => ({
          id: group.id,
          name: group.name,
          parentId: group.parentId,
          nodeIds: [...group.nodeIds],
          groupIds: [...group.groupIds]
        }))
      });

      console.log("[BeeDataViewSchema]", schema);
    },
    onPresetChange(): void {
      if (this.selectedPresetKey === CUSTOM_PRESET_KEY) {
        return;
      }
      const preset = RESOLUTION_PRESETS.find((item) => item.key === this.selectedPresetKey);
      if (!preset) {
        return;
      }
      this.inputCanvasWidth = preset.width;
      this.inputCanvasHeight = preset.height;
      this.applyCanvasConfig(true);
    },
    onCanvasSizeInput(): void {
      this.selectedPresetKey = CUSTOM_PRESET_KEY;
    },
    applyCanvasConfig(resetToFit = false): void {
      const rows = Math.max(1, Math.floor(this.inputRows || 1));
      const cols = Math.max(1, Math.floor(this.inputCols || 1));
      const gap = Math.max(0, Number(this.inputGap ?? 0));
      const canvasWidth = Math.max(1, Math.floor(this.inputCanvasWidth || 1));
      const canvasHeight = Math.max(1, Math.floor(this.inputCanvasHeight || 1));

      this.inputRows = rows;
      this.inputCols = cols;
      this.inputGap = gap;
      this.inputCanvasWidth = canvasWidth;
      this.inputCanvasHeight = canvasHeight;
      this.canvasWidth = canvasWidth;
      this.canvasHeight = canvasHeight;

      const sizing = calcCellSizeFromCanvas(rows, cols, canvasWidth, canvasHeight, gap);
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
      if (resetToFit) {
        this.autoFitToViewport = true;
      }
      this.$nextTick(() => {
        this.updateViewportWidth();
        if (resetToFit) {
          this.resetScaleToFit();
        }
      });
    },
    startExternalDrag(template: ComponentTemplate, event: PointerEvent): void {
      if (event.button !== 0) {
        return;
      }
      if (!this.isExternalDragLocking) {
        lockUserSelect();
        this.isExternalDragLocking = true;
      }
      this.externalDrag = {
        template,
        pointer: {
          x: event.clientX,
          y: event.clientY
        }
      };
      window.addEventListener("pointermove", this.onExternalDragMove);
      window.addEventListener("pointerup", this.onExternalDragEnd);
    },
    onExternalDragMove(event: PointerEvent): void {
      if (!this.externalDrag) {
        return;
      }
      this.externalDrag = {
        ...this.externalDrag,
        pointer: {
          x: event.clientX,
          y: event.clientY
        }
      };
    },
    onExternalDragEnd(): void {
      if (this.externalDrag) {
        const rootCanvas = this.$refs.rootCanvas as Vue & {
          commitExternalDrop?: () => boolean;
        };
        if (rootCanvas && typeof rootCanvas.commitExternalDrop === "function") {
          rootCanvas.commitExternalDrop();
        }
      }
      this.externalDrag = null;
      if (this.isExternalDragLocking) {
        unlockUserSelect();
        this.isExternalDragLocking = false;
      }
      this.clearExternalDragListeners();
    },
    clearExternalDragListeners(): void {
      window.removeEventListener("pointermove", this.onExternalDragMove);
      window.removeEventListener("pointerup", this.onExternalDragEnd);
    },
    onGlobalKeydown(event: KeyboardEvent): void {
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
      if (isMeta && lowerKey === "g") {
        event.preventDefault();
        this.createGroupFromSelection(this.selectedIds);
        return;
      }
      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }
      if (this.selectedIds.length === 0) {
        return;
      }

      event.preventDefault();
      this.removeNodes(this.selectedIds);
      this.contextMenu.visible = false;
    }
  }
});
</script>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 280px 1fr;
  background: radial-gradient(circle at 0% 0%, #eff6ff 0%, #f5f9ff 38%, #e9f1fb 100%);
}

.palette-panel {
  padding: 20px;
  border-right: 1px solid #c8d5e7;
  background: linear-gradient(180deg, #f8fbff 0%, #eef4fc 100%);
}

.palette-panel h2 {
  margin: 0 0 10px;
  font-size: 18px;
  color: #1f446d;
}

.panel-tip {
  margin: 0 0 16px;
  color: #4f6783;
  font-size: 13px;
}

.palette-item {
  width: 100%;
  border: 1px solid #9db5cf;
  background: #ffffff;
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  cursor: grab;
  color: #1f446d;
}

.palette-item:active {
  cursor: grabbing;
}

.item-name {
  font-weight: 600;
}

.item-size {
  font-size: 12px;
  color: #5f7590;
}

.workspace-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.workspace-toolbar {
  position: relative;
  z-index: 200;
  border-bottom: 1px solid #c5d4e7;
  background: rgba(248, 252, 255, 0.88);
  backdrop-filter: blur(4px);
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: center;
}

.field-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.field-group label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #2a4f77;
  font-size: 13px;
}

.field-group input,
.field-group select {
  width: 100px;
  padding: 5px 8px;
  border: 1px solid #a7bdd8;
  border-radius: 6px;
  background: #ffffff;
}

.zoom-field {
  min-width: 220px;
}

.zoom-slider {
  width: 120px;
}

.zoom-value {
  min-width: 48px;
  color: #1f4f7f;
  font-weight: 600;
}

.apply-btn {
  border: 1px solid #1f64ad;
  background: #2c75c3;
  color: #ffffff;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
}

.schema-btn {
  border: 1px solid #2a7a4f;
  background: #2d9a62;
  color: #ffffff;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
}

.layer-manager {
  position: relative;
  z-index: 220;
}

.layer-btn {
  border: 1px solid #2e6fb7;
  background: #ffffff;
  color: #2a5684;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
}

.layer-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 280px;
  max-height: 360px;
  overflow: auto;
  border: 1px solid #b3c6db;
  background: #ffffff;
  box-shadow: 0 10px 24px rgba(20, 44, 71, 0.18);
  z-index: 260;
}

.layer-root-row {
  font-size: 12px;
  color: #4b6686;
  padding: 8px 10px;
  border-bottom: 1px solid #e0e8f2;
}

.layer-empty {
  font-size: 12px;
  color: #6f839b;
  padding: 10px;
}

.layer-row {
  width: 100%;
  border: 0;
  border-top: 1px solid #edf2f8;
  background: #ffffff;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  cursor: pointer;
  text-align: left;
  color: #2a537f;
}

.layer-row.is-group-row {
  font-weight: 600;
  color: #244a72;
  background: #f7fbff;
}

.layer-row:disabled {
  opacity: 1;
  cursor: default;
}

.layer-row.is-active {
  background: #eaf2fc;
}

.layer-kind {
  font-size: 11px;
  color: #6d84a0;
  min-width: 18px;
}

.layer-name {
  font-size: 12px;
  flex: 1;
}

.layer-name-input {
  flex: 1;
  min-width: 0;
  height: 22px;
  border: 1px solid #8eacd0;
  background: #ffffff;
  color: #1f456d;
  font-size: 12px;
  padding: 0 6px;
  outline: none;
}

.layer-name-input:focus {
  border-color: #2c75c3;
}

.layer-footer {
  border-top: 1px solid #e0e8f2;
  padding: 8px;
}

.layer-add-btn {
  width: 100%;
  border: 1px dashed #7c9cc0;
  background: #f7fbff;
  color: #305981;
  padding: 6px 8px;
  cursor: pointer;
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

.ctx-submenu-group {
  position: relative;
}

.ctx-item-with-submenu {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ctx-submenu-arrow {
  font-size: 11px;
  color: #6a85a3;
}

.ctx-submenu {
  display: none;
  position: absolute;
  left: calc(100% - 2px);
  top: -4px;
  min-width: 148px;
  border: 1px solid #b5c7db;
  background: #ffffff;
  box-shadow: 0 12px 24px rgba(15, 38, 63, 0.2);
  padding: 4px;
  z-index: 1;
}

.ctx-sub-item {
  white-space: nowrap;
}

.ctx-submenu-group:hover .ctx-submenu,
.ctx-submenu-group:focus-within .ctx-submenu {
  display: block;
}

.ctx-item.danger {
  color: #b63f3f;
}

.status-text {
  color: #365575;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.status-tip {
  color: #5d7490;
}

.metric {
  color: #2b537f;
}

.canvas-stage {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.canvas-viewport {
  min-width: 100%;
}

.canvas-scale-box {
  position: relative;
  margin: 0 auto;
}

.canvas-scale-layer {
  position: absolute;
  left: 0;
  top: 0;
}

@media (max-width: 1024px) {
  .app-shell {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .palette-panel {
    border-right: 0;
    border-bottom: 1px solid #c8d5e7;
  }

  .workspace-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
