const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUTPUT_FILE = path.join(ROOT, 'geografia-data.js');

const GUIDE_FILES = [
  { id: 'guia-1', name: 'Guía 1', fileHint: '1' },
  { id: 'guia-2', name: 'Guía 2', fileHint: '2' }
];

const SECTION_LABELS = [
  'tematica del ejercicio',
  'reactivo',
  'planteamiento del problema',
  'opciones',
  'que pide resolver el ejercicio',
  'desarrollo y evaluacion de opciones',
  'desarrollo y descarte de opciones',
  'opcion correcta',
  'argumento',
  'pista'
];

const REACTIVE_OVERRIDES = {
  'guia-1-94': {
    reactiveType: 'coordinates-point',
    descriptorVisual: 'Cuadrícula de coordenadas con el punto II al sur del ecuador y al este del meridiano 0°.',
    visualSpec: {
      type: 'coordinates-point',
      title: 'Cuadrícula del punto II',
      pointLabel: 'II',
      xTicks: [-30, -20, -10, 0, 10, 20, 30],
      yTicks: [-30, -20, -10, 0, 10, 20, 30],
      point: { x: 30, y: -10 }
    }
  },
  'guia-2-93': {
    reactiveType: 'latitude-reference',
    descriptorVisual: 'Esquema básico para distinguir latitud y longitud a partir del ecuador y del meridiano 0°.',
    visualSpec: {
      type: 'latitude-reference',
      title: 'Referencia de latitud y longitud'
    }
  },
  'guia-1-103': {
    reactiveType: 'match-columns',
    descriptorVisual: 'Relación entre entidad federativa y patrimonio cultural de la humanidad.',
    visualSpec: {
      type: 'match-columns',
      title: 'Entidad y patrimonio',
      leftTitle: 'Entidad',
      leftItems: [
        'I. Querétaro.',
        'II. Veracruz.',
        'III. Oaxaca.',
        'IV. Chihuahua.'
      ],
      rightTitle: 'Patrimonio',
      rightItems: [
        'a. Zona arqueológica de Paquimé.',
        'b. Misiones Franciscanas de la Sierra Gorda.',
        'c. Monumentos históricos de Tlacotalpan.',
        'd. Sitio arqueológico de Monte Albán.'
      ]
    }
  }
};

function toMexicoTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function stripReferences(text) {
  return String(text || '')
    .replace(/\uFEFF/g, '')
    .replace(/:contentReference\[[^\]]+\]\{[^}]+\}/g, '')
    .replace(/[ \t]+$/gm, '');
}

function normalizeLabel(text) {
  return stripReferences(text)
    .replace(/\r/g, '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/:+$/, '')
    .replace(/\s+/g, ' ');
}

function cleanInline(text) {
  return stripReferences(String(text || '').replace(/\r/g, '')).trim();
}

function trimBlankLines(lines) {
  let start = 0;
  let end = lines.length;

  while (start < end && !String(lines[start] || '').trim()) start += 1;
  while (end > start && !String(lines[end - 1] || '').trim()) end -= 1;

  return lines.slice(start, end);
}

function joinLines(lines) {
  return trimBlankLines(lines)
    .map((line) => cleanInline(line))
    .filter((line) => line && line !== '---')
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function slugify(text) {
  return cleanInline(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function normalizeForToken(text) {
  return cleanInline(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function buildTags(topic) {
  const tokens = normalizeForToken(topic)
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => token.length > 2)
    .slice(0, 5);

  return Array.from(new Set([slugify(topic), ...tokens]));
}

function findGuideFile(fileHint) {
  const entry = fs
    .readdirSync(ROOT)
    .find((name) => {
      const normalized = normalizeForToken(name);
      return normalized.endsWith('.txt') && normalized.includes(`guia ${fileHint}`);
    });

  if (!entry) {
    throw new Error(`No se encontró un archivo .txt para la guía ${fileHint}.`);
  }

  return path.join(ROOT, entry);
}

function splitExerciseBlocks(rawText) {
  const lines = stripReferences(rawText).replace(/\r\n/g, '\n').split('\n');
  const starts = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (normalizeLabel(lines[index]).startsWith('tematica del ejercicio')) {
      starts.push(index);
    }
  }

  return starts
    .map((startIndex, index) => {
      const endIndex = index + 1 < starts.length ? starts[index + 1] : lines.length;
      return lines.slice(startIndex, endIndex);
    })
    .filter((block) => block.some((line) => normalizeLabel(line).startsWith('reactivo')));
}

function findSectionIndex(lines, label) {
  return lines.findIndex((line) => normalizeLabel(line).startsWith(label));
}

function extractSection(lines, startLabel, endLabels) {
  const startIndex = findSectionIndex(lines, startLabel);
  if (startIndex === -1) return [];

  let endIndex = lines.length;
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const normalized = normalizeLabel(lines[index]);
    if (endLabels.some((label) => normalized.startsWith(label))) {
      endIndex = index;
      break;
    }
  }

  const collected = [];
  const startLine = stripReferences(String(lines[startIndex] || '')).replace(/\r/g, '');
  const separatorIndex = startLine.indexOf(':');
  if (separatorIndex >= 0) {
    const inline = cleanInline(startLine.slice(separatorIndex + 1));
    if (inline) collected.push(inline);
  }

  for (let index = startIndex + 1; index < endIndex; index += 1) {
    collected.push(String(lines[index] || ''));
  }

  return trimBlankLines(collected).filter((line) => cleanInline(line) !== '---');
}

function parseOptions(lines) {
  const options = [];
  let current = null;

  for (const rawLine of trimBlankLines(lines)) {
    const line = cleanInline(rawLine);
    if (!line || line === '---') continue;

    const match = line.match(/^([A-E])\)\s*(.*)$/);
    if (match) {
      if (current) options.push(current);
      current = {
        label: match[1],
        text: cleanInline(match[2])
      };
      continue;
    }

    if (current) {
      current.text = cleanInline(`${current.text} ${line}`);
    }
  }

  if (current) options.push(current);
  return options;
}

function splitQuestionAndInlineOptions(lines) {
  const cleaned = trimBlankLines(lines)
    .map((line) => cleanInline(line))
    .filter((line) => line && line !== '---');

  const firstOptionIndex = cleaned.findIndex((line) => /^[A-E]\)\s*/.test(line));
  if (firstOptionIndex === -1) {
    return {
      questionLines: cleaned,
      optionLines: []
    };
  }

  return {
    questionLines: cleaned.slice(0, firstOptionIndex),
    optionLines: cleaned.slice(firstOptionIndex)
  };
}

function parseOptionsAnalysis(lines, optionMap) {
  const items = [];
  let current = null;

  for (const rawLine of trimBlankLines(lines)) {
    const line = cleanInline(rawLine);
    if (line === '---') continue;

    if (!line) {
      if (current && current.lines[current.lines.length - 1] !== '') {
        current.lines.push('');
      }
      continue;
    }

    const match = line.match(/^([A-E])\)\s*(.*)$/);
    if (match) {
      if (current) items.push(current);
      current = {
        label: match[1],
        option: optionMap.get(match[1]) || cleanInline(match[2]),
        lines: []
      };
      continue;
    }

    if (current) current.lines.push(line);
  }

  if (current) items.push(current);

  return items.map((item) => ({
    label: item.label,
    option: item.option,
    text: joinLines(item.lines)
  }));
}

