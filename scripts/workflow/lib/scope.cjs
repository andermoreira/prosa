'use strict';

/**
 * scope.cjs — checagem de escopo do trust boundary sobre o diff de um attempt.
 *
 * Bloqueia fail-closed quando: mais de 5 arquivos lógicos (MAX_LOGICAL_FILES), caminho alterado
 * fora das allowedAreas, path traversal/absoluto, ou symlink que resolve para fora do worktree.
 * Um arquivo alterado mas não declarado em predictedFiles NÃO bloqueia — retorna status
 * `human_decision` para revisão humana. Todo caminho é relativo ao worktree e normalizado antes de
 * qualquer match. Ver docs/workflows/automated-spec-pipeline.md § Trust Boundary.
 */

const fs = require('node:fs');
const path = require('node:path');

const MAX_LOGICAL_FILES = 5;
const CONTROL_CHARACTERS = /[\x00-\x1f\x7f]/;
const GLOB_CHARACTERS = /[*?\[\]{}()!]/;

class ScopeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ScopeError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new ScopeError(code, message, details);
}

function logicalFileCount(changes) {
  if (!Array.isArray(changes)) fail('SCOPE_CHANGES_INVALID', 'Changes must be an array');
  // Git emits one structured R record, while an ambiguous delete/add is two records.
  return changes.length;
}

function normalizeRepoPath(value, label = 'path') {
  if (typeof value !== 'string' || value === '' || CONTROL_CHARACTERS.test(value)) {
    fail('SCOPE_PATH_INVALID', `${label} must be a non-empty path without control characters`);
  }
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes('\\')) {
    fail('SCOPE_PATH_INVALID', `${label} must be a portable repository-relative path`, { path: value });
  }
  const segments = value.split('/');
  if (segments.includes('..')) fail('SCOPE_PATH_TRAVERSAL', `${label} must not contain parent traversal`, { path: value });
  const normalized = path.posix.normalize(value);
  if (normalized === '.' || normalized.startsWith('../')) fail('SCOPE_PATH_INVALID', `${label} is not a file or area path`, { path: value });
  return normalized.replace(/^\.\//, '');
}

// Um symlink em QUALQUER segmento do caminho poderia redirecionar a escrita final para fora do
// worktree, então cada segmento é resolvido e comparado com o realRoot — não basta checar a folha.
function assertNoSymlinkEscape(root, relativePath) {
  const realRoot = fs.realpathSync(root);
  let candidate = realRoot;
  for (const segment of relativePath.split('/')) {
    candidate = path.join(candidate, segment);
    let stat;
    try { stat = fs.lstatSync(candidate); }
    catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (!stat.isSymbolicLink()) continue;
    const unresolvedTarget = path.resolve(path.dirname(candidate), fs.readlinkSync(candidate));
    const target = fs.existsSync(unresolvedTarget) ? fs.realpathSync(unresolvedTarget) : unresolvedTarget;
    const relative = path.relative(realRoot, target);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      fail('SCOPE_SYMLINK_ESCAPE', 'Repository path resolves through a symlink outside the worktree', { path: relativePath });
    }
  }
}

function normalizeChange(root, change) {
  if (!change || typeof change.status !== 'string') fail('SCOPE_CHANGE_INVALID', 'Every change requires a Git status');
  const normalized = { status: change.status, path: normalizeRepoPath(change.path, 'changed path') };
  assertNoSymlinkEscape(root, normalized.path);
  if (/^R[0-9]{1,3}$/.test(change.status)) {
    normalized.oldPath = normalizeRepoPath(change.oldPath, 'rename source');
    assertNoSymlinkEscape(root, normalized.oldPath);
  } else if (change.oldPath !== undefined) {
    fail('SCOPE_CHANGE_INVALID', 'Only a Git R status may contain a rename source');
  }
  return normalized;
}

function matchesArea(candidate, area) {
  if (GLOB_CHARACTERS.test(area)) return path.matchesGlob(candidate, area);
  return candidate === area || candidate.startsWith(`${area}/`);
}

function changePaths(change) {
  return change.oldPath ? [change.oldPath, change.path] : [change.path];
}

function validateSemanticEvidence(value) {
  if (!value || !Array.isArray(value.inScope) || value.inScope.length === 0 || !Array.isArray(value.outOfScope) || value.outOfScope.length === 0) {
    fail('SCOPE_BOUNDARY_EVIDENCE_REQUIRED', 'Semantic boundary evidence requires non-empty inScope and outOfScope lists');
  }
  if ([...value.inScope, ...value.outOfScope].some((entry) => typeof entry !== 'string' || entry.trim() === '' || CONTROL_CHARACTERS.test(entry))) {
    fail('SCOPE_BOUNDARY_EVIDENCE_INVALID', 'Semantic boundary evidence must contain non-empty safe strings');
  }
  return { inScope: [...value.inScope], outOfScope: [...value.outOfScope] };
}

function evaluateScope(options) {
  const count = logicalFileCount(options?.changes);
  if (count > MAX_LOGICAL_FILES) {
    fail('SCOPE_LOGICAL_FILE_LIMIT', `Attempt affects ${count} logical files; the absolute limit is ${MAX_LOGICAL_FILES}`, { logicalFileCount: count });
  }
  if (typeof options.root !== 'string') fail('SCOPE_ROOT_INVALID', 'A worktree root is required');
  const root = fs.realpathSync(options.root);
  const changes = options.changes.map((change) => normalizeChange(root, change));
  const predictedFiles = (options.predictedFiles || []).map((value) => normalizeRepoPath(value, 'predicted file'));
  const allowedAreas = (options.allowedAreas || []).map((value) => normalizeRepoPath(value, 'allowed area'));
  if (predictedFiles.length === 0 || allowedAreas.length === 0) fail('SCOPE_DECLARATION_REQUIRED', 'Predicted files and allowed areas must be non-empty');
  for (const declaredPath of [...predictedFiles, ...allowedAreas]) assertNoSymlinkEscape(root, declaredPath);
  const semanticBoundaryEvidence = validateSemanticEvidence(options.semanticBoundaryEvidence);

  for (const predicted of predictedFiles) {
    if (!allowedAreas.some((area) => matchesArea(predicted, area))) {
      fail('SCOPE_PREDICTION_OUTSIDE_ALLOWED', 'Every predicted file must be inside an allowed area', { path: predicted });
    }
  }

  const actualPaths = changes.flatMap(changePaths);
  const outside = actualPaths.filter((candidate) => !allowedAreas.some((area) => matchesArea(candidate, area)));
  if (outside.length > 0) fail('SCOPE_OUTSIDE_ALLOWED_AREA', 'Changed path is outside all allowed areas', { paths: outside });
  const unpredicted = actualPaths.filter((candidate) => !predictedFiles.some((pattern) => path.matchesGlob(candidate, pattern)));
  const status = unpredicted.length > 0 ? 'human_decision' : 'accepted';
  return {
    status,
    logicalFileCount: count,
    unpredicted,
    evidence: { changes, predictedFiles, allowedAreas, semanticBoundaryEvidence },
  };
}

module.exports = { MAX_LOGICAL_FILES, ScopeError, evaluateScope, logicalFileCount, normalizeRepoPath };
