const DEFAULT_MAX_CACHED_RESOURCES = 64;
const FALLBACK_ACTIONS = new Set(['throw', 'return-null', 'url']);

function requireFunction(value, label) {
  if (typeof value !== 'function') {
    throw new TypeError(`ExternalAudioAssetService ${label} must be a function`);
  }
  return value;
}

function requireCacheLimit(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(
      'ExternalAudioAssetService maxCachedResources must be a positive integer'
    );
  }
  return value;
}

function requireCacheKey(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError('external audio cacheKey must be a non-empty string');
  }
  return value.trim();
}

function requireLoadableUrl(value, label = 'external audio URL') {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  const url = value.trim();
  const explicitScheme = url.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (
    explicitScheme
    && !['http', 'https', 'blob'].includes(explicitScheme)
    && !(explicitScheme === 'data' && /^data:audio\//i.test(url))
  ) {
    throw new TypeError(`${label} uses unsupported scheme ${explicitScheme}`);
  }
  return url;
}

function normalizeFallbackPolicy(policy) {
  const candidate = policy ?? { action: 'throw' };
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError('external audio fallback policy must be a record');
  }
  if (!FALLBACK_ACTIONS.has(candidate.action)) {
    throw new TypeError(
      'external audio fallback action must be throw, return-null, or url'
    );
  }
  if (candidate.action !== 'url') {
    return Object.freeze({ action: candidate.action });
  }
  const onFailure = candidate.onFailure ?? 'throw';
  if (!['throw', 'return-null'].includes(onFailure)) {
    throw new TypeError(
      'external audio URL fallback onFailure must be throw or return-null'
    );
  }
  return Object.freeze({
    action: 'url',
    url: requireLoadableUrl(candidate.url, 'external audio fallback URL'),
    onFailure
  });
}

function copyAssetBinding(binding) {
  if (binding == null) return null;
  if (
    typeof binding !== 'object'
    || Array.isArray(binding)
    || typeof binding.logicalId !== 'string'
    || binding.logicalId.trim().length === 0
    || typeof binding.sourcePackId !== 'string'
    || binding.sourcePackId.trim().length === 0
  ) {
    throw new TypeError(
      'external audio asset binding requires non-empty logicalId and sourcePackId'
    );
  }
  return Object.freeze({
    logicalId: binding.logicalId.trim(),
    sourcePackId: binding.sourcePackId.trim()
  });
}

function sameFallbackPolicy(left, right) {
  return (
    left.action === right.action
    && left.url === right.url
    && left.onFailure === right.onFailure
  );
}

function sameAssetBinding(left, right) {
  return (
    left === right
    || (
      left != null
      && right != null
      && left.logicalId === right.logicalId
      && left.sourcePackId === right.sourcePackId
    )
  );
}

function sameRequestIdentity(left, right) {
  return (
    left.requestedUrl === right.requestedUrl
    && sameFallbackPolicy(left.fallbackPolicy, right.fallbackPolicy)
    && sameAssetBinding(left.assetBinding, right.assetBinding)
  );
}

function requireResponse(value) {
  if (
    !value
    || typeof value !== 'object'
    || typeof value.ok !== 'boolean'
    || !Number.isFinite(value.status)
    || typeof value.arrayBuffer !== 'function'
  ) {
    throw new TypeError(
      'external audio fetch response requires ok, status, and arrayBuffer()'
    );
  }
  return value;
}

function requireAudioBytes(value) {
  if (!(value instanceof ArrayBuffer)) {
    throw new TypeError('external audio response arrayBuffer() must return an ArrayBuffer');
  }
  return value;
}

function requireDecodedBuffer(value) {
  if (
    value == null
    || (typeof value !== 'object' && typeof value !== 'function')
  ) {
    throw new TypeError('external audio decoder must return a decoded buffer');
  }
  return value;
}

function appendDisposalError(errors, error) {
  if (error instanceof AggregateError) {
    errors.push(...error.errors);
  } else {
    errors.push(error);
  }
}

class ExternalAudioAssetDisposedError extends Error {
  constructor() {
    super('ExternalAudioAssetService was disposed during load');
    this.name = 'ExternalAudioAssetDisposedError';
  }
}

function disposedError() {
  return new ExternalAudioAssetDisposedError();
}

