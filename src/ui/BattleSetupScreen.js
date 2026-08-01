const STEP_LABELS = Object.freeze([
  'Map',
  'Your Force',
  'Enemy Force',
  'Enemy AI',
  'Review'
]);

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function packageEntries(forcePackage, catalog) {
  return forcePackage.entries.map(entry => {
    const option = catalog.unitOptions[entry.optionId];
    return `<li><strong>${entry.count}x</strong> ${escapeHtml(option.name)}</li>`;
  }).join('');
}

function renderPackageSelection(side, factionId, state, catalog) {
  const packages = Object.values(catalog.forcePackages)
    .filter(forcePackage => forcePackage.factionId === factionId);
  const selectedId = state[`${side}Force`].packageId;
  const selected = catalog.forcePackages[selectedId] ?? packages[0];
  return `
    <label class="setup-field">
      <span>Formation package</span>
      <select data-setup-package="${side}">
        ${packages.map(forcePackage => `
          <option value="${forcePackage.id}" ${forcePackage.id === selected.id ? 'selected' : ''}>
            ${escapeHtml(forcePackage.name)}
          </option>
        `).join('')}
      </select>
    </label>
    <article class="setup-package-summary">
      <h4>${escapeHtml(selected.name)}</h4>
      <p>${escapeHtml(selected.description)}</p>
      <ul>${packageEntries(selected, catalog)}</ul>
    </article>
  `;
}

