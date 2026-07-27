const FALLBACK_ACTIONS = new Set(['throw', 'return-null', 'url']);

function requireLoadableUrl(value, label = 'external image URL') {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  const url = value.trim();
  const explicitScheme = url.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (
    explicitScheme
    && !['http', 'https', 'blob'].includes(explicitScheme)
    && !(explicitScheme === 'data' && /^data:image\//i.test(url))
  ) {
    throw new TypeError(`${label} uses unsupported scheme ${explicitScheme}`);
  }
  return url;
}

function normalizeFallbackPolicy(policy) {
  const candidate = policy ?? { action: 'throw' };
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError('external image fallback policy must be a record');
  }
  if (!FALLBACK_ACTIONS.has(candidate.action)) {
    throw new TypeError(
      'external image fallback action must be throw, return-null, or url'
    );
  }
  if (candidate.action !== 'url') {
    return Object.freeze({ action: candidate.action });
  }
  const onFailure = candidate.onFailure ?? 'throw';
  if (!['throw', 'return-null'].includes(onFailure)) {
    throw new TypeError('external image URL fallback onFailure must be throw or return-null');
  }
  return Object.freeze({
    action: 'url',
    url: requireLoadableUrl(candidate.url, 'external image fallback URL'),
    onFailure
  });
}

function copyAssetBinding(binding) {
  if (binding == null) return null;
  if (
    typeof binding !== 'object'
    || typeof binding.logicalId !== 'string'
    || typeof binding.sourcePackId !== 'string'
  ) {
    throw new TypeError('external image asset binding requires logicalId and sourcePackId');
  }
  return Object.freeze({
    logicalId: binding.logicalId,
    sourcePackId: binding.sourcePackId
  });
}

export class ExternalImageAssetLoadError extends Error {
  constructor(url, cause = null) {
    super(`Failed to load external image ${url}`, cause ? { cause } : undefined);
    this.name = 'ExternalImageAssetLoadError';
    this.url = url;
  }
}

export class ExternalImageAssetService {
  constructor({
    createImage = () => new globalThis.Image(),
    createObjectUrl = blob => globalThis.URL.createObjectURL(blob),
    revokeObjectUrl = url => globalThis.URL.revokeObjectURL(url),
    missingAssetPolicy = { action: 'throw' }
  } = {}) {
    for (const [label, value] of [
      ['createImage', createImage],
      ['createObjectUrl', createObjectUrl],
      ['revokeObjectUrl', revokeObjectUrl]
    ]) {
      if (typeof value !== 'function') {
        throw new TypeError(`ExternalImageAssetService ${label} must be a function`);
      }
    }
    this.createImageElement = createImage;
    this.createObjectUrlImpl = createObjectUrl;
    this.revokeObjectUrlImpl = revokeObjectUrl;
    this.missingAssetPolicy = normalizeFallbackPolicy(missingAssetPolicy);
    this.resources = new Map();
    this.pending = new Map();
    this.pendingLoads = new Set();
    this.ownedObjectUrls = new Set();
    this.disposed = false;
  }

  createObjectUrl(blob) {
    if (this.disposed) throw new Error('ExternalImageAssetService is disposed');
    const url = requireLoadableUrl(
      this.createObjectUrlImpl(blob),
      'created external image object URL'
    );
    if (!url.startsWith('blob:')) {
      throw new Error('external image object URL factory must return a blob: URL');
    }
    this.ownedObjectUrls.add(url);
    return url;
  }

