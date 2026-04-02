(() => {
  const DATA = window.IFR_APP_DATA || { meta: {}, topics: [], guides: [] };
  const GUIDES = DATA.guides || [];
  const TOPICS = DATA.topics || [];
  const GUIDE_ORDER = Object.fromEntries(GUIDES.map((guide, index) => [guide.id, index]));
  const STATE = { view: 'inicio', guide: 'all', topic: 'all', query: '' };
  const CARD_STATE = {};

  const VIEWS = [
    { id: 'inicio', label: 'Inicio' },
    { id: 'guia-1', label: 'Guía 1' },
    { id: 'guia-2', label: 'Guía 2' },
    { id: 'temas', label: 'Temas' },
    { id: 'todos', label: 'Todos los reactivos' }
  ];

  const GUIDE_TEXT = {
    'guia-1': 'Primera guía con reactivos 93 a 104 y cuatro opciones por ejercicio.',
    'guia-2': 'Segunda guía con reactivos 93 a 104 y cinco opciones por ejercicio.'
  };

  const byId = (id) => document.getElementById(id);

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const EXERCISES = GUIDES.flatMap((guide) =>
    (guide.exercises || []).map((exercise) => ({
      ...exercise,
      guideOrder: GUIDE_ORDER[guide.id] || 0,
      searchIndex: normalizeText([
        exercise.guideName,
        exercise.number,
        exercise.topic,
        exercise.question,
        exercise.hint,
        exercise.whatToSolve,
        exercise.argument,
        ...(exercise.options || []).map((option) => option.text)
      ].join(' '))
    }))
  );

  function cardState(exerciseId) {
    if (!CARD_STATE[exerciseId]) {
      CARD_STATE[exerciseId] = {
        status: 'idle',
        selectedOption: '',
        hintOpen: false
      };
    }

    return CARD_STATE[exerciseId];
  }

  function paragraphs(text) {
    const blocks = String(text || '')
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .filter(Boolean);

    if (!blocks.length) return '';

    return `<div class="text">${blocks
      .map((block) => block.split('\n').map((line) => `<p>${esc(line)}</p>`).join(''))
      .join('')}</div>`;
  }

  function questionMarkup(lines) {
    return `<div class="question">${(Array.isArray(lines) ? lines : [])
      .filter(Boolean)
      .map((line) => `<p>${esc(line)}</p>`)
      .join('')}</div>`;
  }

  function currentGuide() {
    if (STATE.view === 'guia-1') return 'guia-1';
    if (STATE.view === 'guia-2') return 'guia-2';
    return STATE.guide;
  }

  function matches() {
    const guide = currentGuide();
    const topic = STATE.topic;
    const query = normalizeText(STATE.query.trim());

    return EXERCISES.filter((exercise) => {
      if (guide !== 'all' && exercise.guideId !== guide) return false;
      if (topic !== 'all' && exercise.topicId !== topic) return false;
      if (query && !exercise.searchIndex.includes(query)) return false;
      return true;
    }).sort((left, right) => {
      if (left.guideOrder !== right.guideOrder) return left.guideOrder - right.guideOrder;
      return left.sourceOrder - right.sourceOrder;
    });
  }

  function distinct(exercises, field) {
    return new Set(exercises.map((exercise) => exercise[field])).size;
  }

  function chip(label, active, action, data = {}) {
    const attrs = Object.entries(data)
      .map(([key, value]) => ` ${key}="${esc(value)}"`)
      .join('');
    return `<button class="chip${active ? ' active' : ''}" type="button" data-action="${esc(action)}"${attrs}>${esc(label)}</button>`;
  }

  function selectionState(exercise) {
    const state = cardState(exercise.id);
    return {
      selected: state.selectedOption || '',
      correct: exercise.correctOption?.label || '',
      status: state.status
    };
  }

  function optionTone(exercise, option) {
    const { selected, status } = selectionState(exercise);

    if (status === 'idle') {
      return { tone: '', label: 'Selecciona', disabled: false };
    }

    if (status === 'wrong') {
      return {
        tone: option.label === selected ? ' is-wrong' : ' is-locked',
        label: option.label === selected ? 'Incorrecta' : 'Bloqueada',
        disabled: true
      };
    }

    if (status === 'correct') {
      return {
        tone: option.label === selected ? ' is-correct' : ' is-locked',
        label: option.label === selected ? 'Correcta' : 'Bloqueada',
        disabled: true
      };
    }

    return { tone: '', label: 'Selecciona', disabled: false };
  }

  function optionList(exercise) {
    return `<div class="opts">${(exercise.options || [])
      .map((option) => {
        const state = optionTone(exercise, option);
        return `<button class="opt${state.tone}" type="button" data-action="pick-option" data-id="${esc(exercise.id)}" data-option="${esc(option.label)}"${state.disabled ? ' disabled' : ''}>
          <div class="row">
            <span class="let">${esc(option.label)}</span>
            <span class="lab">${esc(state.label)}</span>
          </div>
          <div class="opt-text">${esc(option.text)}</div>
        </button>`;
      })
      .join('')}</div>`;
  }

  function retryButton(exercise) {
    const { status } = selectionState(exercise);
    if (status !== 'wrong') return '';
    return `<button class="action retry-action" type="button" data-action="retry-option" data-id="${esc(exercise.id)}">Reintentar</button>`;
  }

  function hintButton(exerciseId) {
    const open = cardState(exerciseId).hintOpen;
    return `<button class="action hint-action${open ? ' open' : ''}" type="button" data-action="toggle-hint" data-id="${esc(exerciseId)}">${open ? 'Ocultar pista' : 'Ver pista'}</button>`;
  }

  function attemptMessage(exercise) {
    const { status } = selectionState(exercise);

    if (status === 'wrong') {
      return `<section class="attempt-state warning">
        <div class="meta">Intenta de nuevo</div>
        <p>Revisa la pista y vuelve a intentarlo 🧠</p>
      </section>`;
    }

    if (status === 'correct') {
      return `<section class="attempt-state success">
        <div class="meta">Acierto confirmado</div>
        <p>Bien resuelto ✅ Ahora revisa por qué las demás no corresponden.</p>
      </section>`;
    }

    return '';
  }

  function analysisCard(item, compact = false) {
    return `<article class="analysis${compact ? ' compact' : ''}">
      <div class="analysis-head">
        <span class="badge">${esc(item.label)}</span>
        <span>${esc(item.option || `Opción ${item.label}`)}</span>
      </div>
      ${paragraphs(item.text)}
    </article>`;
  }

  function solvedContent(exercise) {
    const { status, correct } = selectionState(exercise);
    if (status !== 'correct') return '';

    const correctAnalysis = (exercise.optionsAnalysis || []).find((item) => item.label === correct);
    const wrongAnalyses = (exercise.optionsAnalysis || []).filter((item) => item.label !== correct);

    return `<section class="feedback-stack">
      ${exercise.whatToSolve ? `
        <article class="support solved-panel">
          <div class="meta">Qué pide resolver</div>
          ${paragraphs(exercise.whatToSolve)}
        </article>
      ` : ''}
      ${correctAnalysis ? `
        <article class="support solved-panel final">
          <div class="meta">Por qué la correcta sí corresponde</div>
          ${analysisCard(correctAnalysis, true)}
        </article>
      ` : ''}
      ${wrongAnalyses.length ? `
        <article class="support solved-panel">
          <div class="meta">Por qué las demás no corresponden</div>
          <div class="analysis-grid">${wrongAnalyses.map((item) => analysisCard(item)).join('')}</div>
        </article>
      ` : ''}
      ${exercise.argument ? `
        <article class="support solved-panel">
          <div class="meta">Análisis del reactivo</div>
          ${paragraphs(exercise.argument)}
        </article>
      ` : ''}
    </section>`;
  }

  function coordinateLabel(value, axis) {
    if (value === 0) return axis === 'x' ? '0°' : '0°';
    if (axis === 'x') return value < 0 ? `${Math.abs(value)}° O` : `${value}° E`;
    return value < 0 ? `${Math.abs(value)}° S` : `${value}° N`;
  }

  function renderCoordinatesPoint(spec) {
    const width = 360;
    const height = 300;
    const padding = { top: 24, right: 30, bottom: 36, left: 48 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const xTicks = spec.xTicks || [-30, -20, -10, 0, 10, 20, 30];
    const yTicks = spec.yTicks || [-30, -20, -10, 0, 10, 20, 30];
    const xMin = Math.min(...xTicks);
    const xMax = Math.max(...xTicks);
    const yMin = Math.min(...yTicks);
    const yMax = Math.max(...yTicks);

    const scaleX = (value) => padding.left + ((value - xMin) / (xMax - xMin || 1)) * plotWidth;
    const scaleY = (value) => padding.top + plotHeight - ((value - yMin) / (yMax - yMin || 1)) * plotHeight;
    const pointX = scaleX(spec.point.x);
    const pointY = scaleY(spec.point.y);

    return `<section class="visual-support">
      <div class="visual-head">
        <div>
          <div class="meta">Apoyo visual</div>
          <h4>${esc(spec.title)}</h4>
        </div>
        <span class="visual-badge">Coordenadas</span>
      </div>
      <div class="map-grid-wrap">
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(spec.title)}">
          <rect x="0" y="0" width="${width}" height="${height}" rx="28" fill="rgba(255,255,255,0.98)"/>
          ${yTicks.map((tick) => `<line x1="${padding.left}" y1="${scaleY(tick)}" x2="${width - padding.right}" y2="${scaleY(tick)}" class="geo-grid"/>`).join('')}
          ${xTicks.map((tick) => `<line x1="${scaleX(tick)}" y1="${padding.top}" x2="${scaleX(tick)}" y2="${height - padding.bottom}" class="geo-grid"/>`).join('')}
          <line x1="${padding.left}" y1="${scaleY(0)}" x2="${width - padding.right}" y2="${scaleY(0)}" class="geo-axis"/>
          <line x1="${scaleX(0)}" y1="${padding.top}" x2="${scaleX(0)}" y2="${height - padding.bottom}" class="geo-axis"/>
          ${xTicks.map((tick) => `<text x="${scaleX(tick)}" y="${height - 12}" text-anchor="middle" class="geo-tick">${esc(coordinateLabel(tick, 'x'))}</text>`).join('')}
          ${yTicks.map((tick) => `<text x="${padding.left - 10}" y="${scaleY(tick) + 4}" text-anchor="end" class="geo-tick">${esc(coordinateLabel(tick, 'y'))}</text>`).join('')}
          <text x="${width / 2}" y="${scaleY(0) - 8}" text-anchor="middle" class="geo-label">Ecuador</text>
          <text x="${scaleX(0) + 12}" y="${padding.top - 6}" class="geo-label">Meridiano 0°</text>
          <circle cx="${pointX}" cy="${pointY}" r="7" class="geo-point"/>
          <text x="${pointX + 12}" y="${pointY - 10}" class="geo-point-label">${esc(spec.pointLabel)}</text>
          <text x="${width - 18}" y="${scaleY(0) - 10}" class="geo-dir">E</text>
          <text x="${padding.left - 20}" y="${scaleY(0) - 10}" class="geo-dir">O</text>
          <text x="${scaleX(0) + 12}" y="${padding.top + 12}" class="geo-dir">N</text>
          <text x="${scaleX(0) + 12}" y="${height - padding.bottom + 18}" class="geo-dir">S</text>
        </svg>
      </div>
    </section>`;
  }

  function renderLatitudeReference(spec) {
    return `<section class="visual-support">
      <div class="visual-head">
        <div>
          <div class="meta">Apoyo visual</div>
          <h4>${esc(spec.title)}</h4>
        </div>
        <span class="visual-badge">Concepto base</span>
      </div>
      <div class="lat-ref-wrap">
        <svg viewBox="0 0 360 240" role="img" aria-label="${esc(spec.title)}">
          <rect x="0" y="0" width="360" height="240" rx="28" fill="rgba(255,255,255,0.98)"/>
          <circle cx="180" cy="120" r="74" class="lat-sphere"/>
          <line x1="180" y1="32" x2="180" y2="208" class="lat-axis"/>
          <line x1="70" y1="120" x2="290" y2="120" class="lat-axis"/>
          <path d="M106 94c18 8 45 12 74 12s56-4 74-12" class="lat-grid"/>
          <path d="M106 146c18-8 45-12 74-12s56 4 74 12" class="lat-grid"/>
          <text x="180" y="112" text-anchor="middle" class="geo-label">Ecuador</text>
          <text x="192" y="58" class="geo-label">Meridiano 0°</text>
          <text x="180" y="26" text-anchor="middle" class="geo-dir">90° N</text>
          <text x="180" y="226" text-anchor="middle" class="geo-dir">90° S</text>
          <text x="42" y="126" class="geo-dir">180° O</text>
          <text x="286" y="126" class="geo-dir">180° E</text>
          <text x="180" y="86" text-anchor="middle" class="lat-note">Latitud: norte o sur</text>
          <text x="180" y="160" text-anchor="middle" class="lat-note">Longitud: este u oeste</text>
        </svg>
      </div>
    </section>`;
  }

  function renderMatchColumns(spec) {
    return `<section class="visual-support">
      <div class="visual-head">
        <div>
          <div class="meta">Apoyo visual</div>
          <h4>${esc(spec.title)}</h4>
        </div>
        <span class="visual-badge">Relación</span>
      </div>
      <div class="match-columns">
        <article class="column-card">
          <div class="column-head">${esc(spec.leftTitle)}</div>
          <ul>${(spec.leftItems || []).map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
        </article>
        <article class="column-card">
          <div class="column-head">${esc(spec.rightTitle)}</div>
          <ul>${(spec.rightItems || []).map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
        </article>
      </div>
    </section>`;
  }

  function visualBlock(exercise) {
    const spec = exercise.visualSpec;
    if (!spec) return '';

    if (spec.type === 'coordinates-point') return renderCoordinatesPoint(spec);
    if (spec.type === 'latitude-reference') return renderLatitudeReference(spec);
    if (spec.type === 'match-columns') return renderMatchColumns(spec);
    return '';
  }

  function questionBlock(exercise) {
    const spec = exercise.visualSpec;

    if (spec?.type === 'match-columns') {
      return `${questionMarkup(exercise.questionLines.slice(0, 1))}${visualBlock(exercise)}`;
    }

    return `${questionMarkup(exercise.questionLines)}${visualBlock(exercise)}`;
  }

  function card(exercise) {
    return `<article class="card" id="reactivo-${esc(exercise.id)}">
      <div class="head">
        <div>
          <div class="type">${esc(`${exercise.guideName} · Reactivo ${exercise.number}`)}</div>
          <h3>${esc(exercise.topic)}</h3>
        </div>
      </div>
      <div class="layout">
        <div class="block question-block">
          <div class="problem-head">
            <div class="meta">Pregunta</div>
            <span class="reactivo-chip">${esc(`${exercise.options.length} opciones`)}</span>
          </div>
          ${questionBlock(exercise)}
        </div>
        <div class="block">
          <div class="problem-head">
            <div class="meta">Opciones</div>
          </div>
          ${optionList(exercise)}
        </div>
      </div>
      <div class="actions act">
        ${retryButton(exercise)}
        ${hintButton(exercise.id)}
      </div>
      ${attemptMessage(exercise)}
      <section class="support hint"${cardState(exercise.id).hintOpen ? '' : ' hidden'}>
        <div class="meta">Pista</div>
        ${paragraphs(exercise.hint)}
      </section>
      ${solvedContent(exercise)}
    </article>`;
  }

  function guideSection(guide, exercises) {
    if (!exercises.length) return '';

    return `<section class="section">
      <header class="section-head">
        <div>
          <h2>${esc(guide.name)}</h2>
          <p>${esc(GUIDE_TEXT[guide.id] || 'Consulta los reactivos de esta guía sin alterar su secuencia original.')}</p>
        </div>
        <span class="count">${esc(String(exercises.length))} reactivos</span>
      </header>
      <div class="cards">${exercises.map(card).join('')}</div>
    </section>`;
  }

  function topicSection(topic, exercises) {
    const byGuide = new Map();

    exercises.forEach((exercise) => {
      if (!byGuide.has(exercise.guideId)) byGuide.set(exercise.guideId, []);
      byGuide.get(exercise.guideId).push(exercise);
    });

    const splits = Array.from(byGuide.entries())
      .sort((left, right) => (GUIDE_ORDER[left[0]] || 0) - (GUIDE_ORDER[right[0]] || 0))
      .map(([guideId, items]) => {
        const guide = GUIDES.find((entry) => entry.id === guideId);
        return `<div class="guide-split">
          <div class="guide-split-head">
            <h3>${esc(guide ? guide.name : guideId)}</h3>
            <span>${esc(`${items.length} reactivos en su orden original`)}</span>
          </div>
          <div class="cards">${items.map(card).join('')}</div>
        </div>`;
      })
      .join('');

    return `<section class="section">
      <header class="section-head">
        <div>
          <h2>${esc(topic.name)}</h2>
          <p>La agrupación por tema facilita el repaso, pero cada guía conserva el orden fuente de sus reactivos.</p>
        </div>
        <span class="count">${esc(String(exercises.length))} reactivos</span>
      </header>
      ${splits}
    </section>`;
  }

  function home() {
    const previews = GUIDES.map((guide) => guideSection(guide, guide.exercises.slice(0, 2))).join('');

    return previews;
  }

  function renderPresetNav() {
    return VIEWS.map((view) => chip(view.label, STATE.view === view.id, 'view', { 'data-view': view.id })).join('');
  }

  function renderGuideChips() {
    return [
      chip('Todas las guías', currentGuide() === 'all' && !['guia-1', 'guia-2'].includes(STATE.view), 'guide', { 'data-guide': 'all' }),
      ...GUIDES.map((guide) => chip(guide.name, currentGuide() === guide.id, 'guide', { 'data-guide': guide.id }))
    ].join('');
  }

  function renderTopicChips(list) {
    const visibleTopics = STATE.view === 'inicio'
      ? TOPICS
      : TOPICS.filter((topic) => list.some((exercise) => exercise.topicId === topic.id) || STATE.topic === topic.id);

    return [
      chip('Todos los temas', STATE.topic === 'all', 'topic', { 'data-topic': 'all' }),
      ...visibleTopics.map((topic) => chip(`${topic.name} (${topic.exerciseCount})`, STATE.topic === topic.id, 'topic', { 'data-topic': topic.id }))
    ].join('');
  }

  function renderMetrics(list) {
    return [
      { value: list.length, label: 'Reactivos visibles' },
      { value: distinct(list, 'guideId'), label: 'Guías activas' },
      { value: distinct(list, 'topicId'), label: 'Temas activos' }
    ].map((item) => `<div><b>${esc(String(item.value))}</b><span>${esc(item.label)}</span></div>`).join('');
  }

  function render() {
    const list = matches();

    byId('topStats').textContent = `Visibles: ${list.length} | Guías: ${distinct(list, 'guideId')} | Temas: ${distinct(list, 'topicId')}`;
    byId('presetNav').innerHTML = renderPresetNav();
    byId('guideChips').innerHTML = renderGuideChips();
    byId('topicChips').innerHTML = renderTopicChips(list);
    byId('metrics').innerHTML = renderMetrics(list);

    if (STATE.view === 'inicio') {
      byId('content').innerHTML = home();
      byId('empty').hidden = true;
      return;
    }

    if (!list.length) {
      byId('content').innerHTML = '';
      byId('empty').hidden = false;
      return;
    }

    byId('empty').hidden = true;

    if (STATE.view === 'temas') {
      const grouped = new Map();
      list.forEach((exercise) => {
        if (!grouped.has(exercise.topicId)) grouped.set(exercise.topicId, []);
        grouped.get(exercise.topicId).push(exercise);
      });

      byId('content').innerHTML = TOPICS.filter((topic) => grouped.has(topic.id))
        .map((topic) => topicSection(topic, grouped.get(topic.id)))
        .join('');
      return;
    }

    byId('content').innerHTML = GUIDES
      .map((guide) => guideSection(guide, list.filter((exercise) => exercise.guideId === guide.id)))
      .join('');
  }

  document.addEventListener('click', (event) => {
    const node = event.target.closest('[data-action]');
    if (!node) return;

    const action = node.dataset.action;

    if (action === 'view') {
      STATE.view = node.dataset.view || 'inicio';
      if (STATE.view === 'guia-1') STATE.guide = 'guia-1';
      if (STATE.view === 'guia-2') STATE.guide = 'guia-2';
      if (STATE.view === 'inicio') {
        STATE.guide = 'all';
        STATE.topic = 'all';
      }
      render();
      return;
    }

    if (action === 'guide') {
      STATE.guide = node.dataset.guide || 'all';
      if (STATE.guide === 'guia-1' || STATE.guide === 'guia-2') STATE.view = STATE.guide;
      else if (STATE.view === 'guia-1' || STATE.view === 'guia-2') STATE.view = 'todos';
      if (STATE.view === 'inicio') STATE.view = 'todos';
      render();
      return;
    }

    if (action === 'topic') {
      STATE.topic = node.dataset.topic || 'all';
      if (STATE.view === 'inicio') STATE.view = 'temas';
      render();
      return;
    }

    if (action === 'pick-option') {
      const exerciseId = node.dataset.id;
      const option = node.dataset.option || '';
      const exercise = EXERCISES.find((item) => item.id === exerciseId);

      if (!exerciseId || !option || !exercise) return;

      const state = cardState(exerciseId);
      if (state.status !== 'idle') return;

      state.selectedOption = option;
      state.status = option === exercise.correctOption?.label ? 'correct' : 'wrong';
      render();

      window.requestAnimationFrame(() => {
        const cardNode = document.getElementById(`reactivo-${exerciseId}`);
        const target = cardNode?.querySelector(state.status === 'correct' ? '.feedback-stack' : '.attempt-state');
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return;
    }

    if (action === 'retry-option') {
      const exerciseId = node.dataset.id;
      if (!exerciseId) return;

      const state = cardState(exerciseId);
      state.status = 'idle';
      state.selectedOption = '';
      render();
      return;
    }

    if (action === 'toggle-hint') {
      const exerciseId = node.dataset.id;
      if (!exerciseId) return;

      const state = cardState(exerciseId);
      state.hintOpen = !state.hintOpen;
      render();

      if (state.hintOpen) {
        window.requestAnimationFrame(() => {
          const cardNode = document.getElementById(`reactivo-${exerciseId}`);
          const hintNode = cardNode?.querySelector('.support.hint');
          hintNode?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    }
  });

  byId('searchInput').addEventListener('input', (event) => {
    STATE.query = event.target.value || '';
    if (STATE.view === 'inicio' && STATE.query.trim()) STATE.view = 'todos';
    render();
  });

  const toTop = byId('toTop');
  const syncTop = () => toTop.classList.toggle('show', window.scrollY > 260);

  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  window.addEventListener('scroll', syncTop, { passive: true });
  window.addEventListener('load', syncTop);

  render();
  syncTop();
})();
