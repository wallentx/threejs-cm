import assert from 'node:assert/strict';
import test from 'node:test';
import { ExternalImageAssetService } from '../src/assets/ExternalImageAssetService.js';
import { ExternalTextureAssetService } from '../src/assets/ExternalTextureAssetService.js';

class FakeImage extends EventTarget {
  constructor(outcomes) {
    super();
    this.outcomes = outcomes;
    this._src = '';
  }

  set src(value) {
    this._src = value;
    if (!value) return;
    const outcome = this.outcomes.get(value) ?? 'error';
    if (outcome === 'pending') return;
    queueMicrotask(() => {
      if (this._src !== value) return;
      this.dispatchEvent(new Event(outcome));
    });
  }

  get src() {
    return this._src;
  }
}

function createHarness(entries = [], options = {}) {
  const outcomes = new Map(entries);
  const images = [];
  const textures = [];
  const imageService = new ExternalImageAssetService({
    createImage() {
      const image = new FakeImage(outcomes);
      images.push(image);
      return image;
    }
  });
  let factoryCalls = 0;
  const textureService = new ExternalTextureAssetService({
    imageService,
    maxCachedResources: options.maxCachedResources,
    createTexture(imageResource) {
      factoryCalls++;
      if (options.failFactory?.()) {
        throw new Error('texture factory failed');
      }
      const texture = {
        image: imageResource.image,
        disposeCalls: 0,
        dispose() {
          this.disposeCalls++;
        }
      };
      textures.push(texture);
      return texture;
    }
  });
  return {
    get factoryCalls() {
      return factoryCalls;
    },
    imageService,
    images,
    outcomes,
    textures,
    textureService
  };
}

test('constructor requires an owned image service and disposable texture factory', () => {
  const validImageService = {
    load() {},
    dispose() {}
  };
  assert.throws(
    () => new ExternalTextureAssetService(),
    /imageService requires load and dispose/
  );
  assert.throws(
    () => new ExternalTextureAssetService({
      imageService: { load() {} },
      createTexture() {}
    }),
    /imageService requires load and dispose/
  );
  assert.throws(
    () => new ExternalTextureAssetService({
      imageService: validImageService
    }),
    /createTexture must be a function/
  );
  assert.throws(
    () => new ExternalTextureAssetService({
      imageService: validImageService,
      createTexture() {},
      maxCachedResources: 0
    }),
    /maxCachedResources must be a positive integer/
  );
});

test('deduplicates image and texture work while retaining logical identity', async () => {
  const harness = createHarness([['/surface.png', 'load']]);
  const options = {
    cacheKey: 'logical:test.surface:pack-a',
    assetBinding: {
      logicalId: 'test.surface',
      sourcePackId: 'pack-a'
    }
  };
  const [first, second] = await Promise.all([
    harness.textureService.load('/surface.png', options),
    harness.textureService.load('/same-key-is-deduplicated.png', options)
  ]);
  const cached = await harness.textureService.load(
    '/same-key-stays-cached.png',
    options
  );

  assert.equal(first, second);
  assert.equal(cached, first);
  assert.equal(harness.images.length, 1);
  assert.equal(harness.factoryCalls, 1);
  assert.equal(first.kind, 'external-texture-resource');
  assert.equal(first.texture, harness.textures[0]);
  assert.equal(first.image, harness.images[0]);
  assert.equal(first.imageResource.image, first.image);
  assert.equal(first.assetBinding, first.imageResource.assetBinding);
  assert.equal(first.requestedUrl, '/surface.png');
  assert.equal(first.resolvedUrl, '/surface.png');
  assert.equal(first.usedFallback, false);
  assert.deepEqual(first.assetBinding, options.assetBinding);
  assert.equal(first.logicalId, 'test.surface');
  assert.equal(first.sourcePackId, 'pack-a');

  assert.equal(first.dispose(), true);
  assert.equal(first.dispose(), false);
  assert.equal(harness.textures[0].disposeCalls, 1);
  assert.equal(harness.images[0].src, '');

  const reloaded = await harness.textureService.load('/surface.png', options);
  assert.notEqual(reloaded, first);
  assert.equal(harness.images.length, 2);
  assert.equal(harness.factoryCalls, 2);
  assert.equal(harness.textureService.dispose(), true);
  assert.equal(harness.textureService.dispose(), false);
  assert.equal(harness.textures[1].disposeCalls, 1);
  assert.equal(harness.images[1].src, '');
});

