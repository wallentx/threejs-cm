const fs = require('fs');
const THREE = require('three');

function mas38StockShape(spec) {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.04);
  shape.lineTo(0.01, -0.15);
  shape.lineTo(0.08, -0.15);
  shape.lineTo(spec.stockEnd, -0.07);
  shape.lineTo(spec.stockEnd, -0.02);
  shape.lineTo(0, -0.04);
  return shape;
}

function fm2429StockShape(spec) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.01);
  shape.lineTo(0, -0.14);
  shape.lineTo(0.05, -0.14);
  shape.bezierCurveTo(0.15, -0.14, 0.25, -0.07, spec.stockEnd, -0.05);
  shape.lineTo(spec.stockEnd, 0.01);
  shape.lineTo(0, 0.01);
  return shape;
}

function mas36StockShape(spec) {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.01);
  shape.lineTo(0.01, -0.12);
  shape.lineTo(0.12, -0.12);
  shape.bezierCurveTo(0.25, -0.12, 0.28, -0.11, 0.28, -0.07);
  shape.lineTo(spec.stockEnd, -0.045);
  shape.lineTo(spec.stockEnd, -0.005);
  shape.lineTo(0.28, -0.005);
  shape.bezierCurveTo(0.15, -0.005, 0.05, -0.025, 0, -0.01);
  return shape;
}

function getPath(shape) {
  let path = `M ${shape.curves[0].v1.x} ${-shape.curves[0].v1.y}`;
  for (const c of shape.curves) {
    if (c.type === 'LineCurve') {
      path += ` L ${c.v2.x} ${-c.v2.y}`;
    } else if (c.type === 'CubicBezierCurve') {
      path += ` C ${c.v1.x} ${-c.v1.y}, ${c.v2.x} ${-c.v2.y}, ${c.v3.x} ${-c.v3.y}`;
    }
  }
  return path + ' Z';
}

function renderWeapon(id, spec, shapeFn) {
  const shape = shapeFn(spec);
  const path = getPath(shape);
  const svg = `<svg width="800" height="400" viewBox="-0.1 -0.2 1.2 0.4" xmlns="http://www.w3.org/2000/svg">
    <path d="${path}" fill="#ccc" stroke="black" stroke-width="0.005"/>
  </svg>`;
  fs.writeFileSync(id + '.svg', svg);
}

renderWeapon('mas38', { stockEnd: 0.18 }, mas38StockShape);
renderWeapon('mas36', { stockEnd: 0.38 }, mas36StockShape);
renderWeapon('fm2429', { stockEnd: 0.35 }, fm2429StockShape);

