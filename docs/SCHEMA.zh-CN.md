# BeeDataViewPanel Schema 字段说明（精简版）

本文档对应当前实现的精简 Schema 结构。

## 1. 顶层结构

```ts
interface BeeDataViewSchema {
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
```

## 2. 顶层字段详解

| 字段 | 类型 | 必填 | 作用 |
| --- | --- | --- | --- |
| `title` | `string` | 是 | 设计稿标题。 |
| `modifyTime` | `string` | 是 | 最近修改时间（ISO 8601）。 |
| `width` | `number` | 是 | 画布分辨率宽（px）。 |
| `height` | `number` | 是 | 画布分辨率高（px）。 |
| `rows` | `number` | 是 | 顶层画布网格行数。 |
| `cols` | `number` | 是 | 顶层画布网格列数。 |
| `gap` | `number` | 是 | 顶层画布网格间隙。 |
| `scalePercent` | `number` | 是 | 设计器缩放比例，100 表示 1:1。 |
| `root` | `BeeNodeSchema` | 是 | 节点树根（画布节点），包含全部组件与子面板。 |
| `layerGroups` | `BeeLayerGroupSchema[]` | 是 | 虚拟图层组信息（用于图层管理）。 |

## 3. root / node 结构

```ts
interface BeeNodeSchema {
  id: string;
  name: string;
  rect: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  zIndex: number;
  grid?: BeeNodeGridSchema;
  component: Record<string, unknown>;
  children: BeeNodeSchema[];
}
```

### 3.1 节点字段详解

| 字段 | 类型 | 必填 | 作用 |
| --- | --- | --- | --- |
| `id` | `string` | 是 | 节点唯一 ID。 |
| `name` | `string` | 是 | 节点显示名称。 |
| `rect.x` | `number` | 是 | 相对父节点网格的列坐标。 |
| `rect.y` | `number` | 是 | 相对父节点网格的行坐标。 |
| `rect.w` | `number` | 是 | 节点占用列数。 |
| `rect.h` | `number` | 是 | 节点占用行数。 |
| `zIndex` | `number` | 是 | 同级层级顺序。 |
| `grid` | `BeeNodeGridSchema` | 否 | 仅“可承载子节点”的面板类节点需要。 |
| `component` | `Record<string, unknown>` | 是 | 组件内容占位字段，当前固定写 `{}`。 |
| `children` | `BeeNodeSchema[]` | 是 | 子节点（递归）。 |

## 4. grid（子面板网格）

```ts
interface BeeNodeGridSchema {
  rows: number;
  cols: number;
  gap: number;
}
```

| 字段 | 类型 | 必填 | 作用 |
| --- | --- | --- | --- |
| `rows` | `number` | 是 | 子面板网格行数。 |
| `cols` | `number` | 是 | 子面板网格列数。 |
| `gap` | `number` | 是 | 子面板网格间隙。 |

## 5. component（占位字段）

```ts
type component = Record<string, unknown>;
```

| 字段 | 类型 | 必填 | 作用 |
| --- | --- | --- | --- |
| `component` | `Record<string, unknown>` | 是 | 当前作为内容占位，默认 `{}`。后续再扩展具体组件协议。 |

## 6. layerGroups（虚拟图层组）

```ts
interface BeeLayerGroupSchema {
  id: string;
  name: string;
  parentId: string | null;
  nodeIds: string[];
  groupIds: string[];
}
```

| 字段 | 类型 | 必填 | 作用 |
| --- | --- | --- | --- |
| `id` | `string` | 是 | 图层组 ID。 |
| `name` | `string` | 是 | 图层组名称。 |
| `parentId` | `string \| null` | 是 | 父图层组 ID。 |
| `nodeIds` | `string[]` | 是 | 组内直接挂载的节点 ID。 |
| `groupIds` | `string[]` | 是 | 子图层组 ID。 |

## 7. 还原行为（当前实现）

- 顶层画布按 `width/height/rows/cols/gap/scalePercent` 恢复。
- `root` 递归恢复全部节点树。
- 节点有 `grid` 则作为“子面板”恢复；无 `grid` 视为普通组件。
- 节点 `type` 不在 schema 中存储，恢复时由结构推断（有子网格/子节点则 `container`，否则 `component`；根节点固定 `canvas`）。
- `children` 按 `zIndex` 排序还原层级。
- 非法 schema（缺失 `root`）会抛恢复错误。

## 8. 示例

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
    "children": [
      {
        "id": "panel_A",
        "name": "子面板 A",
        "rect": { "x": 2, "y": 2, "w": 80, "h": 40 },
        "zIndex": 1,
        "component": {},
        "grid": { "rows": 24, "cols": 40, "gap": 1 },
        "children": [
          {
            "id": "bar_1",
            "name": "柱状图",
            "rect": { "x": 1, "y": 1, "w": 16, "h": 10 },
            "zIndex": 1,
            "component": {},
            "children": []
          }
        ]
      }
    ]
  },
  "layerGroups": []
}
```