test('validates unsafe requested URLs before cached and pending key hits', async () => {
  const harness = createHarness([
    ['/cached.png', 'load'],
    ['/pending.png', 'pending']
  ]);
  const cachedOptions = { cacheKey: 'shared-cached-key' };
  const cached = await harness.textureService.load('/cached.png', cachedOptions);

  await assert.rejects(
    harness.textureService.load('javascript:cached-collision()', cachedOptions),
    /unsupported scheme javascript/
  );
  assert.equal(
    await harness.textureService.load('/safe-cached-collision.png', cachedOptions),
    cached
  );
  assert.equal(harness.images.length, 1);
  assert.equal(harness.factoryCalls, 1);

  const pendingOptions = { cacheKey: 'shared-pending-key' };
  const pending = harness.textureService.load('/pending.png', pendingOptions);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(harness.images.length, 2);

  const pendingCollisionAssertion = assert.rejects(
    harness.textureService.load('javascript:pending-collision()', pendingOptions),
    /unsupported scheme javascript/
  );
  await Promise.resolve();
  assert.equal(harness.factoryCalls, 1);
  assert.equal(harness.images[1].src, '/pending.png');

  harness.images[1].dispatchEvent(new Event('load'));
  await pendingCollisionAssertion;
  const loaded = await pending;
  assert.equal(loaded.requestedUrl, '/pending.png');
  assert.equal(harness.factoryCalls, 2);
  assert.equal(harness.images.length, 2);
  harness.textureService.dispose();
});

test('delegates fallback, unsafe URL, null, and retry policy to the image service', async () => {
  const harness = createHarness([
    ['/missing.png', 'error'],
    ['/fallback.png', 'load'],
    ['/nullable.png', 'error'],
    ['/retry.png', 'error']
  ]);

  const fallback = await harness.textureService.load('/missing.png', {
    cacheKey: 'fallback',
    fallbackPolicy: {
      action: 'url',
      url: '/fallback.png',
      onFailure: 'throw'
    },
    assetBinding: {
      logicalId: 'test.fallback',
      sourcePackId: 'pack-b'
    }
  });
  assert.equal(fallback.requestedUrl, '/missing.png');
  assert.equal(fallback.resolvedUrl, '/fallback.png');
  assert.equal(fallback.usedFallback, true);
  assert.equal(fallback.logicalId, 'test.fallback');
  assert.equal(fallback.sourcePackId, 'pack-b');

  const beforeNullFactoryCalls = harness.factoryCalls;
  const unavailable = await harness.textureService.load('/nullable.png', {
    cacheKey: 'nullable',
    fallbackPolicy: { action: 'return-null' }
  });
  assert.equal(unavailable, null);
  assert.equal(harness.factoryCalls, beforeNullFactoryCalls);
  harness.outcomes.set('/nullable.png', 'load');
  const available = await harness.textureService.load('/nullable.png', {
    cacheKey: 'nullable',
    fallbackPolicy: { action: 'return-null' }
  });
  assert.equal(available.resolvedUrl, '/nullable.png');

  await assert.rejects(
    harness.textureService.load('/retry.png', {
      cacheKey: 'retry',
      fallbackPolicy: { action: 'throw' }
    }),
    /Failed to load external image/
  );
  harness.outcomes.set('/retry.png', 'load');
  const retry = await harness.textureService.load('/retry.png', {
    cacheKey: 'retry',
    fallbackPolicy: { action: 'throw' }
  });
  assert.equal(retry.resolvedUrl, '/retry.png');

  await assert.rejects(
    harness.textureService.load('javascript:alert(1)'),
    /unsupported scheme javascript/
  );
  harness.textureService.dispose();
});

test('factory failure releases its image handle and remains retryable', async () => {
  let shouldFail = true;
  const harness = createHarness(
    [['/factory.png', 'load']],
    {
      failFactory() {
        const result = shouldFail;
        shouldFail = false;
        return result;
      }
    }
  );

  await assert.rejects(
    harness.textureService.load('/factory.png'),
    /texture factory failed/
  );
  assert.equal(harness.images.length, 1);
  assert.equal(harness.images[0].src, '');
  assert.equal(harness.textures.length, 0);

  const retry = await harness.textureService.load('/factory.png');
  assert.equal(retry.texture, harness.textures[0]);
  assert.equal(harness.images.length, 2);
  harness.textureService.dispose();
});

test('bounded LRU cache evicts texture and image ownership together', async () => {
  const harness = createHarness(
    [
      ['/a.png', 'load'],
      ['/b.png', 'load'],
      ['/c.png', 'load']
    ],
    { maxCachedResources: 2 }
  );
  const a = await harness.textureService.load('/a.png');
  const b = await harness.textureService.load('/b.png');
  assert.equal(await harness.textureService.load('/a.png'), a);
  const c = await harness.textureService.load('/c.png');

  assert.equal(b.texture.disposeCalls, 1);
  assert.equal(b.image.src, '');
  assert.equal(a.texture.disposeCalls, 0);
  assert.equal(c.texture.disposeCalls, 0);

  const reloadedB = await harness.textureService.load('/b.png');
  assert.notEqual(reloadedB, b);
  assert.equal(a.texture.disposeCalls, 1);
  assert.equal(a.image.src, '');
  harness.textureService.dispose();
});

