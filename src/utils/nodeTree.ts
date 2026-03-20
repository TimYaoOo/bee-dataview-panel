import type { DesignerNode, GridRect } from "../types/designer";
import { clampRectToGrid } from "./grid";

export type LayerMoveAction = "up" | "down" | "top" | "bottom";

export type ClipboardItem = {
  sourceParentId: string;
  snapshot: DesignerNode;
};

type UpdateMeta = {
  moved?: boolean;
  duplicated?: boolean;
  newNodeId?: string;
};

type UpdateResult = {
  nextNode: DesignerNode;
  updated: boolean;
  meta?: UpdateMeta;
};

type ParentInfo = {
  parentId: string;
  childIndex: number;
};

export function createNodeId(prefix = "node"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`;
}

export function maxZIndex(nodes: DesignerNode[]): number {
  if (nodes.length === 0) {
    return 0;
  }
  return nodes.reduce((acc, node) => Math.max(acc, node.zIndex), nodes[0].zIndex);
}

function normalizeChildrenZIndex(children: DesignerNode[]): DesignerNode[] {
  return children.map((child, index) => ({
    ...child,
    zIndex: index + 1
  }));
}

function updateParentByChildId(
  node: DesignerNode,
  targetId: string,
  updater: (
    parent: DesignerNode,
    children: DesignerNode[],
    targetIndex: number
  ) => { children: DesignerNode[]; meta?: UpdateMeta }
): UpdateResult {
  const targetIndex = node.children.findIndex((child) => child.id === targetId);
  if (targetIndex >= 0) {
    const updated = updater(node, [...node.children], targetIndex);
    return {
      nextNode: {
        ...node,
        children: normalizeChildrenZIndex(updated.children)
      },
      updated: true,
      meta: updated.meta
    };
  }

  let hasUpdated = false;
  let collectedMeta: UpdateMeta | undefined;
  const nextChildren = node.children.map((child) => {
    const nested = updateParentByChildId(child, targetId, updater);
    if (nested.updated) {
      hasUpdated = true;
      collectedMeta = nested.meta;
      return nested.nextNode;
    }
    return child;
  });

  if (!hasUpdated) {
    return {
      nextNode: node,
      updated: false
    };
  }

  return {
    nextNode: {
      ...node,
      children: nextChildren
    },
    updated: true,
    meta: collectedMeta
  };
}

function cloneNodeWithNewIds(node: DesignerNode): DesignerNode {
  return {
    ...node,
    id: createNodeId(node.acceptsChildren ? "grp" : "cmp"),
    children: node.children.map((child) => cloneNodeWithNewIds(child))
  };
}

function deepCopyNode(node: DesignerNode): DesignerNode {
  return {
    ...node,
    rect: { ...node.rect },
    grid: { ...node.grid },
    props: { ...node.props },
    children: node.children.map((child) => deepCopyNode(child))
  };
}

function isDescendant(node: DesignerNode, targetId: string): boolean {
  if (node.id === targetId) {
    return true;
  }
  return node.children.some((child) => isDescendant(child, targetId));
}

function findParentInfoByChildId(
  node: DesignerNode,
  childId: string,
  parentId = node.id
): ParentInfo | null {
  const directIndex = node.children.findIndex((child) => child.id === childId);
  if (directIndex >= 0) {
    return {
      parentId,
      childIndex: directIndex
    };
  }
  for (const child of node.children) {
    const nested = findParentInfoByChildId(child, childId, child.id);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function insertNodeToParent(
  root: DesignerNode,
  parentId: string,
  nodeToInsert: DesignerNode
): { nextNode: DesignerNode; inserted: boolean } {
  if (root.id === parentId) {
    if (!root.acceptsChildren) {
      return { nextNode: root, inserted: false };
    }
    const adjustedRect = clampRectToGrid(nodeToInsert.rect, root.grid, 1, 1);
    const adjustedNode: DesignerNode = {
      ...nodeToInsert,
      rect: adjustedRect
    };
    return {
      nextNode: {
        ...root,
        children: normalizeChildrenZIndex([...root.children, adjustedNode])
      },
      inserted: true
    };
  }

  let inserted = false;
  const nextChildren = root.children.map((child) => {
    if (inserted) {
      return child;
    }
    const nested = insertNodeToParent(child, parentId, nodeToInsert);
    if (nested.inserted) {
      inserted = true;
      return nested.nextNode;
    }
    return child;
  });

  if (!inserted) {
    return { nextNode: root, inserted: false };
  }

  return {
    nextNode: {
      ...root,
      children: nextChildren
    },
    inserted: true
  };
}

function extractNodeById(
  root: DesignerNode,
  targetId: string
): { nextNode: DesignerNode; extracted: DesignerNode | null; extractedParentId: string } {
  let extracted: DesignerNode | null = null;
  let extractedParentId = "";
  const nextChildren: DesignerNode[] = [];

  for (const child of root.children) {
    if (child.id === targetId) {
      extracted = child;
      extractedParentId = root.id;
      continue;
    }
    const nested = extractNodeById(child, targetId);
    if (nested.extracted) {
      extracted = nested.extracted;
      extractedParentId = nested.extractedParentId;
    }
    nextChildren.push(nested.nextNode);
  }

  return {
    nextNode: {
      ...root,
      children: normalizeChildrenZIndex(nextChildren)
    },
    extracted,
    extractedParentId
  };
}

export function findNodeById(node: DesignerNode, targetId: string): DesignerNode | null {
  if (node.id === targetId) {
    return node;
  }
  for (const child of node.children) {
    const found = findNodeById(child, targetId);
    if (found) {
      return found;
    }
  }
  return null;
}

export function updateDirectChildRect(
  parent: DesignerNode,
  childId: string,
  rect: GridRect
): DesignerNode {
  return {
    ...parent,
    children: parent.children.map((child) =>
      child.id === childId ? { ...child, rect: { ...rect } } : child
    )
  };
}

export function replaceDirectChild(parent: DesignerNode, updatedChild: DesignerNode): DesignerNode {
  return {
    ...parent,
    children: parent.children.map((child) => (child.id === updatedChild.id ? updatedChild : child))
  };
}

export function moveNodeLayer(
  root: DesignerNode,
  targetId: string,
  action: LayerMoveAction
): { nextNode: DesignerNode; moved: boolean } {
  const result = updateParentByChildId(root, targetId, (_parent, children, targetIndex) => {
    const nextChildren = [...children];
    let moved = false;

    if (action === "up" && targetIndex < nextChildren.length - 1) {
      const tmp = nextChildren[targetIndex + 1];
      nextChildren[targetIndex + 1] = nextChildren[targetIndex];
      nextChildren[targetIndex] = tmp;
      moved = true;
    } else if (action === "down" && targetIndex > 0) {
      const tmp = nextChildren[targetIndex - 1];
      nextChildren[targetIndex - 1] = nextChildren[targetIndex];
      nextChildren[targetIndex] = tmp;
      moved = true;
    } else if (action === "top" && targetIndex < nextChildren.length - 1) {
      const [target] = nextChildren.splice(targetIndex, 1);
      nextChildren.push(target);
      moved = true;
    } else if (action === "bottom" && targetIndex > 0) {
      const [target] = nextChildren.splice(targetIndex, 1);
      nextChildren.unshift(target);
      moved = true;
    }

    return {
      children: nextChildren,
      meta: { moved }
    };
  });

  return {
    nextNode: result.nextNode,
    moved: Boolean(result.meta?.moved)
  };
}

export function duplicateNodeById(
  root: DesignerNode,
  targetId: string
): { nextNode: DesignerNode; duplicated: boolean; newNodeId: string } {
  const result = updateParentByChildId(root, targetId, (parent, children, targetIndex) => {
    const source = children[targetIndex];
    const cloned = cloneNodeWithNewIds(source);
    const shiftedRect = clampRectToGrid(
      {
        ...cloned.rect,
        x: cloned.rect.x + 1,
        y: cloned.rect.y + 1
      },
      parent.grid,
      1,
      1
    );
    const clonedWithRect: DesignerNode = {
      ...cloned,
      rect: shiftedRect
    };

    const nextChildren = [...children];
    nextChildren.splice(targetIndex + 1, 0, clonedWithRect);

    return {
      children: nextChildren,
      meta: {
        duplicated: true,
        newNodeId: clonedWithRect.id
      }
    };
  });

  return {
    nextNode: result.nextNode,
    duplicated: Boolean(result.meta?.duplicated),
    newNodeId: result.meta?.newNodeId || ""
  };
}

export function duplicateNodesByIds(
  root: DesignerNode,
  targetIds: string[]
): { nextNode: DesignerNode; duplicatedIds: string[] } {
  const uniqueIds = Array.from(new Set(targetIds));
  let next = root;
  const duplicatedIds: string[] = [];
  for (const id of uniqueIds) {
    const duplicated = duplicateNodeById(next, id);
    if (duplicated.duplicated && duplicated.newNodeId) {
      next = duplicated.nextNode;
      duplicatedIds.push(duplicated.newNodeId);
    }
  }
  return {
    nextNode: next,
    duplicatedIds
  };
}

export function createClipboardFromIds(root: DesignerNode, targetIds: string[]): ClipboardItem[] {
  const uniqueIds = Array.from(new Set(targetIds));
  return uniqueIds
    .map((id) => {
      const node = findNodeById(root, id);
      const parentInfo = findParentInfoByChildId(root, id);
      if (!node || !parentInfo) {
        return null;
      }
      return {
        sourceParentId: parentInfo.parentId,
        snapshot: deepCopyNode(node)
      };
    })
    .filter((item): item is ClipboardItem => Boolean(item));
}

export function pasteClipboardItems(
  root: DesignerNode,
  items: ClipboardItem[],
  fallbackParentId: string
): { nextNode: DesignerNode; pastedIds: string[] } {
  if (items.length === 0) {
    return {
      nextNode: root,
      pastedIds: []
    };
  }
  let next = root;
  const pastedIds: string[] = [];

  for (const item of items) {
    const clone = cloneNodeWithNewIds(item.snapshot);
    const shifted = {
      ...clone,
      rect: {
        ...clone.rect,
        x: clone.rect.x + 1,
        y: clone.rect.y + 1
      }
    };
    const preferredParent = findNodeById(next, item.sourceParentId);
    const targetParentId =
      preferredParent && preferredParent.acceptsChildren ? item.sourceParentId : fallbackParentId;
    const inserted = insertNodeToParent(next, targetParentId, shifted);
    if (inserted.inserted) {
      next = inserted.nextNode;
      pastedIds.push(shifted.id);
    }
  }

  return {
    nextNode: next,
    pastedIds
  };
}

export function createGroupFromNodeIds(
  root: DesignerNode,
  nodeIds: string[],
  name = "层级组"
): { nextNode: DesignerNode; grouped: boolean; groupId: string } {
  const uniqueIds = Array.from(new Set(nodeIds));
  if (uniqueIds.length < 2) {
    return { nextNode: root, grouped: false, groupId: "" };
  }

  const parentInfos = uniqueIds.map((id) => findParentInfoByChildId(root, id));
  if (parentInfos.some((info) => !info)) {
    return { nextNode: root, grouped: false, groupId: "" };
  }
  const commonParentId = parentInfos[0]!.parentId;
  if (!parentInfos.every((info) => info!.parentId === commonParentId)) {
    return { nextNode: root, grouped: false, groupId: "" };
  }

  const firstId = uniqueIds[0];
  const result = updateParentByChildId(root, firstId, (parent, children) => {
    const selectedSet = new Set(uniqueIds);
    const selectedChildren = children.filter((child) => selectedSet.has(child.id));
    if (selectedChildren.length !== uniqueIds.length) {
      return { children };
    }

    const minX = Math.min(...selectedChildren.map((child) => child.rect.x));
    const minY = Math.min(...selectedChildren.map((child) => child.rect.y));
    const maxX = Math.max(...selectedChildren.map((child) => child.rect.x + child.rect.w));
    const maxY = Math.max(...selectedChildren.map((child) => child.rect.y + child.rect.h));
    const groupRect = clampRectToGrid(
      {
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY
      },
      parent.grid,
      1,
      1
    );

    const groupId = createNodeId("grp");
    const groupChildren = selectedChildren.map((child) => ({
      ...child,
      rect: {
        x: child.rect.x - groupRect.x,
        y: child.rect.y - groupRect.y,
        w: child.rect.w,
        h: child.rect.h
      }
    }));

    const groupNode: DesignerNode = {
      id: groupId,
      type: "group",
      name,
      rect: groupRect,
      grid: {
        rows: Math.max(1, groupRect.h),
        cols: Math.max(1, groupRect.w),
        cellWidth: parent.grid.cellWidth,
        cellHeight: parent.grid.cellHeight,
        gap: parent.grid.gap
      },
      acceptsChildren: true,
      zIndex: 0,
      props: {},
      children: normalizeChildrenZIndex(groupChildren)
    };

    const selectedIndices = children
      .map((child, index) => ({ child, index }))
      .filter(({ child }) => selectedSet.has(child.id))
      .map(({ index }) => index);
    const insertIndex = Math.min(...selectedIndices);

    const remaining = children.filter((child) => !selectedSet.has(child.id));
    const nextChildren = [...remaining];
    nextChildren.splice(insertIndex, 0, groupNode);

    return {
      children: nextChildren,
      meta: {
        moved: true,
        newNodeId: groupId
      }
    };
  });

  return {
    nextNode: result.nextNode,
    grouped: Boolean(result.meta?.moved),
    groupId: result.meta?.newNodeId || ""
  };
}

export function addEmptyGroup(
  root: DesignerNode,
  parentId: string,
  name = "层级组"
): { nextNode: DesignerNode; created: boolean; groupId: string } {
  const parent = findNodeById(root, parentId);
  if (!parent || !parent.acceptsChildren) {
    return { nextNode: root, created: false, groupId: "" };
  }
  const groupId = createNodeId("grp");
  const newGroup: DesignerNode = {
    id: groupId,
    type: "group",
    name,
    rect: {
      x: 0,
      y: 0,
      w: Math.min(6, parent.grid.cols),
      h: Math.min(4, parent.grid.rows)
    },
    grid: {
      rows: 12,
      cols: 12,
      cellWidth: parent.grid.cellWidth,
      cellHeight: parent.grid.cellHeight,
      gap: parent.grid.gap
    },
    acceptsChildren: true,
    zIndex: 0,
    props: {},
    children: []
  };
  const inserted = insertNodeToParent(root, parentId, newGroup);
  return {
    nextNode: inserted.nextNode,
    created: inserted.inserted,
    groupId: inserted.inserted ? groupId : ""
  };
}

export function moveNodeToGroup(
  root: DesignerNode,
  nodeId: string,
  targetGroupId: string
): { nextNode: DesignerNode; moved: boolean } {
  if (nodeId === targetGroupId || nodeId === root.id) {
    return { nextNode: root, moved: false };
  }
  const targetGroup = findNodeById(root, targetGroupId);
  const node = findNodeById(root, nodeId);
  if (!targetGroup || !targetGroup.acceptsChildren || !node) {
    return { nextNode: root, moved: false };
  }
  if (isDescendant(node, targetGroupId)) {
    return { nextNode: root, moved: false };
  }

  const extracted = extractNodeById(root, nodeId);
  if (!extracted.extracted) {
    return { nextNode: root, moved: false };
  }
  const inserted = insertNodeToParent(extracted.nextNode, targetGroupId, extracted.extracted);
  return {
    nextNode: inserted.nextNode,
    moved: inserted.inserted
  };
}

export function moveNodesToGroup(
  root: DesignerNode,
  nodeIds: string[],
  targetGroupId: string
): { nextNode: DesignerNode; movedCount: number } {
  let next = root;
  let movedCount = 0;
  for (const id of Array.from(new Set(nodeIds))) {
    const moved = moveNodeToGroup(next, id, targetGroupId);
    if (moved.moved) {
      next = moved.nextNode;
      movedCount += 1;
    }
  }
  return {
    nextNode: next,
    movedCount
  };
}

export function removeNodeById(
  node: DesignerNode,
  targetId: string
): { nextNode: DesignerNode; removed: boolean } {
  let removed = false;
  const nextChildren: DesignerNode[] = [];

  for (const child of node.children) {
    if (child.id === targetId) {
      removed = true;
      continue;
    }
    const nested = removeNodeById(child, targetId);
    if (nested.removed) {
      removed = true;
    }
    nextChildren.push(nested.nextNode);
  }

  return {
    nextNode: {
      ...node,
      children: normalizeChildrenZIndex(nextChildren)
    },
    removed
  };
}

export function removeNodesByIds(
  root: DesignerNode,
  targetIds: string[]
): { nextNode: DesignerNode; removedCount: number } {
  let next = root;
  let removedCount = 0;
  for (const id of Array.from(new Set(targetIds))) {
    const removed = removeNodeById(next, id);
    if (removed.removed) {
      next = removed.nextNode;
      removedCount += 1;
    }
  }
  return {
    nextNode: next,
    removedCount
  };
}
