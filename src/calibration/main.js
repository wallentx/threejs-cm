import '../styles/calibration.css';
import { VehicleCalibrationApp } from './VehicleCalibrationApp.js';

const app = new VehicleCalibrationApp();
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
