# bee-dataview-panel

Vue 2.7 大屏设计器画布组件（画布亦是组件，组件亦是画布）。

支持导出/导入完整设计 Schema（画布分辨率、网格、组件占位字段、嵌套子面板、层级关系），用于设计态内容完整还原。

## 本地调试

```bash
yarn install
yarn dev
```

> 现有调试界面（组件栏 + 顶部工具栏）会继续保留，便于联调。

## 构建

```bash
# 调试壳构建
yarn build:app

# 组件库构建（ESM + UMD + d.ts）
yarn build:lib

# 全量构建
yarn build:all
```

## 产物

- `dist/lib/bee-dataview-panel.es.js`
- `dist/lib/bee-dataview-panel.umd.js`
- `dist/lib/style.css`
- `dist/lib/index.d.ts`

## 接入文档

详见：[docs/INTEGRATION.zh-CN.md](./docs/INTEGRATION.zh-CN.md)

Schema 详尽字段说明：[docs/SCHEMA.zh-CN.md](./docs/SCHEMA.zh-CN.md)
