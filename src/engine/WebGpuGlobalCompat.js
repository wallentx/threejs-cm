const GPU_SHADER_STAGE_FALLBACK = Object.freeze({
  VERTEX: 0x1,
  FRAGMENT: 0x2,
  COMPUTE: 0x4
});

export function installWebGpuGlobalCompat(target = globalThis) {
  if (target.GPUShaderStage !== undefined) return target.GPUShaderStage;

  Object.defineProperty(target, 'GPUShaderStage', {
    configurable: true,
    enumerable: false,
    value: GPU_SHADER_STAGE_FALLBACK,
    writable: false
  });
  return target.GPUShaderStage;
}
