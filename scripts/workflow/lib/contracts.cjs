'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const YAML = require('yaml');

const SCHEMA_TYPES = Object.freeze([
  'spec',
  'step',
  'state',
  'review',
  'diagnosis',
  'retrospective',
  'risk-signal',
  'approval-decision',
]);
const DEFAULT_LIMITS = Object.freeze({
  maxDocumentBytes: 1024 * 1024,
  maxFrontMatterBytes: 64 * 1024,
  maxFrontMatterLines: 1000,
});
const DEFAULT_SCHEMA_DIRECTORY = path.resolve(__dirname, '../../../schemas');

function contractError(code, pathValue, message) {
  return { code, path: pathValue || '/', message };
}

function failure(code, pathValue, message) {
  return { ok: false, errors: [contractError(code, pathValue, message)] };
}

function splitMarkdownFrontMatter(markdown, limits = DEFAULT_LIMITS) {
  if (typeof markdown !== 'string') return failure('INPUT_TYPE', '/', 'Markdown input must be a string');
  if (Buffer.byteLength(markdown) > limits.maxDocumentBytes) {
    return failure('DOCUMENT_TOO_LARGE', '/', `Document exceeds ${limits.maxDocumentBytes} bytes`);
  }

  const opening = markdown.match(/^---[\t ]*(?:\r?\n|$)/);
  if (!opening) return failure('FRONT_MATTER_MISSING', '/', 'Markdown front matter must start with ---');

  const contentStart = opening[0].length;
  const closingPattern = /^(?:---|\.\.\.)[\t ]*(?:\r?\n|$)/gm;
  closingPattern.lastIndex = contentStart;
  const closing = closingPattern.exec(markdown);
  if (!closing) return failure('FRONT_MATTER_UNTERMINATED', '/', 'Markdown front matter has no closing delimiter');

  const frontMatter = markdown.slice(contentStart, closing.index);
  if (Buffer.byteLength(frontMatter) > limits.maxFrontMatterBytes) {
    return failure('FRONT_MATTER_TOO_LARGE', '/', `Front matter exceeds ${limits.maxFrontMatterBytes} bytes`);
  }
  const lineCount = frontMatter === '' ? 0 : frontMatter.split(/\r?\n/).length;
  if (lineCount > limits.maxFrontMatterLines) {
    return failure('FRONT_MATTER_TOO_MANY_LINES', '/', `Front matter exceeds ${limits.maxFrontMatterLines} lines`);
  }

  return {
    ok: true,
    value: {
      frontMatter,
      body: markdown.slice(closing.index + closing[0].length),
    },
    errors: [],
  };
}

function parseYaml(source, limits = DEFAULT_LIMITS) {
  if (typeof source !== 'string') return failure('INPUT_TYPE', '/', 'YAML input must be a string');
  if (Buffer.byteLength(source) > limits.maxDocumentBytes) {
    return failure('DOCUMENT_TOO_LARGE', '/', `Document exceeds ${limits.maxDocumentBytes} bytes`);
  }

  try {
    const document = YAML.parseDocument(source, {
      schema: 'core',
      customTags: [],
      uniqueKeys: true,
      maxAliasCount: 50,
    });
    const yamlProblems = [...document.errors, ...document.warnings];
    if (yamlProblems.length > 0) {
      return {
        ok: false,
        errors: yamlProblems.map((error) => contractError(
          `YAML_${error.code || 'PARSE_ERROR'}`,
          '/',
          error.message.split('\n')[0],
        )),
      };
    }
    return { ok: true, value: document.toJS({ maxAliasCount: 50 }), errors: [] };
  } catch (error) {
    return failure('YAML_PARSE_ERROR', '/', error.message.split('\n')[0]);
  }
}