function retainDisposalFailure(error) {
  if (error instanceof ExternalAudioAssetDisposedError) return error;
  if (
    error instanceof AggregateError
    && error.errors.some(cause => (
      cause instanceof ExternalAudioAssetDisposedError
    ))
  ) {
    return error;
  }
  return disposedError();
}

export class ExternalAudioAssetLoadError extends Error {
  constructor(url, stage, cause = null, status = null) {
    super(
      `Failed to load external audio ${url} during ${stage}`,
      cause ? { cause } : undefined
    );
    this.name = 'ExternalAudioAssetLoadError';
    this.url = url;
    this.stage = stage;
    this.status = status;
  }
}

export class ExternalAudioAssetService {
  constructor({
    fetch: fetchImpl,
    decodeAudio,
    disposeDecodedBuffer = null,
    missingAssetPolicy = { action: 'throw' },
    maxCachedResources = DEFAULT_MAX_CACHED_RESOURCES
  } = {}) {
    this.fetchImpl = requireFunction(fetchImpl, 'fetch');
    this.decodeAudioImpl = requireFunction(decodeAudio, 'decodeAudio');
    if (disposeDecodedBuffer != null) {
      requireFunction(disposeDecodedBuffer, 'disposeDecodedBuffer');
    }
    this.disposeDecodedBufferImpl = disposeDecodedBuffer;
    this.missingAssetPolicy = normalizeFallbackPolicy(missingAssetPolicy);
    this.maxCachedResources = requireCacheLimit(maxCachedResources);
    this.resources = new Map();
    this.pending = new Map();
    this.pendingControllers = new Set();
    this.disposed = false;
  }

  releaseDecodedBuffer(buffer) {
    this.disposeDecodedBufferImpl?.(buffer);
  }

