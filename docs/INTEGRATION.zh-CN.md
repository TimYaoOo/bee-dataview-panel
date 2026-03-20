# BeeDataViewPanel 接入文档（Vue 2.7）

## 1. 安装

```bash
yarn add bee-dataview-panel vue@^2.7.0
```

## 2. ESM 接入（推荐）

```ts
import Vue from "vue";
import BeeDataViewPanelPlugin, { BeeDataViewPanel } from "bee-dataview-panel";
import "bee-dataview-panel/style.css";

Vue.use(BeeDataViewPanelPlugin);
// 或局部注册：components: { BeeDataViewPanel }
```

## 3. UMD 接入

```html
<link rel="stylesheet" href="./dist/lib/style.css" />
<script src="https://unpkg.com/vue@2.7.16/dist/vue.min.js"></script>
<script src="./dist/lib/bee-dataview-panel.umd.js"></script>
<script>
  Vue.use(BeeDataViewPanel);
</script>
```

## 4. 组件定位

`BeeDataViewPanel` 只负责画布能力，不内置顶部工具栏与组件库 UI。

## 5. Props

| Prop | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `value` | `DesignerNode \| null` | `null` | 画布树（支持 `v-model`）。 |
| `rows` | `number` | `16` | 顶层画布网格行数。 |
| `cols` | `number` | `24` | 顶层画布网格列数。 |
| `canvasWidth` | `number` | `1600` | 画布逻辑宽（px）。 |
| `canvasHeight` | `number` | `900` | 画布逻辑高（px）。 |
| `scalePercent` | `number` | `100` | 缩放值（100 = 1:1）。 |
| `selectedId` | `string` | `""` | 当前主选中（可配合 `.sync`）。 |
| `selectedIds` | `string[]` | `[]` | 当前多选（可配合 `.sync`）。 |
| `externalDrag` | `ExternalDragSession \| null` | `null` | 外部拖拽会话。 |
| `allowExternalDrop` | `boolean` | `true` | 是否允许外部拖入。 |
| `enableBuiltinContextMenu` | `boolean` | `true` | 是否启用内置右键菜单。 |
| `enableBuiltinShortcuts` | `boolean` | `true` | 是否启用内置快捷键（复制/粘贴/删除）。 |

## 6. Events（详细）

### 6.1 事件载荷类型

```ts
type SelectPayload = { id: string; additive: boolean };
type SelectionChangePayload = { selectedId: string; selectedIds: string[] };
type NodeContextMenuPayload = { nodeId: string; x: number; y: number };
type RestoreCanvasConfigPayload = {
  canvasWidth: number;
  canvasHeight: number;
  rows: number;
  cols: number;
  gap: number;
  scalePercent: number;
};
```

### 6.2 事件列表

| 事件名 | 回调签名 | 触发时机 | 备注/副作用 |
| --- | --- | --- | --- |
| `input` | `(nextRoot: DesignerNode) => void` | 画布树发生变更时 | 用于 `v-model`。与 `change` 同时触发。 |
| `change` | `(nextRoot: DesignerNode) => void` | 同 `input` | 语义化变更事件。 |
| `schema-change` | `(nextSchema: BeeDataViewSchema) => void` | 每次 `input/change` 同步触发 | 输出完整精简 schema 快照。 |
| `select` | `(payload: SelectPayload) => void` | 用户在画布点击/多选时 | 仅由画布选择交互触发。 |
| `update:selectedId` | `(id: string) => void` | 内部选中主节点变化时 | 供 `.sync` 双向绑定。 |
| `update:selectedIds` | `(ids: string[]) => void` | 内部多选集合变化时 | 供 `.sync` 双向绑定。 |
| `selection-change` | `(payload: SelectionChangePayload) => void` | 任意选中态变化时 | 包含 `selectedId` 与 `selectedIds` 最新值。 |
| `node-context-menu` | `(payload: NodeContextMenuPayload) => void` | 用户右键节点时 | 无论内置右键菜单开关状态都会触发。 |
| `external-drop-commit` | `() => void` | 外部拖拽提交成功时 | 仅在确实落入画布并生成节点后触发。 |
| `restore-canvas-config` | `(payload: RestoreCanvasConfigPayload) => void` | `setDesignSchema` 恢复成功后 | 用于外层工具栏同步分辨率/网格/缩放。 |
| `restore-error` | `(error: unknown) => void` | `setDesignSchema` 恢复失败时 | 组件内部会捕获错误并上抛该事件。 |

## 7. Ref Methods（详细）

### 7.1 Ref 类型