function parseCorrectOption(lines, optionMap) {
  const firstLine = trimBlankLines(lines)
    .map((line) => cleanInline(line))
    .find(Boolean);

  if (!firstLine) {
    throw new Error('No se encontró una opción correcta visible en el bloque.');
  }

  const match = firstLine.match(/^([A-E])\)\s*(.*)$/);
  if (!match) {
    throw new Error(`No se pudo interpretar la opción correcta: "${firstLine}".`);
  }

  const label = match[1];
  return {
    label,
    text: optionMap.get(label) || cleanInline(match[2])
  };
}

function guessReactiveType(guideId, number, optionsCount) {
  const override = REACTIVE_OVERRIDES[`${guideId}-${number}`];
  if (override?.reactiveType) return override.reactiveType;
  return optionsCount === 5 ? 'multiple-choice-5' : 'multiple-choice-4';
}

function buildOverride(guideId, number) {
  return REACTIVE_OVERRIDES[`${guideId}-${number}`] || {};
}

function validateBlock(blockLines, guideName) {
  const normalizedLines = blockLines.map((line) => normalizeLabel(line));
  const required = [
    'tematica del ejercicio',
    'reactivo',
    'planteamiento del problema',
    'que pide resolver el ejercicio',
    'argumento',
    'pista'
  ];

  for (const label of required) {
    const found = normalizedLines.some((line) => line.startsWith(label));
    if (!found) throw new Error(`Falta la sección "${label}" en un bloque de ${guideName}.`);
  }

  const hasEval = normalizedLines.some((line) => line.startsWith('desarrollo y evaluacion de opciones'));
  const hasDesc = normalizedLines.some((line) => line.startsWith('desarrollo y descarte de opciones'));
  if (!hasEval && !hasDesc) {
    throw new Error(`Falta la sección de desarrollo de opciones en un bloque de ${guideName}.`);
  }
}

