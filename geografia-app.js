(() => {
  const DATA = window.IFR_APP_DATA || { meta: {}, topics: [], guides: [] };
  const GUIDES = DATA.guides || [];
  const TOPICS = DATA.topics || [];
  const GUIDE_ORDER = Object.fromEntries(GUIDES.map((guide, index) => [guide.id, index]));
  const STATE = { guide: 'all', topic: 'all' };
  const CARD_STATE = {};

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
    return STATE.guide;
  }

  function matches() {
    const guide = currentGuide();
    const topic = STATE.topic;

    return EXERCISES.filter((exercise) => {
      if (guide !== 'all' && exercise.guideId !== guide) return false;
      if (topic !== 'all' && exercise.topicId !== topic) return false;
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
    return `<section class="visual-support">
      <div class="visual-head">
        <div>
          <div class="meta">Apoyo visual</div>
          <h4>${esc(spec.title)}</h4>
        </div>
        <span class="visual-badge">Coordenadas</span>
      </div>
      <div class="map-grid-wrap" style="padding: 12px; background: rgba(255,255,255,0.98); border-radius: 28px;">
        <img src="Gemini_Generated_Image_hiwuk6hiwuk6hiwu.png" alt="${esc(spec.title)}" style="width: 100%; border-radius: 16px; display: block;" />
      </div>
    </section>`;
  }

  function renderLatitudeReference(spec) {
    const title = 'Cómo se mide la latitud y la longitud';
    return `<section class="visual-support">
      <div class="visual-head">
        <div>
          <div class="meta">Apoyo visual</div>
          <h4>${esc(title)}</h4>
        </div>
        <span class="visual-badge">Concepto base</span>
      </div>
      <div class="lat-ref-wrap" style="display: flex; justify-content: center; max-width: 520px; margin: 0 auto; width: 100%;">
        <svg viewBox="0 0 640 440" style="width: 100%; height: auto; font-family: system-ui, -apple-system, sans-serif;" role="img" aria-label="${esc(title)}">
          <defs>
            <marker id="arrow-lat" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#059669" />
            </marker>
            <marker id="arrow-lon" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#2563EB" />
            </marker>
          </defs>
          <rect x="0" y="0" width="640" height="440" rx="24" fill="#F8FAFC" />
          
          <!-- Globo (Fondo) -->
          <circle cx="320" cy="220" r="130" fill="#FFFFFF" stroke="#94A3B8" stroke-width="2" />
          
          <!-- Meridianos (Longitudes) -->
          <path d="M 320 90 A 65 130 0 0 0 320 350" fill="none" stroke="#93C5FD" stroke-width="1.5" stroke-dasharray="6,4" />
          <path d="M 320 90 A 65 130 0 0 1 320 350" fill="none" stroke="#93C5FD" stroke-width="1.5" stroke-dasharray="6,4" />
          <path d="M 320 90 A 105 130 0 0 0 320 350" fill="none" stroke="#93C5FD" stroke-width="1.5" stroke-dasharray="6,4" />
          <path d="M 320 90 A 105 130 0 0 1 320 350" fill="none" stroke="#93C5FD" stroke-width="1.5" stroke-dasharray="6,4" />
          
          <!-- Paralelos (Latitudes) -->
          <path d="M 207.4 155 A 112.6 30 0 0 0 432.6 155" fill="none" stroke="#6EE7B7" stroke-width="1.5" stroke-dasharray="6,4" />
          <path d="M 207.4 285 A 112.6 30 0 0 0 432.6 285" fill="none" stroke="#6EE7B7" stroke-width="1.5" stroke-dasharray="6,4" />
          <path d="M 250.7 110 A 69.3 18 0 0 0 389.3 110" fill="none" stroke="#6EE7B7" stroke-width="1.5" stroke-dasharray="6,4" />
          <path d="M 250.7 330 A 69.3 18 0 0 0 389.3 330" fill="none" stroke="#6EE7B7" stroke-width="1.5" stroke-dasharray="6,4" />
          
          <!-- Ejes principales: Ecuador y Meridiano de Greenwich -->
          <line x1="160" y1="220" x2="480" y2="220" stroke="#059669" stroke-width="3" />
          <line x1="320" y1="60" x2="320" y2="380" stroke="#2563EB" stroke-width="3" />
          
          <!-- Flechas de Latitud (Norte/Sur) desde el Ecuador -->
          <line x1="260" y1="220" x2="260" y2="155" stroke="#059669" stroke-width="2.5" marker-end="url(#arrow-lat)" />
          <line x1="260" y1="220" x2="260" y2="285" stroke="#059669" stroke-width="2.5" marker-end="url(#arrow-lat)" />
          
          <!-- Flechas de Longitud (Este/Oeste) desde Greenwich -->
          <line x1="320" y1="150" x2="255" y2="150" stroke="#2563EB" stroke-width="2.5" marker-end="url(#arrow-lon)" />
          <line x1="320" y1="150" x2="385" y2="150" stroke="#2563EB" stroke-width="2.5" marker-end="url(#arrow-lon)" />
          
          <!-- Textos de Coordenadas Principales -->
          <text x="488" y="225" font-size="15" font-weight="800" fill="#047857" text-anchor="start">Ecuador 0°</text>
          <text x="320" y="410" font-size="15" font-weight="800" fill="#1D4ED8" text-anchor="middle">Meridiano de Greenwich 0°</text>
          
          <!-- Referencias (Grados máximos) -->
          <text x="320" y="50" font-size="14" font-weight="800" fill="#047857" text-anchor="middle">90° N</text>
          <text x="320" y="398" font-size="14" font-weight="800" fill="#047857" text-anchor="middle">90° S</text>
          <text x="152" y="225" font-size="14" font-weight="800" fill="#1D4ED8" text-anchor="end">180° O</text>
          <text x="488" y="200" font-size="14" font-weight="800" fill="#1D4ED8" text-anchor="start">180° E</text>
          
          <!-- Cajas Explicativas: Latitud -->
          <g transform="translate(15, 175)">
            <rect width="170" height="78" rx="8" fill="#ECFDF5" stroke="#A7F3D0" />
            <text x="85" y="24" text-anchor="middle" font-size="15" font-weight="800" fill="#065F46">Latitud:</text>
            <text x="85" y="42" text-anchor="middle" font-size="13" font-weight="500" fill="#065F46">se mide desde el</text>
            <text x="85" y="58" text-anchor="middle" font-size="13" font-weight="500" fill="#065F46">ecuador hacia el</text>
            <text x="85" y="74" text-anchor="middle" font-size="13" font-weight="500" fill="#065F46">norte o hacia el sur</text>
          </g>

          <!-- Cajas Explicativas: Longitud -->
          <g transform="translate(440, 75)">
            <rect width="190" height="78" rx="8" fill="#EFF6FF" stroke="#BFDBFE" />
            <text x="95" y="24" text-anchor="middle" font-size="15" font-weight="800" fill="#1E3A8A">Longitud:</text>
            <text x="95" y="42" text-anchor="middle" font-size="13" font-weight="500" fill="#1E40AF">se mide desde el meridiano</text>
            <text x="95" y="58" text-anchor="middle" font-size="13" font-weight="500" fill="#1E40AF">de Greenwich hacia el</text>
            <text x="95" y="74" text-anchor="middle" font-size="13" font-weight="500" fill="#1E40AF">este o hacia el oeste</text>
          </g>

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

  function renderGuideChips() {
    return [
      chip('Todas las guías', currentGuide() === 'all', 'guide', { 'data-guide': 'all' }),
      ...GUIDES.map((guide) => chip(guide.name, currentGuide() === guide.id, 'guide', { 'data-guide': guide.id }))
    ].join('');
  }

  function renderTopicChips(list) {
    const visibleTopics = TOPICS.filter((topic) => list.some((exercise) => exercise.topicId === topic.id) || STATE.topic === topic.id);

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
    byId('guideChips').innerHTML = renderGuideChips();
    byId('topicChips').innerHTML = renderTopicChips(list);
    byId('metrics').innerHTML = renderMetrics(list);

    if (!list.length) {
      byId('content').innerHTML = '';
      byId('empty').hidden = false;
      return;
    }

    byId('empty').hidden = true;

    byId('content').innerHTML = GUIDES
      .map((guide) => guideSection(guide, list.filter((exercise) => exercise.guideId === guide.id)))
      .join('');
  }

  document.addEventListener('click', (event) => {
    const node = event.target.closest('[data-action]');
    if (!node) return;

    const action = node.dataset.action;

    if (action === 'guide') {
      STATE.guide = node.dataset.guide || 'all';
      render();
      return;
    }

    if (action === 'topic') {
      STATE.topic = node.dataset.topic || 'all';
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
      const solved = option === exercise.correctOption?.label;
      state.status = solved ? 'correct' : 'wrong';
      render();

      if (solved) {
        window.requestAnimationFrame(() => {
          const cardNode = document.getElementById(`reactivo-${exerciseId}`);
          const target = cardNode?.querySelector('.feedback-stack');
          target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
      return;
    }

    if (action === 'retry-option') {
      const exerciseId = node.dataset.id;
      if (!exerciseId) return;

      const state = cardState(exerciseId);
      state.status = 'idle';
      state.selectedOption = '';
      render();

      window.requestAnimationFrame(() => {
        const cardNode = document.getElementById(`reactivo-${exerciseId}`);
        const promptNode = cardNode?.querySelector('.question-block');
        promptNode?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
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

  const toTop = byId('toTop');
  const syncTop = () => toTop.classList.toggle('show', window.scrollY > 260);

  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  window.addEventListener('scroll', syncTop, { passive: true });
  window.addEventListener('load', syncTop);

  render();
  syncTop();
})();
