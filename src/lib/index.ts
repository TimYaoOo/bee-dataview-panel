import type { PluginFunction } from "vue";
import BeeDataViewPanel from "./BeeDataViewPanel.vue";
export { createDesignSchemaFromRoot, restoreRootFromDesignSchema } from "./schema";

const install: PluginFunction<never> = (Vue) => {
  Vue.component("BeeDataViewPanel", BeeDataViewPanel);
};

const BeeDataViewPanelPlugin = Object.assign(BeeDataViewPanel, {
  install
});

export { BeeDataViewPanel };
export type {
  ComponentTemplate,
  DesignerNode,
  ExternalDragSession,
  GridConfig,
  GridRect,
  Pointer,
  ResizeDirection
} from "../types/designer";
export type {
  BeeDataViewSchema,
  BeeLayerGroupSchema,
  BeeNodeGridSchema,
  BeeNodeSchema
} from "./types/schema";

export default BeeDataViewPanelPlugin;