function parseExercise(blockLines, guide, order) {
  validateBlock(blockLines, guide.name);

  const topic = joinLines(extractSection(blockLines, 'tematica del ejercicio', ['reactivo']));
  const numberText = joinLines(extractSection(blockLines, 'reactivo', ['fuente', 'planteamiento del problema']));
  const number = Number(numberText);

  if (!Number.isFinite(number)) {
    throw new Error(`No se pudo leer el número de reactivo para ${guide.name}.`);
  }

  const sourceSection = extractSection(blockLines, 'fuente', ['planteamiento del problema']);
  const source = cleanInline(sourceSection[0] || '');
  const sourceNotes = sourceSection.slice(1).map((line) => cleanInline(line)).filter(Boolean);

  const developmentLabel = blockLines.some((line) =>
    normalizeLabel(line).startsWith('desarrollo y evaluacion de opciones')
  )
    ? 'desarrollo y evaluacion de opciones'
    : 'desarrollo y descarte de opciones';

  const questionSection = extractSection(blockLines, 'planteamiento del problema', [
    'opciones',
    'que pide resolver el ejercicio',
    developmentLabel,
    'opcion correcta',
    'argumento',
    'pista'
  ]);
  const questionSplit = splitQuestionAndInlineOptions(questionSection);
  const questionLines = questionSplit.questionLines;

  const optionsSection = extractSection(blockLines, 'opciones', ['que pide resolver el ejercicio']);
  const options = parseOptions(optionsSection.length ? optionsSection : questionSplit.optionLines);
  const optionMap = new Map(options.map((option) => [option.label, option.text]));

  const whatToSolve = joinLines(
    extractSection(blockLines, 'que pide resolver el ejercicio', [developmentLabel])
  );
  const optionsAnalysis = parseOptionsAnalysis(
    extractSection(blockLines, developmentLabel, ['opcion correcta']),
    optionMap
  );
  const correctOption = parseCorrectOption(extractSection(blockLines, 'opcion correcta', ['argumento']), optionMap);
  const argument = joinLines(extractSection(blockLines, 'argumento', ['pista']));
  const hint = joinLines(extractSection(blockLines, 'pista', []));

  const override = buildOverride(guide.id, number);

  return {
    id: `${guide.id.replace('guia-', 'g')}-r${number}`,
    guideId: guide.id,
    guideName: guide.name,
    number,
    order,
    sourceOrder: order,
    source,
    sourceNotes,
    topic,
    topicId: slugify(topic),
    question: questionLines.join('\n'),
    questionLines,
    options,
    correctOption,
    hint,
    whatToSolve,
    optionsAnalysis,
    argument,
    reactiveType: guessReactiveType(guide.id, number, options.length),
    descriptorVisual: override.descriptorVisual || null,
    visualSpec: override.visualSpec || null,
    tags: buildTags(topic)
  };
}

function buildGuideData(guide) {
  const sourceFile = findGuideFile(guide.fileHint);
  const rawText = fs.readFileSync(sourceFile, 'utf8');
  const blocks = splitExerciseBlocks(rawText);
  const exercises = blocks.map((block, index) => parseExercise(block, guide, index + 1));

  if (exercises.length !== 12) {
    throw new Error(`${guide.name} debe contener 12 reactivos y se detectaron ${exercises.length}.`);
  }

  const expectedNumbers = Array.from({ length: 12 }, (_, index) => 93 + index);
  const actualNumbers = exercises.map((exercise) => exercise.number);

  if (expectedNumbers.join(',') !== actualNumbers.join(',')) {
    throw new Error(
      `${guide.name} no conserva el orden esperado 93-104. Obtenido: ${actualNumbers.join(', ')}`
    );
  }

  return {
    id: guide.id,
    name: guide.name,
    exerciseCount: exercises.length,
    exercises
  };
}

function buildTopics(guides) {
  const topicMap = new Map();

  for (const guide of guides) {
    for (const exercise of guide.exercises) {
      if (!topicMap.has(exercise.topicId)) {
        topicMap.set(exercise.topicId, {
          id: exercise.topicId,
          name: exercise.topic,
          exerciseCount: 0,
          guides: new Set()
        });
      }

      const entry = topicMap.get(exercise.topicId);
      entry.exerciseCount += 1;
      entry.guides.add(guide.id);
    }
  }

  return Array.from(topicMap.values()).map((topic) => ({
    id: topic.id,
    name: topic.name,
    exerciseCount: topic.exerciseCount,
    guides: Array.from(topic.guides)
  }));
}

function buildAppData() {
  const guides = GUIDE_FILES.map(buildGuideData);
  const totalExercises = guides.reduce((sum, guide) => sum + guide.exerciseCount, 0);
  const topics = buildTopics(guides);

  if (totalExercises !== 24) {
    throw new Error(`Se esperaban 24 reactivos y se obtuvieron ${totalExercises}.`);
  }

  return {
    meta: {
      title: 'Instituto Fernando Ramírez · ECOEMS Geografía',
      subject: 'Geografía',
      version: '1.0.0',
      generatedAt: toMexicoTimestamp(),
      totalExercises,
      topicCount: topics.length
    },
    topics,
    guides
  };
}

function writeOutput() {
  const data = buildAppData();
  const content = `window.IFR_APP_DATA = ${JSON.stringify(data, null, 2)};\n`;
  fs.writeFileSync(OUTPUT_FILE, content, 'utf8');
  return data;
}

if (require.main === module) {
  const data = writeOutput();
  console.log(`Archivo generado: ${path.basename(OUTPUT_FILE)}`);
  console.log(`Reactivos generados: ${data.meta.totalExercises}`);
  console.log(`Temas detectados: ${data.meta.topicCount}`);
}

module.exports = {
  buildAppData,
  writeOutput
};