  releaseLateBuffer(buffer) {
    const error = disposedError();
    try {
      this.releaseDecodedBuffer(buffer);
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'ExternalAudioAssetService was disposed during decoded-buffer cleanup'
      );
    }
    throw error;
  }

  async fetchAndDecode(url) {
    const controller = new AbortController();
    this.pendingControllers.add(controller);
    try {
      let fetched;
      try {
        fetched = await this.fetchImpl(url, { signal: controller.signal });
        if (this.disposed) throw disposedError();
        fetched = requireResponse(fetched);
        if (!fetched.ok) {
          throw new Error(`external audio fetch returned status ${fetched.status}`);
        }
      } catch (error) {
        if (this.disposed) throw disposedError();
        throw new ExternalAudioAssetLoadError(
          url,
          'fetch',
          error,
          Number.isFinite(fetched?.status) ? fetched.status : null
        );
      }

      let audioBytes;
      try {
        audioBytes = requireAudioBytes(await fetched.arrayBuffer());
        if (this.disposed) throw disposedError();
      } catch (error) {
        if (this.disposed) throw disposedError();
        throw new ExternalAudioAssetLoadError(url, 'byte-read', error, fetched.status);
      }

      let decodedBuffer;
      try {
        decodedBuffer = requireDecodedBuffer(
          await this.decodeAudioImpl(audioBytes)
        );
      } catch (error) {
        if (this.disposed) throw disposedError();
        throw new ExternalAudioAssetLoadError(url, 'decode', error, fetched.status);
      }
      if (this.disposed) this.releaseLateBuffer(decodedBuffer);
      return decodedBuffer;
    } finally {
      this.pendingControllers.delete(controller);
    }
  }

  createResource({
    buffer: initialBuffer,
    cacheKey,
    requestedUrl,
    resolvedUrl,
    usedFallback,
    assetBinding
  }) {
    let buffer = initialBuffer;
    let disposed = false;
    let resource;
    resource = Object.freeze({
      kind: 'external-audio-resource',
      requestedUrl,
      resolvedUrl,
      usedFallback,
      assetBinding,
      logicalId: assetBinding?.logicalId ?? null,
      sourcePackId: assetBinding?.sourcePackId ?? null,
      get buffer() {
        return buffer;
      },
      dispose: () => {
        if (disposed) return false;
        disposed = true;
        const entry = this.resources.get(cacheKey);
        if (entry?.resource === resource) {
          this.resources.delete(cacheKey);
        }
        const ownedBuffer = buffer;
        buffer = null;
        this.releaseDecodedBuffer(ownedBuffer);
        return true;
      }
    });
    return resource;
  }

  acceptResource(cacheKey, identity, resource) {
    const errors = [];
    while (this.resources.size >= this.maxCachedResources) {
      const oldest = this.resources.values().next().value;
      try {
        oldest.resource.dispose();
      } catch (error) {
        appendDisposalError(errors, error);
      }
    }
    if (errors.length > 0) {
      try {
        resource.dispose();
      } catch (error) {
        appendDisposalError(errors, error);
      }
      throw new AggregateError(
        errors,
        'Failed to evict external audio resources'
      );
    }
    this.resources.set(cacheKey, { identity, resource });
    return resource;
  }

  async loadUncached(requestedUrl, fallbackPolicy) {
    try {
      const buffer = await this.fetchAndDecode(requestedUrl);
      return {
        buffer,
        resolvedUrl: requestedUrl,
        usedFallback: false
      };
    } catch (primaryError) {
      if (this.disposed) throw retainDisposalFailure(primaryError);
      if (fallbackPolicy.action === 'return-null') return null;
      if (fallbackPolicy.action === 'throw') throw primaryError;
      try {
        const buffer = await this.fetchAndDecode(fallbackPolicy.url);
        return {
          buffer,
          resolvedUrl: fallbackPolicy.url,
          usedFallback: true
        };
      } catch (fallbackError) {
        if (this.disposed) throw retainDisposalFailure(fallbackError);
        if (fallbackPolicy.onFailure === 'return-null') return null;
        throw new AggregateError(
          [primaryError, fallbackError],
          `Failed to load external audio ${requestedUrl} and fallback ${fallbackPolicy.url}`
        );
      }
    }
  }

  async load(url, options = {}) {
    if (this.disposed) {
      throw new Error('ExternalAudioAssetService is disposed');
    }
    const requestedUrl = requireLoadableUrl(url);
    const cacheKey = requireCacheKey(
      Object.hasOwn(options, 'cacheKey') ? options.cacheKey : requestedUrl
    );
    const fallbackPolicy = normalizeFallbackPolicy(
      Object.hasOwn(options, 'fallbackPolicy')
        ? options.fallbackPolicy
        : this.missingAssetPolicy
    );
    const assetBinding = copyAssetBinding(options.assetBinding ?? null);
    const identity = Object.freeze({
      requestedUrl,
      fallbackPolicy,
      assetBinding
    });

    const cached = this.resources.get(cacheKey);
    if (cached) {
      if (!sameRequestIdentity(cached.identity, identity)) {
        throw new Error(
          `ExternalAudioAssetService cacheKey ${cacheKey} collision`
        );
      }
      this.resources.delete(cacheKey);
      this.resources.set(cacheKey, cached);
      return cached.resource;
    }

    const inFlight = this.pending.get(cacheKey);
    if (inFlight) {
      if (!sameRequestIdentity(inFlight.identity, identity)) {
        throw new Error(
          `ExternalAudioAssetService cacheKey ${cacheKey} collision`
        );
      }
      return inFlight.promise;
    }

    let promise;
    promise = this.loadUncached(requestedUrl, fallbackPolicy)
      .then(result => {
        if (this.disposed) {
          if (result?.buffer != null) this.releaseLateBuffer(result.buffer);
          throw disposedError();
        }
        if (result == null) return null;
        const resource = this.createResource({
          ...result,
          cacheKey,
          requestedUrl,
          assetBinding
        });
        return this.acceptResource(cacheKey, identity, resource);
      })
      .finally(() => {
        if (this.pending.get(cacheKey)?.promise === promise) {
          this.pending.delete(cacheKey);
        }
      });
    this.pending.set(cacheKey, { identity, promise });
    return promise;
  }

  dispose() {
    if (this.disposed) return false;
    this.disposed = true;
    const errors = [];
    for (const controller of this.pendingControllers) {
      try {
        controller.abort();
      } catch (error) {
        appendDisposalError(errors, error);
      }
    }
    this.pendingControllers.clear();
    for (const entry of [...this.resources.values()]) {
      try {
        entry.resource.dispose();
      } catch (error) {
        appendDisposalError(errors, error);
      }
    }
    this.resources.clear();
    this.pending.clear();
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        'Failed to dispose ExternalAudioAssetService'
      );
    }
    return true;
  }
}