function parseJson(source, limits = DEFAULT_LIMITS) {
  if (typeof source !== 'string') return failure('INPUT_TYPE', '/', 'JSON input must be a string');
  if (Buffer.byteLength(source) > limits.maxDocumentBytes) {
    return failure('DOCUMENT_TOO_LARGE', '/', `Document exceeds ${limits.maxDocumentBytes} bytes`);
  }
  try {
    return { ok: true, value: JSON.parse(source), errors: [] };
  } catch (error) {
    return failure('JSON_PARSE_ERROR', '/', error.message);
  }
}

function parseMarkdownFrontMatter(markdown, limits = DEFAULT_LIMITS) {
  const split = splitMarkdownFrontMatter(markdown, limits);
  if (!split.ok) return split;
  return parseYaml(split.value.frontMatter, limits);
}

function loadSchemas(schemaDirectory = DEFAULT_SCHEMA_DIRECTORY) {
  const schemas = {};
  for (const type of SCHEMA_TYPES) {
    const schemaPath = path.join(schemaDirectory, `${type}.schema.json`);
    schemas[type] = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  }
  return schemas;
}

function compileSchemas(schemas = loadSchemas()) {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  for (const schema of Object.values(schemas)) ajv.addSchema(schema);

  const validators = {};
  for (const type of SCHEMA_TYPES) validators[type] = ajv.getSchema(schemas[type].$id);
  return validators;
}

let defaultValidators;

function getDefaultValidators() {
  defaultValidators ??= compileSchemas();
  return defaultValidators;
}

function formatValidationErrors(errors = []) {
  return errors.map((error) => {
    const property = error.params.missingProperty || error.params.additionalProperty;
    const propertyPath = property
      ? `${error.instancePath}/${property.replaceAll('~', '~0').replaceAll('/', '~1')}`
      : error.instancePath;
    return contractError(
      `SCHEMA_${error.keyword.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`,
      propertyPath || '/',
      error.message || 'Schema validation failed',
    );
  });
}

function validate(type, value, validators = getDefaultValidators()) {
  if (!SCHEMA_TYPES.includes(type)) return failure('UNKNOWN_CONTRACT_TYPE', '/type', `Unknown contract type: ${type}`);
  const validator = validators[type];
  const ok = validator(value);
  return ok
    ? { ok: true, value, errors: [] }
    : { ok: false, errors: formatValidationErrors(validator.errors) };
}

function validateSource(type, source, format, validators = getDefaultValidators(), limits = DEFAULT_LIMITS) {
  let parsed;
  if (format === 'json') parsed = parseJson(source, limits);
  else if (format === 'yaml' || format === 'yml') parsed = parseYaml(source, limits);
  else if (format === 'markdown' || format === 'md') parsed = parseMarkdownFrontMatter(source, limits);
  else return failure('UNSUPPORTED_FORMAT', '/format', `Unsupported contract format: ${format}`);
  return parsed.ok ? validate(type, parsed.value, validators) : parsed;
}

function validateFile(type, filePath, options = {}) {
  if (!SCHEMA_TYPES.includes(type)) return failure('UNKNOWN_CONTRACT_TYPE', '/type', `Unknown contract type: ${type}`);
  const limits = options.limits || DEFAULT_LIMITS;
  let source;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return failure('FILE_NOT_REGULAR', '/', 'Contract path must reference a regular file');
    if (stat.size > limits.maxDocumentBytes) {
      return failure('DOCUMENT_TOO_LARGE', '/', `Document exceeds ${limits.maxDocumentBytes} bytes`);
    }
    source = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    return failure('FILE_READ_ERROR', '/', error.message);
  }

  const extension = path.extname(filePath).slice(1).toLowerCase();
  return validateSource(type, source, extension, options.validators || getDefaultValidators(), limits);
}

module.exports = {
  DEFAULT_LIMITS,
  DEFAULT_SCHEMA_DIRECTORY,
  SCHEMA_TYPES,
  compileSchemas,
  formatValidationErrors,
  loadSchemas,
  parseJson,
  parseMarkdownFrontMatter,
  parseYaml,
  splitMarkdownFrontMatter,
  validate,
  validateFile,
  validateSource,
};
