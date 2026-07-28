const THREE = require('three');

function createRifleStockShape(stockEnd) {
  const shape = new THREE.Shape();
  // Z goes from 0 to stockEnd, Y is height
  // Buttplate (at Z=0)
  shape.moveTo(0, -0.04);     // Heel (top)
  shape.lineTo(0, -0.16);     // Toe (bottom)
  
  // Bottom curve (belly to wrist)
  // Wrist is around Z = stockEnd - 0.15
  shape.bezierCurveTo(
    stockEnd * 0.3, -0.15, 
    stockEnd * 0.6, -0.06, 
    stockEnd - 0.08, -0.06
  );
  
  // Bottom of stock near receiver
  shape.lineTo(stockEnd, -0.04);
  
  // Top of stock (comb to wrist to receiver)
  shape.lineTo(stockEnd, 0.0);
  
  // Wrist top
  shape.lineTo(stockEnd - 0.1, 0.0);
  
  // Comb
  shape.bezierCurveTo(
    stockEnd * 0.7, 0.0,
    stockEnd * 0.4, -0.04,
    0, -0.04
  );
  
  return shape;
}
