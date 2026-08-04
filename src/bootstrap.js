import { installWebGpuGlobalCompat } from './engine/WebGpuGlobalCompat.js';

// vanilla-vfx's bundled Three build reads GPUShaderStage while its module is
// evaluated. Firefox without WebGPU omits that global even though the game can
// and must continue through Three's WebGL2 backend.
installWebGpuGlobalCompat();
import('./main.js').catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  document.body.dataset.gameStatus = 'error';
  document.body.dataset.gameError = message;
  console.error('[Bootstrap]', error);
});
