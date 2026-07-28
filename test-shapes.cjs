const THREE = require('three');
const fs = require('fs');

function svg(shape, id) {
  let path = '';
  for (const action of shape.curves) {
    if (action.type === 'LineCurve') {
      path += ` L ${action.v2.x} ${-action.v2.y}`;
    } else if (action.type === 'CubicBezierCurve') {
      path += ` C ${action.v1.x} ${-action.v1.y}, ${action.v2.x} ${-action.v2.y}, ${action.v3.x} ${-action.v3.y}`;
    }
  }
  let start = shape.currentPoint; 
  // actually THREE.Shape starts with moveTo. The curves array has the rest.
  return `<svg width="800" height="400" viewBox="-0.1 -0.2 1.2 0.4" xmlns="http://www.w3.org/2000/svg">
    <path d="M ${shape.curves[0].v1.x} ${-shape.curves[0].v1.y} ${path}" fill="none" stroke="black" stroke-width="0.005"/>
  </svg>`;
}

// ... I'll just write the code directly instead of making an SVG since I can visualize coordinates well enough.
