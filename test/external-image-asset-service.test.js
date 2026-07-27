import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ExternalImageAssetLoadError,
  ExternalImageAssetService
} from '../src/assets/ExternalImageAssetService.js';

class FakeImage extends EventTarget {
  constructor(outcomes) {
    super();
    this.outcomes = outcomes;
    this._src = '';
    this.naturalWidth = 1600;
    this.naturalHeight = 900;
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

function createHarness(entries = []) {
  const outcomes = new Map(entries);
  const images = [];
  const revoked = [];
  let objectUrlSequence = 0;
  const service = new ExternalImageAssetService({
    createImage() {
      const image = new FakeImage(outcomes);
      images.push(image);
      return image;
    },
    createObjectUrl() {
      objectUrlSequence++;
      return `blob:test-${objectUrlSequence}`;
    },
    revokeObjectUrl(url) {
      revoked.push(url);
    }
  });
  return { service, images, revoked, outcomes };
}

test('external image service deduplicates loads and retains logical asset identity', async () => {
  const { service, images } = createHarness([['/reference.png', 'load']]);
  const options = {
    cacheKey: 'logical:test.reference:pack-a',
    assetBinding: {
      logicalId: 'test.reference',
      sourcePackId: 'pack-a'
    }
  };
  const [first, second] = await Promise.all([
    service.load('/reference.png', options),
    service.load('/reference.png', options)
  ]);

  assert.equal(first, second);
  assert.equal(images.length, 1);
  assert.equal(first.kind, 'external-image-resource');
  assert.equal(first.image, images[0]);
  assert.equal(first.requestedUrl, '/reference.png');
  assert.equal(first.resolvedUrl, '/reference.png');
  assert.equal(first.usedFallback, false);
  assert.deepEqual(first.assetBinding, {
    logicalId: 'test.reference',
    sourcePackId: 'pack-a'
  });

  assert.equal(first.dispose(), true);
  assert.equal(first.dispose(), false);
  assert.equal(images[0].src, '');
  const reloaded = await service.load('/reference.png', options);
  assert.notEqual(reloaded, first);
  assert.equal(images.length, 2);
  service.dispose();
});

test('external image fallback policies are explicit and retryable', async () => {
  const { service, images, outcomes } = createHarness([
    ['/missing.png', 'error'],
    ['/fallback.png', 'load']
  ]);
  const fallback = await service.load('/missing.png', {
    cacheKey: 'fallback',
    fallbackPolicy: {
      action: 'url',
      url: '/fallback.png',
      onFailure: 'throw'
    }
  });
  assert.equal(fallback.usedFallback, true);
  assert.equal(fallback.requestedUrl, '/missing.png');
  assert.equal(fallback.resolvedUrl, '/fallback.png');
  assert.equal(images.length, 2);

  const unavailable = await service.load('/still-missing.png', {
    cacheKey: 'nullable',
    fallbackPolicy: { action: 'return-null' }
  });
  assert.equal(unavailable, null);
  outcomes.set('/still-missing.png', 'load');
  const retry = await service.load('/still-missing.png', {
    cacheKey: 'nullable',
    fallbackPolicy: { action: 'return-null' }
  });
  assert.equal(retry.resolvedUrl, '/still-missing.png');

  await assert.rejects(
    service.load('/never-there.png', {
      cacheKey: 'throwing',
      fallbackPolicy: { action: 'throw' }
    }),
    ExternalImageAssetLoadError
  );
  await assert.rejects(
    service.load('javascript:alert(1)'),
    /unsupported scheme javascript/
  );
  service.dispose();
});

test('service disposal cancels pending loads and revokes owned object URLs once', async () => {
  const { service, images, revoked } = createHarness([['/pending.png', 'pending']]);
  const objectUrl = service.createObjectUrl({});
  const pending = service.load('/pending.png');
  await Promise.resolve();

  assert.equal(service.dispose(), true);
  assert.equal(service.dispose(), false);
  assert.deepEqual(revoked, [objectUrl]);
  assert.equal(images[0].src, '');
  await assert.rejects(pending, /disposed/);
  await assert.rejects(service.load('/pending.png'), /disposed/);
  assert.throws(() => service.createObjectUrl({}), /disposed/);
});
