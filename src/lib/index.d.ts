import type Vue from "vue";
import type { VueConstructor, PluginObject } from "vue";
import type { DesignerNode } from "./types/designer";
import type { BeeDataViewSchema } from "./types/schema";

export declare function createDesignSchemaFromRoot(
  rootNode: DesignerNode,
  options: {
    canvasWidth: number;
    canvasHeight: number;
    scalePercent: number;
    title?: string;
    layerGroups?: BeeDataViewSchema["layerGroups"];
  }
): BeeDataViewSchema;

export declare function restoreRootFromDesignSchema(schema: BeeDataViewSchema): {
  rootNode: DesignerNode;
  canvasConfig: {
    canvasWidth: number;
    canvasHeight: number;
    rows: number;
    cols: number;
    gap: number;
    scalePercent: number;
  };
};

declare class BeeDataViewPanelInstance extends Vue {
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

declare const BeeDataViewPanel: VueConstructor<BeeDataViewPanelInstance>;

declare const BeeDataViewPanelPlugin: PluginObject<never> & {
  BeeDataViewPanel: typeof BeeDataViewPanel;
};

export { BeeDataViewPanel, BeeDataViewPanelInstance };
export * from "./types/designer";
export * from "./types/schema";

export default BeeDataViewPanelPlugin;