```ts
interface BeeDataViewPanelRef {
  commitExternalDrop(): boolean;
  getSchema(): DesignerNode;
  setSchema(nextRoot: DesignerNode): void;
  getDesignSchema(): BeeDataViewSchema;
  setDesignSchema(schema: BeeDataViewSchema): void;
  clearSelection(): void;
  copySelectionToClipboard(): void;
  pasteFromClipboard(): void;
  removeNodes(targetIds: string[]): void;
}
```

### 7.2 方法列表

| 方法 | 入参 | 返回值 | 调用时机 | 行为说明 |
| --- | --- | --- | --- | --- |
| `commitExternalDrop` | 无 | `boolean` | 外部拖拽 `pointerup` 时或手动调用 | 尝试把当前 `externalDrag` 提交到画布。成功返回 `true`，并触发 `external-drop-commit`。 |
| `getSchema` | 无 | `DesignerNode` | 需要拿当前画布树快照时 | 返回深拷贝，不会影响组件内部状态。 |
| `setSchema` | `nextRoot: DesignerNode` | `void` | 外部直接覆盖画布树时 | 覆盖当前树并触发 `input/change/schema-change`。 |
| `getDesignSchema` | 无 | `BeeDataViewSchema` | 保存设计稿时 | 导出精简 schema（含 `title/modifyTime/分辨率/网格/root/layerGroups`）。 |
| `setDesignSchema` | `schema: BeeDataViewSchema` | `void` | 打开/恢复设计稿时 | 恢复节点树并清空选中，成功触发 `restore-canvas-config` + `input/change/schema-change`，失败触发 `restore-error`。 |
| `clearSelection` | 无 | `void` | 外部需要主动清空选中时 | 清空选中并触发 `update:selectedId/update:selectedIds/selection-change`。 |
| `copySelectionToClipboard` | 无 | `void` | 需要复制当前选中节点时 | 若无选中则无操作；复制到组件内部剪贴板。 |
| `pasteFromClipboard` | 无 | `void` | 需要粘贴时 | 若剪贴板为空无操作；成功时触发 `input/change/schema-change` 与选中变更事件。 |
| `removeNodes` | `targetIds: string[]` | `void` | 外部主动删除指定节点时 | 删除成功后清空选中并触发 `input/change/schema-change` 与选中变更事件。 |

### 7.3 事件联动说明

- `setSchema` 不会自动触发 `selection-change`（除非你外层同步调整选中）。
- `setDesignSchema` 会主动清空选中，因此会触发 `selection-change`。
- `commitExternalDrop` 成功后通常会同时触发：
  1. `input/change/schema-change`（节点落盘）
  2. `selection-change`（新节点被选中）
  3. `external-drop-commit`

## 8. 使用示例（监听 + 调用）

```vue
<BeeDataViewPanel
  ref="panel"
  v-model="rootNode"
  :rows="rows"
  :cols="cols"
  :canvas-width="canvasWidth"
  :canvas-height="canvasHeight"
  :scale-percent="scalePercent"
  @schema-change="onSchemaChange"
  @selection-change="onSelectionChange"
  @restore-canvas-config="onRestoreCanvasConfig"
  @restore-error="onRestoreError"
/>
```

```ts
methods: {
  onSchemaChange(schema) {
    // 持久化
  },
  onRestoreCanvasConfig(cfg) {
    this.canvasWidth = cfg.canvasWidth;
    this.canvasHeight = cfg.canvasHeight;
    this.rows = cfg.rows;
    this.cols = cfg.cols;
    this.scalePercent = cfg.scalePercent;
  },
  loadDesign(schema) {
    const panel = this.$refs.panel;
    panel.setDesignSchema(schema);
  },
  exportDesign() {
    const panel = this.$refs.panel;
    return panel.getDesignSchema();
  }
}
```

## 9. Schema 详解

详见：[docs/SCHEMA.zh-CN.md](./SCHEMA.zh-CN.md)

## 10. 精简 Schema 示例

```json
{
  "title": "运营大屏",
  "modifyTime": "2026-03-17T08:00:00.000Z",
  "width": 1920,
  "height": 1080,
  "rows": 108,
  "cols": 192,
  "gap": 1,
  "scalePercent": 100,
  "root": {
    "id": "root_canvas",
    "name": "RootCanvas",
    "rect": { "x": 0, "y": 0, "w": 192, "h": 108 },
    "zIndex": 0,
    "component": {},
    "grid": { "rows": 108, "cols": 192, "gap": 1 },
    "children": []
  },
  "layerGroups": []
}
```