test('service disposal cancels pending loads through the image service', async () => {
  const harness = createHarness([['/pending.png', 'pending']]);
  const pending = harness.textureService.load('/pending.png');
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(harness.textureService.dispose(), true);
  await assert.rejects(pending, /disposed/);
  assert.equal(harness.images[0].src, '');
  assert.equal(harness.factoryCalls, 0);
  await assert.rejects(
    harness.textureService.load('/pending.png'),
    /ExternalTextureAssetService is disposed/
  );
});

test('service disposal cleans every resource and image service before aggregating errors', async () => {
  const harness = createHarness([
    ['/throwing.png', 'load'],
    ['/survivor.png', 'load']
  ]);
  const throwing = await harness.textureService.load('/throwing.png');
  const survivor = await harness.textureService.load('/survivor.png');
  const originalThrowingDispose = throwing.texture.dispose;
  throwing.texture.dispose = function disposeWithFailure() {
    originalThrowingDispose.call(this);
    throw new Error('throwing texture dispose failed');
  };
  const originalImageServiceDispose = harness.imageService.dispose.bind(
    harness.imageService
  );
  let imageServiceDisposeCalls = 0;
  harness.imageService.dispose = () => {
    imageServiceDisposeCalls++;
    originalImageServiceDispose();
    throw new Error('image service dispose failed');
  };

  let disposalError;
  assert.throws(
    () => harness.textureService.dispose(),
    error => {
      disposalError = error;
      return error instanceof AggregateError;
    }
  );
  assert.deepEqual(
    disposalError.errors.map(error => error.message),
    [
      'throwing texture dispose failed',
      'image service dispose failed'
    ]
  );
  assert.equal(throwing.texture.disposeCalls, 1);
  assert.equal(survivor.texture.disposeCalls, 1);
  assert.equal(throwing.image.src, '');
  assert.equal(survivor.image.src, '');
  assert.equal(imageServiceDisposeCalls, 1);

  assert.equal(harness.textureService.dispose(), false);
  assert.equal(throwing.texture.disposeCalls, 1);
  assert.equal(survivor.texture.disposeCalls, 1);
  assert.equal(imageServiceDisposeCalls, 1);
});

test('a completion racing with shutdown is released without creating a texture', async () => {
  let resolveLoad;
  let imageDisposeCalls = 0;
  let imageServiceDisposeCalls = 0;
  const imageResource = {
    kind: 'external-image-resource',
    image: {},
    requestedUrl: '/racing.png',
    resolvedUrl: '/racing.png',
    usedFallback: false,
    assetBinding: null,
    dispose() {
      imageDisposeCalls++;
      return imageDisposeCalls === 1;
    }
  };
  const imageService = {
    load() {
      return new Promise(resolve => {
        resolveLoad = resolve;
      });
    },
    dispose() {
      imageServiceDisposeCalls++;
      return imageServiceDisposeCalls === 1;
    }
  };
  let textureFactoryCalls = 0;
  const textureService = new ExternalTextureAssetService({
    imageService,
    createTexture() {
      textureFactoryCalls++;
      return { dispose() {} };
    }
  });
  const pending = textureService.load('/racing.png');
  await Promise.resolve();
  resolveLoad(imageResource);
  textureService.dispose();

  await assert.rejects(pending, /disposed during load/);
  assert.equal(imageServiceDisposeCalls, 1);
  assert.equal(imageDisposeCalls, 1);
  assert.equal(textureFactoryCalls, 0);
});

test('a null completion racing with shutdown cannot survive disposal', async () => {
  let resolveLoad;
  let imageServiceDisposeCalls = 0;
  let textureFactoryCalls = 0;
  const textureService = new ExternalTextureAssetService({
    imageService: {
      load() {
        return new Promise(resolve => {
          resolveLoad = resolve;
        });
      },
      dispose() {
        imageServiceDisposeCalls++;
      }
    },
    createTexture() {
      textureFactoryCalls++;
      return { dispose() {} };
    }
  });
  const pending = textureService.load('/nullable-race.png', {
    fallbackPolicy: { action: 'return-null' }
  });
  await Promise.resolve();
  resolveLoad(null);
  textureService.dispose();

  await assert.rejects(pending, /disposed during load/);
  assert.equal(imageServiceDisposeCalls, 1);
  assert.equal(textureFactoryCalls, 0);
});
