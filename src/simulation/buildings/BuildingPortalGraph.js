function compareId(a, b) {
  return String(a).localeCompare(String(b));
}

export function createPortalGraph(descriptor, disabledPortalIds = []) {
  const disabled = new Set(disabledPortalIds);
  const adjacency = new Map();
  const add = (nodeId, edge) => {
    const edges = adjacency.get(nodeId) ?? [];
    edges.push(edge);
    adjacency.set(nodeId, edges);
  };

  for (const portal of descriptor.portals) {
    if (disabled.has(portal.id)) continue;
    add(portal.from, { portalId: portal.id, to: portal.to });
    add(portal.to, { portalId: portal.id, to: portal.from });
  }
  for (const edges of adjacency.values()) {
    edges.sort((a, b) => compareId(a.portalId, b.portalId) || compareId(a.to, b.to));
  }
  return adjacency;
}

export function findPortalPath(graph, from, to) {
  if (from === to) return [];
  const queue = [{ nodeId: from, path: [] }];
  const visited = new Set([from]);
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    for (const edge of graph.get(current.nodeId) ?? []) {
      if (visited.has(edge.to)) continue;
      const path = [...current.path, edge.portalId];
      if (edge.to === to) return path;
      visited.add(edge.to);
      queue.push({ nodeId: edge.to, path });
    }
  }
  return null;
}
