import '../styles/calibration.css';
import {
  FRANCE_1940_CALIBRATION_REFERENCES,
  FRANCE_1940_VEHICLE_MESH_FACTORIES
} from '../content/france1940/render/index.js';
import { VehicleCalibrationApp } from './VehicleCalibrationApp.js';

const app = new VehicleCalibrationApp({
  calibrationReferences: FRANCE_1940_CALIBRATION_REFERENCES,
  vehicleMeshFactories: FRANCE_1940_VEHICLE_MESH_FACTORIES
});
app.initialize().catch(error => {
  document.body.dataset.calibrationStatus = 'error';
  document.body.dataset.calibrationError = error.message;
  const status = document.getElementById('calibration-status');
  if (status) {
    status.textContent = `Calibration startup failed: ${error.message}`;
    status.classList.add('error');
  }
  console.error(error);
});
