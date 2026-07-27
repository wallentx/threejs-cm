const DEFAULT_MAX_CACHED_RESOURCES = 64;

function requireImageService(imageService) {
  if (
    !imageService
    || typeof imageService !== 'object'
    || typeof imageService.load !== 'function'
    || typeof imageService.dispose !== 'function'
  ) {
    throw new TypeError(
      'ExternalTextureAssetService imageService requires load and dispose functions'
    );
  }
  return imageService;
}

function requireTextureFactory(createTexture) {
  if (typeof createTexture !== 'function') {
    throw new TypeError(
      'ExternalTextureAssetService createTexture must be a function'
    );
  }
  return createTexture;
}

function requireCacheLimit(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(
      'ExternalTextureAssetService maxCachedResources must be a positive integer'
    );
  }
  return value;
}

function requireImageResource(resource) {
  if (
    !resource
    || typeof resource !== 'object'
    || resource.kind !== 'external-image-resource'
    || typeof resource.dispose !== 'function'
  ) {
    throw new TypeError(
      'ExternalTextureAssetService imageService must load external image resources'
    );
  }
  return resource;
}

function requireTextureResource(texture) {
  if (
    !texture
    || typeof texture !== 'object'
    || typeof texture.dispose !== 'function'
  ) {
    throw new TypeError(
      'ExternalTextureAssetService createTexture must return a disposable texture'
    );
  }
  return texture;
}

function appendDisposalError(errors, error) {
  if (error instanceof AggregateError) {
    errors.push(...error.errors);
  } else {
    errors.push(error);
  }
}

function requireMatchingImageResource(result, textureResource, cacheKey) {
  if (result == null || textureResource == null) {
    if (result === null && textureResource === null) return textureResource;
    if (result != null) requireImageResource(result).dispose();
    throw new Error(
      `ExternalTextureAssetService image/texture cache mismatch for ${String(cacheKey)}`
    );
  }
  const imageResource = requireImageResource(result);
  if (imageResource !== textureResource.imageResource) {
    imageResource.dispose();
    throw new Error(
      `ExternalTextureAssetService image resource identity mismatch for ${String(cacheKey)}`
    );
  }
  return textureResource;
}

/**
 * Owns the injected image service and passes each loaded image resource to the
 * injected renderer-specific texture factory.
 */
export class ExternalTextureAssetService {
  constructor({
    imageService,
    createTexture,
    maxCachedResources = DEFAULT_MAX_CACHED_RESOURCES
  } = {}) {
    this.imageService = requireImageService(imageService);
    this.createTextureImpl = requireTextureFactory(createTexture);
    this.maxCachedResources = requireCacheLimit(maxCachedResources);
    this.resources = new Map();
    this.pending = new Map();
    this.disposed = false;
  }

  createResource(imageResource, cacheKey) {
    let texture;
    try {
      texture = requireTextureResource(
        this.createTextureImpl(imageResource)
      );
    } catch (error) {
      imageResource.dispose();
      throw error;
    }

    let disposed = false;
    let resource;
    resource = Object.freeze({
      kind: 'external-texture-resource',
      texture,
      imageResource,
      image: imageResource.image,
      requestedUrl: imageResource.requestedUrl,
      resolvedUrl: imageResource.resolvedUrl,
      usedFallback: imageResource.usedFallback,
      assetBinding: imageResource.assetBinding,
      logicalId: imageResource.assetBinding?.logicalId ?? null,
      sourcePackId: imageResource.assetBinding?.sourcePackId ?? null,
      dispose: () => {
        if (disposed) return false;
        disposed = true;
        if (this.resources.get(cacheKey) === resource) {
          this.resources.delete(cacheKey);
        }
        const errors = [];
        try {
          texture.dispose();
        } catch (error) {
          appendDisposalError(errors, error);
        }
        try {
          imageResource.dispose();
        } catch (error) {
          appendDisposalError(errors, error);
        }
        if (errors.length > 0) {
          throw new AggregateError(
            errors,
            'Failed to dispose external texture resource'
          );
        }
        return true;
      }
    });
    return resource;
  }

  enforceCacheLimit() {
    while (this.resources.size > this.maxCachedResources) {
      const oldest = this.resources.values().next().value;
      oldest.dispose();
    }
  }

  async load(url, options = {}) {
    if (this.disposed) {
      throw new Error('ExternalTextureAssetService is disposed');
    }
    const { cacheKey = url } = options;
    const imageOptions = { ...options, cacheKey };
    const imageLoad = Promise.resolve()
      .then(() => this.imageService.load(url, imageOptions));
    const cached = this.resources.get(cacheKey);
    if (cached) {
      const imageResource = await imageLoad;
      requireMatchingImageResource(imageResource, cached, cacheKey);
      if (this.disposed || this.resources.get(cacheKey) !== cached) {
        throw new Error(
          'ExternalTextureAssetService cached resource was disposed during validation'
        );
      }
      this.resources.delete(cacheKey);
      this.resources.set(cacheKey, cached);
      return cached;
    }
    const inFlight = this.pending.get(cacheKey);
    if (inFlight) {
      const [imageResource, textureResource] = await Promise.all([
        imageLoad,
        inFlight
      ]);
      return requireMatchingImageResource(
        imageResource,
        textureResource,
        cacheKey
      );
    }

    let promise;
    promise = imageLoad
      .then(result => {
        if (this.disposed) {
          if (result != null) requireImageResource(result).dispose();
          throw new Error(
            'ExternalTextureAssetService was disposed during load'
          );
        }
        if (result == null) return null;
        const imageResource = requireImageResource(result);
        const resource = this.createResource(imageResource, cacheKey);
        if (this.disposed) {
          resource.dispose();
          throw new Error(
            'ExternalTextureAssetService was disposed during texture creation'
          );
        }
        this.resources.set(cacheKey, resource);
        this.enforceCacheLimit();
        return resource;
      })
      .finally(() => {
        if (this.pending.get(cacheKey) === promise) {
          this.pending.delete(cacheKey);
        }
      });
    this.pending.set(cacheKey, promise);
    return promise;
  }

  dispose() {
    if (this.disposed) return false;
    this.disposed = true;
    const errors = [];
    for (const resource of [...this.resources.values()]) {
      try {
        resource.dispose();
      } catch (error) {
        appendDisposalError(errors, error);
      }
    }
    this.resources.clear();
    try {
      this.imageService.dispose();
    } catch (error) {
      appendDisposalError(errors, error);
    }
    this.pending.clear();
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        'Failed to dispose ExternalTextureAssetService'
      );
    }
    return true;
  }
}
