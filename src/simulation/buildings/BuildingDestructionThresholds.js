function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireExactKeys(record, expected, path) {
  const expectedKeys = new Set(expected);
  for (const key of Object.keys(record)) {
    if (!expectedKeys.has(key)) {
      throw new Error(`${path}.${key} is not supported`);
    }
  }
}

function compareSectionIds(left, right) {
  if (left.sectionId < right.sectionId) return -1;
  if (left.sectionId > right.sectionId) return 1;
  return 0;
}

export function normalizeBuildingDestructionThresholds(
  policy,
  {
    allowNull = false,
    descriptor = null,
    path = 'destructionThresholds'
  } = {}
) {
  if (policy === undefined || (allowNull && policy === null)) return null;
  if (!isPlainRecord(policy)) {
    throw new TypeError(`${path} must be a plain record`);
  }
  requireExactKeys(policy, ['approximation', 'sectionCollapse'], path);

  if (
    typeof policy.approximation !== 'string'
    || policy.approximation.trim().length === 0
  ) {
    throw new Error(`${path}.approximation must be a non-blank string`);
  }
  if (
    !Array.isArray(policy.sectionCollapse)
    || policy.sectionCollapse.length === 0
  ) {
    throw new Error(`${path}.sectionCollapse must be a non-empty array`);
  }

  const knownSectionIds = descriptor == null
    ? null
    : new Set(descriptor.sections.map(section => section.id));
  const seenSectionIds = new Set();
  const sectionCollapse = policy.sectionCollapse.map((entry, index) => {
    const entryPath = `${path}.sectionCollapse[${index}]`;
    if (!isPlainRecord(entry)) {
      throw new TypeError(`${entryPath} must be a plain record`);
    }
    requireExactKeys(
      entry,
      ['sectionId', 'atOrBelowHealthFraction'],
      entryPath
    );
    if (
      typeof entry.sectionId !== 'string'
      || entry.sectionId.trim().length === 0
    ) {
      throw new Error(`${entryPath}.sectionId must be a non-empty string`);
    }
    if (seenSectionIds.has(entry.sectionId)) {
      throw new Error(`${path}.sectionCollapse has duplicate sectionId ${entry.sectionId}`);
    }
    if (knownSectionIds && !knownSectionIds.has(entry.sectionId)) {
      throw new Error(`${path}.sectionCollapse references unknown section ${entry.sectionId}`);
    }
    if (
      !Number.isFinite(entry.atOrBelowHealthFraction)
      || entry.atOrBelowHealthFraction <= 0
      || entry.atOrBelowHealthFraction > 1
    ) {
      throw new Error(
        `${entryPath}.atOrBelowHealthFraction must be finite and within (0, 1]`
      );
    }
    seenSectionIds.add(entry.sectionId);
    return {
      sectionId: entry.sectionId,
      atOrBelowHealthFraction: entry.atOrBelowHealthFraction
    };
  });
  sectionCollapse.sort(compareSectionIds);

  return {
    approximation: policy.approximation,
    sectionCollapse
  };
}
