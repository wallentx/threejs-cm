import assert from 'node:assert/strict';

export function assertClosedConsistentWinding(geometry, label, epsilon = 1e-5) {
  const positions = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const weldedIds = new Map();
  const vertexIds = [];

  for (let vertex = 0; vertex < positions.count; vertex++) {
    const key = [
      Math.round(positions.getX(vertex) / epsilon),
      Math.round(positions.getY(vertex) / epsilon),
      Math.round(positions.getZ(vertex) / epsilon)
    ].join(':');
    if (!weldedIds.has(key)) weldedIds.set(key, weldedIds.size);
    vertexIds.push(weldedIds.get(key));
  }

  const edgeUses = new Map();
  const count = index?.count ?? positions.count;
  for (let offset = 0; offset < count; offset += 3) {
    const triangle = [0, 1, 2].map(corner => vertexIds[
      index ? index.getX(offset + corner) : offset + corner
    ]);
    for (const [from, to] of [
      [triangle[0], triangle[1]],
      [triangle[1], triangle[2]],
      [triangle[2], triangle[0]]
    ]) {
      if (from === to) continue;
      const key = from < to ? `${from}:${to}` : `${to}:${from}`;
      const uses = edgeUses.get(key) ?? [];
      uses.push([from, to]);
      edgeUses.set(key, uses);
    }
  }

  for (const [edge, uses] of edgeUses) {
    assert.equal(uses.length, 2, `${label} edge ${edge} must be closed`);
    assert.deepEqual(
      uses[1],
      [uses[0][1], uses[0][0]],
      `${label} edge ${edge} must have opposite triangle directions`
    );
  }
}