  loadImageElement(url) {
    if (this.disposed) {
      return Promise.reject(new Error('ExternalImageAssetService is disposed'));
    }
    return new Promise((resolve, reject) => {
      const image = this.createImageElement();
      if (!image || typeof image.addEventListener !== 'function') {
        reject(new TypeError('external image factory must create an event target'));
        return;
      }
      let settled = false;
      const cleanup = () => {
        image.removeEventListener?.('load', onLoad);
        image.removeEventListener?.('error', onError);
        this.pendingLoads.delete(pendingLoad);
      };
      const onLoad = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(image);
      };
      const onError = event => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new ExternalImageAssetLoadError(url, event?.error ?? null));
      };
      const pendingLoad = {
        cancel: () => {
          if (settled) return;
          settled = true;
          cleanup();
          image.src = '';
          reject(new ExternalImageAssetLoadError(url));
        }
      };
      image.addEventListener('load', onLoad, { once: true });
      image.addEventListener('error', onError, { once: true });
      this.pendingLoads.add(pendingLoad);
      image.src = url;
    });
  }

  createResource({
    image,
    cacheKey,
    requestedUrl,
    resolvedUrl,
    usedFallback,
    assetBinding
  }) {
    let disposed = false;
    let resource;
    resource = Object.freeze({
      kind: 'external-image-resource',
      image,
      requestedUrl,
      resolvedUrl,
      usedFallback,
      assetBinding,
      dispose: () => {
        if (disposed) return false;
        disposed = true;
        if (this.resources.get(cacheKey) === resource) {
          this.resources.delete(cacheKey);
        }
        image.src = '';
        return true;
      }
    });
    return resource;
  }

  async loadUncached(url, fallbackPolicy, options) {
    try {
      const image = await this.loadImageElement(url);
      return this.createResource({
        image,
        cacheKey: options.cacheKey,
        requestedUrl: url,
        resolvedUrl: url,
        usedFallback: false,
        assetBinding: options.assetBinding
      });
    } catch (primaryError) {
      if (this.disposed) throw new Error('ExternalImageAssetService is disposed');
      if (fallbackPolicy.action === 'return-null') return null;
      if (fallbackPolicy.action === 'throw') throw primaryError;
      try {
        const image = await this.loadImageElement(fallbackPolicy.url);
        return this.createResource({
          image,
          cacheKey: options.cacheKey,
          requestedUrl: url,
          resolvedUrl: fallbackPolicy.url,
          usedFallback: true,
          assetBinding: options.assetBinding
        });
      } catch (fallbackError) {
        if (fallbackPolicy.onFailure === 'return-null') return null;
        throw new AggregateError(
          [primaryError, fallbackError],
          `Failed to load external image ${url} and fallback ${fallbackPolicy.url}`
        );
      }
    }
  }

  async load(url, {
    cacheKey = url,
    fallbackPolicy = this.missingAssetPolicy,
    assetBinding = null
  } = {}) {
    if (this.disposed) throw new Error('ExternalImageAssetService is disposed');
    const requestedUrl = requireLoadableUrl(url);
    if (typeof cacheKey !== 'string' || cacheKey.length === 0) {
      throw new TypeError('external image cacheKey must be a non-empty string');
    }
    const cached = this.resources.get(cacheKey);
    if (cached) return cached;
    const inFlight = this.pending.get(cacheKey);
    if (inFlight) return inFlight;

    const normalizedPolicy = normalizeFallbackPolicy(fallbackPolicy);
    const options = {
      cacheKey,
      assetBinding: copyAssetBinding(assetBinding)
    };
    const promise = this.loadUncached(requestedUrl, normalizedPolicy, options)
      .then(resource => {
        if (this.disposed) {
          resource?.dispose();
          throw new Error('ExternalImageAssetService was disposed during load');
        }
        if (resource) this.resources.set(cacheKey, resource);
        return resource;
      })
      .finally(() => {
        if (this.pending.get(cacheKey) === promise) this.pending.delete(cacheKey);
      });
    this.pending.set(cacheKey, promise);
    return promise;
  }

  dispose() {
    if (this.disposed) return false;
    this.disposed = true;
    for (const pendingLoad of [...this.pendingLoads]) pendingLoad.cancel();
    for (const resource of [...this.resources.values()]) resource.dispose();
    this.resources.clear();
    this.pending.clear();
    for (const url of this.ownedObjectUrls) this.revokeObjectUrlImpl(url);
    this.ownedObjectUrls.clear();
    return true;
  }
}
