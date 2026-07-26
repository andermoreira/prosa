#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SPECS = path.join(ROOT, 'specs');
const STEPS = path.join(SPECS, 'steps');
const ARCHIVE = path.join(SPECS, 'archive');
const SPEC_NAME = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const STEP_NAME = /^([a-z0-9]+(?:-[a-z0-9]+)*)-step-([1-9]\d*)\.md$/;
const ARCHIVE_NAME = /^\d{4}-\d{2}-\d{2}-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const KNOWN_DIRECTORIES = new Set(['archive', 'steps']);

const SECTIONS = [
  { name: 'Goal', aliases: ['goal', 'objetivo'], frontMatter: 'goal' },
  { name: 'Non-goals', aliases: ['non-goals', 'non goals', 'nao-objetivos', 'nao objetivos'], frontMatter: 'nonGoals' },
  { name: 'User stories', aliases: ['user stories', 'historias de usuario'] },
  { name: 'Assumptions', aliases: ['assumptions', 'premissas'] },
  { name: 'Risks', aliases: ['risks', 'riscos'] },
  { name: 'Error handling', aliases: ['error handling', 'tratamento de erro'] },
  { name: 'Observability', aliases: ['observability', 'observabilidade'] },
  { name: 'Threat model', aliases: ['threat model', 'modelo de ameacas'] },
  { name: 'Acceptance criteria', aliases: ['acceptance criteria', 'criterios de aceite'], frontMatter: 'acceptanceCriteria' },
  { name: 'Open questions', aliases: ['open questions', 'questoes em aberto', 'perguntas em aberto'] },
];
const LITE_SECTIONS = new Set(['Goal', 'Non-goals', 'Acceptance criteria']);
const LITE_MARKER = /^>\s*\*\*Formato:\*\*\s*spec lite\b/m;

let failures = 0;

function normalize(value) {
  return value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function error(message) {
  failures += 1;
  console.error(`ERROR ${message}`);
}

function warning(message) {
  console.warn(`WARN  ${message}`);
}

function markdownFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md')
    .map((entry) => entry.name)
    .sort();
}

function splitFrontMatter(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  if (lines[0] !== '---') return { frontMatter: '', body: source };
  const end = lines.indexOf('---', 1);
  if (end === -1) return { frontMatter: '', body: source };
  return {
    frontMatter: lines.slice(1, end).join('\n'),
    body: lines.slice(end + 1).join('\n'),
  };
}

function headings(body) {
  const result = [];
  let fence = null;
  for (const line of body.split('\n')) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      fence = fence === marker[1][0] ? null : fence || marker[1][0];
      continue;
    }
    if (fence) continue;
    const heading = line.match(/^#{2,}\s+(.+?)\s*#*\s*$/);
    if (heading) result.push(normalize(heading[1]));
  }
  return result;
}

function frontMatterKeys(frontMatter) {
  return new Set(frontMatter.split('\n')
    .map((line) => line.match(/^([A-Za-z][A-Za-z0-9]*):/))
    .filter(Boolean)
    .map((match) => match[1]));
}

function sectionLines(body, acceptedAliases) {
  const result = [];
  let selected = false;
  let fence = null;
  for (const line of body.split('\n')) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/);
    if (marker) {
      fence = fence === marker[1][0] ? null : fence || marker[1][0];
      continue;
    }
    if (fence) continue;
    const heading = line.match(/^#{2,}\s+(.+?)\s*#*\s*$/);
    if (heading) {
      selected = acceptedAliases.includes(normalize(heading[1]));
      continue;
    }
    if (selected) result.push(line);
  }
  return result;
}

function validateSpec(fileName) {
  const relative = `specs/${fileName}`;
  if (!SPEC_NAME.test(fileName)) error(`${relative}: nome inválido.`);
  const source = fs.readFileSync(path.join(SPECS, fileName), 'utf8');
  const { frontMatter, body } = splitFrontMatter(source);
  const bodyHeadings = headings(body);
  const keys = frontMatterKeys(frontMatter);
  const required = LITE_MARKER.test(body) ? SECTIONS.filter((section) => LITE_SECTIONS.has(section.name)) : SECTIONS;
  for (const section of required) {
    const inBody = section.aliases.some((alias) => bodyHeadings.includes(alias));
    if (!inBody && (!section.frontMatter || !keys.has(section.frontMatter))) {
      error(`${relative}: seção obrigatória ausente — ${section.name}.`);
    }
  }
}

