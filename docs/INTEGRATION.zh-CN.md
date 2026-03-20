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

- `value?: DesignerNode` 画布树（支持 `v-model`）
- `rows: number` 顶层网格行数
- `cols: number` 顶层网格列数
- `canvasWidth: number` 画布逻辑宽（px）
- `canvasHeight: number` 画布逻辑高（px）
- `scalePercent: number` 缩放值
- `selectedId: string` 当前主选中
- `selectedIds: string[]` 当前多选
- `externalDrag: ExternalDragSession | null` 外部拖拽会话
- `allowExternalDrop: boolean`
- `enableBuiltinContextMenu: boolean`
- `enableBuiltinShortcuts: boolean`

## 6. Events

- `input(nextSchema: DesignerNode)`
- `change(nextSchema: DesignerNode)`
- `schema-change(nextDesignSchema: BeeDataViewSchema)`
- `select(payload)`
- `selection-change(payload)`
- `update:selectedId(nextId)`
- `update:selectedIds(nextIds)`
- `node-context-menu(payload)`
- `external-drop-commit`
- `restore-canvas-config(payload)`
- `restore-error(error)`

## 7. Ref Methods

- `commitExternalDrop(): boolean`
- `getSchema(): DesignerNode`
- `setSchema(nextRoot: DesignerNode): void`
- `getDesignSchema(): BeeDataViewSchema`
- `setDesignSchema(schema: BeeDataViewSchema): void`
- `clearSelection(): void`
- `copySelectionToClipboard(): void`
- `pasteFromClipboard(): void`
- `removeNodes(targetIds: string[]): void`

纯函数（不依赖实例）：

- `createDesignSchemaFromRoot(rootNode, options)`
- `restoreRootFromDesignSchema(schema)`

## 8. Schema 详解

详见：[docs/SCHEMA.zh-CN.md](./SCHEMA.zh-CN.md)

## 9. 精简 Schema 示例

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