function renderCustomSelection(side, factionId, state, catalog) {
  const counts = state[`${side}Force`].counts;
  const maximum = catalog.maximumCountPerOption;
  const options = Object.values(catalog.unitOptions)
    .filter(option => option.factionId === factionId);
  return `
    <div class="setup-unit-picker" role="list">
      ${options.map(option => {
        const count = counts[option.id] ?? 0;
        return `
          <div class="setup-unit-row" role="listitem">
            <div class="setup-unit-copy">
              <strong>${escapeHtml(option.name)}</strong>
              <span>${escapeHtml(option.description)}</span>
            </div>
            <div class="setup-count-control">
              <button type="button" data-setup-count="-1" data-side="${side}" data-option-id="${option.id}" aria-label="Remove one ${escapeHtml(option.name)}">-</button>
              <input
                type="number"
                min="0"
                max="${maximum}"
                inputmode="numeric"
                value="${count}"
                data-setup-count-input
                data-side="${side}"
                data-option-id="${option.id}"
                aria-label="${escapeHtml(option.name)} count"
              >
              <button type="button" data-setup-count="1" data-side="${side}" data-option-id="${option.id}" aria-label="Add one ${escapeHtml(option.name)}">+</button>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderForceBuilder(side, factionId, state, catalog) {
  const country = catalog.countries[factionId];
  const force = state[`${side}Force`];
  return `
    <div class="setup-force-heading">
      <span class="setup-country-flag">${country.flagGlyph}</span>
      <div>
        <h3>${escapeHtml(country.name)}</h3>
        <p>Choose a formation package or build any legal mix a la carte.</p>
      </div>
    </div>
    <div class="setup-mode-toggle" role="radiogroup" aria-label="${side} force selection mode">
      <button type="button" data-setup-force-mode="package" data-side="${side}" class="${force.mode === 'package' ? 'active' : ''}" aria-pressed="${force.mode === 'package'}">Formation</button>
      <button type="button" data-setup-force-mode="custom" data-side="${side}" class="${force.mode === 'custom' ? 'active' : ''}" aria-pressed="${force.mode === 'custom'}">A la carte</button>
    </div>
    ${force.mode === 'package'
      ? renderPackageSelection(side, factionId, state, catalog)
      : renderCustomSelection(side, factionId, state, catalog)}
  `;
}

function selectionSummary(selection, factionId, catalog) {
  if (selection.mode === 'package') {
    const forcePackage = catalog.forcePackages[selection.packageId];
    return {
      title: forcePackage.name,
      entries: forcePackage.entries.map(entry => ({
        count: entry.count,
        name: catalog.unitOptions[entry.optionId].name
      }))
    };
  }
  return {
    title: 'A la carte',
    entries: Object.values(catalog.unitOptions)
      .filter(option => option.factionId === factionId)
      .flatMap(option => {
        const count = selection.counts[option.id] ?? 0;
        return count > 0 ? [{ count, name: option.name }] : [];
      })
  };
}

function renderReviewSide(label, factionId, selection, catalog) {
  const country = catalog.countries[factionId];
  const summary = selectionSummary(selection, factionId, catalog);
  return `
    <article class="setup-review-card">
      <span class="setup-review-label">${label}</span>
      <h3>${country.flagGlyph} ${escapeHtml(country.name)}</h3>
      <p>${escapeHtml(summary.title)}</p>
      <ul>
        ${summary.entries.map(entry =>
          `<li><strong>${entry.count}x</strong> ${escapeHtml(entry.name)}</li>`
        ).join('')}
      </ul>
    </article>
  `;
}

export function renderBattleSetupMarkup({
  maps,
  catalog,
  aiLevels,
  state,
  errorMessage = '',
  launching = false
}) {
  const map = maps.find(candidate => candidate.id === state.mapId) ?? maps[0];
  const playerCountry = catalog.countries[state.playerFactionId];
  const enemyCountry = catalog.countries[state.enemyFactionId];
  const difficulty = aiLevels[state.enemyAiDifficulty];
  const stepContent = [
    `
      <div class="setup-stage-intro">
        <span class="setup-kicker">BATTLEFIELD</span>
        <h2>Select map</h2>
        <p>Choose the terrain and deployment areas for this battle.</p>
      </div>
      <label class="setup-map-card">
        <span class="setup-map-art setup-map-art-${escapeHtml(map.previewStyle ?? 'generic')}" aria-hidden="true"></span>
        <span class="setup-map-copy">
          <strong>${escapeHtml(map.title)}</strong>
          <span>${escapeHtml(map.description ?? 'Configured tactical battlefield.')}</span>
        </span>
        <select id="setup-map-select" aria-label="Battle map">
          ${maps.map(candidate => `
            <option value="${candidate.id}" ${candidate.id === state.mapId ? 'selected' : ''}>
              ${escapeHtml(candidate.title)}
            </option>
          `).join('')}
        </select>
      </label>
    `,
    `
      <div class="setup-stage-intro">
        <span class="setup-kicker">FRIENDLY FORCE</span>
        <h2>Choose country and units</h2>
      </div>
      <label class="setup-field setup-country-select">
        <span>Country</span>
        <select id="setup-player-country">
          ${Object.values(catalog.countries).map(country => `
            <option value="${country.id}" ${country.id === state.playerFactionId ? 'selected' : ''}>
              ${country.flagGlyph} ${escapeHtml(country.name)}
            </option>
          `).join('')}
        </select>
      </label>
      ${renderForceBuilder('player', state.playerFactionId, state, catalog)}
    `,
    `
      <div class="setup-stage-intro">
        <span class="setup-kicker">OPPOSING FORCE</span>
        <h2>Choose enemy country and units</h2>
      </div>
      <label class="setup-field setup-country-select">
        <span>Enemy country</span>
        <select id="setup-enemy-country">
          ${Object.values(catalog.countries).map(country => `
            <option value="${country.id}" ${country.id === state.enemyFactionId ? 'selected' : ''}>
              ${country.flagGlyph} ${escapeHtml(country.name)}
            </option>
          `).join('')}
        </select>
      </label>
      ${renderForceBuilder('enemy', state.enemyFactionId, state, catalog)}
    `,
    `
      <div class="setup-stage-intro">
        <span class="setup-kicker">TACTICAL AI</span>
        <h2>Enemy difficulty</h2>
        <p>Difficulty changes enemy experience and leadership through existing deterministic spotting, aim, and dispersion mechanics.</p>
      </div>
      <div class="setup-ai-grid" role="radiogroup" aria-label="Enemy AI difficulty">
        ${Object.values(aiLevels).map(level => `
          <label class="setup-ai-card ${level.id === state.enemyAiDifficulty ? 'selected' : ''}">
            <input type="radio" name="setup-ai" value="${level.id}" ${level.id === state.enemyAiDifficulty ? 'checked' : ''}>
            <strong>${escapeHtml(level.name)}</strong>
            <span>${escapeHtml(level.description)}</span>
          </label>
        `).join('')}
      </div>
    `,
    `
      <div class="setup-stage-intro">
        <span class="setup-kicker">FINAL ORDERS</span>
        <h2>Review battle</h2>
      </div>
      <div class="setup-review-map">
        <span>MAP</span>
        <strong>${escapeHtml(map.title)}</strong>
      </div>
      <div class="setup-review-grid">
        ${renderReviewSide(
          'YOUR FORCE',
          state.playerFactionId,
          state.playerForce,
          catalog
        )}
        <div class="setup-versus">VS</div>
        ${renderReviewSide(
          'ENEMY FORCE',
          state.enemyFactionId,
          state.enemyForce,
          catalog
        )}
      </div>
      <div class="setup-review-ai">
        <span>ENEMY AI</span>
        <strong>${escapeHtml(difficulty.name)}</strong>
        <small>${escapeHtml(difficulty.description)}</small>
      </div>
    `
  ][state.step];

  return `
    <section class="battle-setup-screen" aria-labelledby="battle-setup-title">
      <div class="battle-setup-shell">
        <header class="battle-setup-header">
          <div>
            <span class="setup-kicker">COMBAT MISSION 1940</span>
            <h1 id="battle-setup-title">Create Battle</h1>
            <p>Choose a battlefield, configure both forces, and review the mission.</p>
          </div>
        </header>
        <form id="battle-setup-form">
          <div class="setup-stage">${stepContent}</div>
          <div class="setup-error" role="alert" ${errorMessage ? '' : 'hidden'}>
            ${escapeHtml(errorMessage)}
          </div>
          <footer class="setup-navigation">
            <button type="button" class="setup-button secondary" data-setup-action="back" ${state.step === 0 || launching ? 'disabled' : ''}>Back</button>
            <span class="setup-progress">Step ${state.step + 1} of ${STEP_LABELS.length}</span>
            ${state.step < STEP_LABELS.length - 1
              ? `<button type="button" class="setup-button primary" data-setup-action="next" ${launching ? 'disabled' : ''}>Next</button>`
              : `<button type="submit" class="setup-button launch" ${launching ? 'disabled' : ''}>${launching ? 'Loading battlefield...' : 'Start Battle'}</button>`}
          </footer>
        </form>
      </div>
    </section>
  `;
}

export class BattleSetupScreen {
  constructor({
    root,
    maps,
    catalog,
    aiLevels,
    validateSetup,
    onStart
  }) {
    if (!root) throw new Error('BattleSetupScreen requires a root element');
    if (!Array.isArray(maps) || maps.length === 0) {
      throw new Error('BattleSetupScreen requires at least one map');
    }
    if (typeof validateSetup !== 'function') {
      throw new TypeError('BattleSetupScreen requires validateSetup');
    }
    if (typeof onStart !== 'function') {
      throw new TypeError('BattleSetupScreen requires onStart');
    }
    const factionIds = Object.keys(catalog.countries);
    if (factionIds.length < 2) {
      throw new Error('BattleSetupScreen requires at least two countries');
    }
    this.root = root;
    this.maps = maps;
    this.catalog = catalog;
    this.aiLevels = aiLevels;
    this.validateSetup = validateSetup;
    this.onStart = onStart;
    this.errorMessage = '';
    this.launching = false;
    this.state = {
      step: 0,
      mapId: maps[0].id,
      playerFactionId: factionIds[0],
      enemyFactionId: factionIds[1],
      enemyAiDifficulty: 'regular',
      playerForce: this.defaultForce(factionIds[0]),
      enemyForce: this.defaultForce(factionIds[1])
    };
    this.handleClick = this.handleClick.bind(this);
    this.handleChange = this.handleChange.bind(this);
    this.handleInput = this.handleInput.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
  }

  defaultForce(factionId) {
    return {
      mode: 'package',
      packageId: this.catalog.defaultPackageByFaction[factionId],
      counts: {}
    };
  }

  mount() {
    document.body.classList.add('battle-setup-active');
    document.body.dataset.gameStatus = 'setup';
    this.root.hidden = false;
    this.root.addEventListener('click', this.handleClick);
    this.root.addEventListener('change', this.handleChange);
    this.root.addEventListener('input', this.handleInput);
    this.root.addEventListener('submit', this.handleSubmit);
    this.render();
  }

  render() {
    this.root.innerHTML = renderBattleSetupMarkup({
      maps: this.maps,
      catalog: this.catalog,
      aiLevels: this.aiLevels,
      state: this.state,
      errorMessage: this.errorMessage,
      launching: this.launching
    });
  }

  selectionForSide(side) {
    return this.state[`${side}Force`];
  }

  factionForSide(side) {
    return this.state[`${side}FactionId`];
  }

  validateConfiguredForces() {
    return this.validateSetup({
      playerFactionId: this.state.playerFactionId,
      playerForceSelection: this.state.playerForce,
      enemyFactionId: this.state.enemyFactionId,
      enemyForceSelection: this.state.enemyForce
    });
  }

  validateCurrentStep() {
    if ([1, 2, 4].includes(this.state.step)) {
      this.validateConfiguredForces();
    }
    if (!this.maps.some(map => map.id === this.state.mapId)) {
      throw new Error('Select an available map');
    }
  }

  updateCountry(side, factionId) {
    const otherSide = side === 'player' ? 'enemy' : 'player';
    const otherFactionId = this.factionForSide(otherSide);
    this.state[`${side}FactionId`] = factionId;
    this.state[`${side}Force`] = this.defaultForce(factionId);
    if (otherFactionId === factionId) {
      const replacement = Object.keys(this.catalog.countries)
        .find(candidate => candidate !== factionId);
      this.state[`${otherSide}FactionId`] = replacement;
      this.state[`${otherSide}Force`] = this.defaultForce(replacement);
    }
  }

  setCount(side, optionId, value) {
    const force = this.selectionForSide(side);
    const bounded = Math.max(
      0,
      Math.min(
        this.catalog.maximumCountPerOption,
        Number.isFinite(value) ? Math.floor(value) : 0
      )
    );
    force.counts[optionId] = bounded;
  }

  handleClick(event) {
    const actionButton = event.target.closest('[data-setup-action]');
    if (actionButton) {
      const action = actionButton.dataset.setupAction;
      if (action === 'back') {
        this.state.step = Math.max(0, this.state.step - 1);
        this.errorMessage = '';
        this.render();
      } else if (action === 'next') {
        try {
          this.validateCurrentStep();
          this.state.step = Math.min(
            STEP_LABELS.length - 1,
            this.state.step + 1
          );
          this.errorMessage = '';
        } catch (error) {
          this.errorMessage = error.message;
        }
        this.render();
      }
      return;
    }
    const modeButton = event.target.closest('[data-setup-force-mode]');
    if (modeButton) {
      const side = modeButton.dataset.side;
      this.selectionForSide(side).mode =
        modeButton.dataset.setupForceMode;
      this.errorMessage = '';
      this.render();
      return;
    }
    const countButton = event.target.closest('[data-setup-count]');
    if (countButton) {
      const side = countButton.dataset.side;
      const optionId = countButton.dataset.optionId;
      const current = this.selectionForSide(side).counts[optionId] ?? 0;
      this.setCount(
        side,
        optionId,
        current + Number(countButton.dataset.setupCount)
      );
      this.render();
    }
  }

  handleChange(event) {
    if (event.target.id === 'setup-map-select') {
      this.state.mapId = event.target.value;
      this.render();
    } else if (event.target.id === 'setup-player-country') {
      this.updateCountry('player', event.target.value);
      this.render();
    } else if (event.target.id === 'setup-enemy-country') {
      this.updateCountry('enemy', event.target.value);
      this.render();
    } else if (event.target.matches('[data-setup-package]')) {
      const side = event.target.dataset.setupPackage;
      this.selectionForSide(side).packageId = event.target.value;
      this.render();
    } else if (event.target.name === 'setup-ai') {
      this.state.enemyAiDifficulty = event.target.value;
      this.render();
    }
  }

  handleInput(event) {
    if (!event.target.matches('[data-setup-count-input]')) return;
    this.setCount(
      event.target.dataset.side,
      event.target.dataset.optionId,
      Number(event.target.value)
    );
  }

  async handleSubmit(event) {
    event.preventDefault();
    if (this.launching) return;
    try {
      this.validateConfiguredForces();
      this.launching = true;
      this.errorMessage = '';
      this.render();
      await this.onStart({
        mapId: this.state.mapId,
        playerFactionId: this.state.playerFactionId,
        enemyFactionId: this.state.enemyFactionId,
        playerForceSelection: {
          ...this.state.playerForce,
          counts: { ...this.state.playerForce.counts }
        },
        enemyForceSelection: {
          ...this.state.enemyForce,
          counts: { ...this.state.enemyForce.counts }
        },
        enemyAiDifficulty: this.state.enemyAiDifficulty
      });
    } catch (error) {
      this.launching = false;
      this.errorMessage = error.message;
      if (typeof document !== 'undefined' && document.body) {
        document.body.dataset.gameStatus = 'setup';
      }
      this.render();
    }
  }

  hide() {
    this.root.hidden = true;
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('battle-setup-active');
    }
  }
}