function validateSteps(activeFeatures) {
  const numbersByFeature = new Map();
  for (const fileName of markdownFiles(STEPS)) {
    const relative = `specs/steps/${fileName}`;
    const match = fileName.match(STEP_NAME);
    if (!match) {
      error(`${relative}: nome inválido.`);
      continue;
    }
    const [, feature, rawNumber] = match;
    if (!activeFeatures.has(feature)) error(`${relative}: spec ativa correspondente ausente.`);
    const numbers = numbersByFeature.get(feature) || [];
    numbers.push(Number(rawNumber));
    numbersByFeature.set(feature, numbers);
  }
  for (const [feature, numbers] of numbersByFeature) {
    numbers.sort((left, right) => left - right);
    numbers.forEach((number, index) => {
      if (number !== index + 1) error(`specs/steps/: sequência inválida para ${feature}.`);
    });
  }
  return numbersByFeature;
}

function validatePlanParity(specFiles, numbersByFeature) {
  for (const fileName of specFiles) {
    const feature = fileName.replace(/\.md$/, '');
    const steps = numbersByFeature.get(feature);
    if (!steps) continue;
    const { body } = splitFrontMatter(fs.readFileSync(path.join(SPECS, fileName), 'utf8'));
    const plan = sectionLines(body, ['implementation plan', 'plano de implementacao'])
      .map((line) => line.match(/^\s*([1-9]\d*)\.\s+\S/))
      .filter(Boolean)
      .map((match) => Number(match[1]));
    if (plan.length === 0) continue;
    const planned = new Set(plan);
    const materialized = new Set(steps);
    for (const number of plan) {
      if (!materialized.has(number)) warning(`specs/${fileName}: item ${number} sem step.`);
    }
    for (const number of steps) {
      if (!planned.has(number)) warning(`specs/steps/${feature}-step-${number}.md: item ausente no plano.`);
    }
  }
}

function validateArchive() {
  if (!fs.existsSync(ARCHIVE)) return;
  for (const entry of fs.readdirSync(ARCHIVE, { withFileTypes: true })) {
    const relative = `specs/archive/${entry.name}`;
    const match = entry.isDirectory() && entry.name.match(ARCHIVE_NAME);
    if (!match) {
      error(`${relative}: esperado diretório YYYY-MM-DD-feature.`);
      continue;
    }
    const feature = match[1];
    const entries = markdownFiles(path.join(ARCHIVE, entry.name));
    if (!entries.includes(`${feature}.md`)) error(`${relative}: spec arquivada ausente.`);
    const stepNumbers = entries
      .map((name) => name.match(STEP_NAME))
      .filter((step) => step && step[1] === feature)
      .map((step) => Number(step[2]))
      .sort((left, right) => left - right);
    stepNumbers.forEach((number, index) => {
      if (number !== index + 1) error(`${relative}: sequência de steps inválida.`);
    });
  }
}

function validateLayout() {
  for (const entry of fs.readdirSync(SPECS, { withFileTypes: true })) {
    if (entry.isDirectory() && !KNOWN_DIRECTORIES.has(entry.name)) {
      error(`specs/${entry.name}/: subdiretório desconhecido.`);
    }
  }
}

function run() {
  if (!fs.existsSync(SPECS)) {
    console.log('OK    specs/ ausente.');
    return;
  }
  const specFiles = markdownFiles(SPECS);
  specFiles.forEach(validateSpec);
  const activeFeatures = new Set(specFiles.map((name) => name.replace(/\.md$/, '')));
  const numbersByFeature = validateSteps(activeFeatures);
  validatePlanParity(specFiles, numbersByFeature);
  validateArchive();
  validateLayout();
  if (failures > 0) {
    console.error(`FAIL  lint de specs encontrou ${failures} erro(s).`);
    process.exitCode = 1;
    return;
  }
  console.log(`OK    ${specFiles.length} spec(s) ativa(s), steps e archive consistentes.`);
}

run();
