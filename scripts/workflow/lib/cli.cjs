#!/usr/bin/env node
'use strict';

const COMMANDS = new Set(['validate', 'run', 'resume', 'review']);
const VALUE_FLAGS = new Map([
  ['--base-sha', 'baseSha'],
  ['--decision-file', 'decisionFile'],
]);
const BOOLEAN_FLAGS = new Map([
  ['--allow-commit', 'allowCommit'],
  ['--create-pr', 'createPr'],
  ['--dry-run', 'dryRun'],
  ['--remove-orphan-lock', 'removeOrphanLock'],
]);
const ALLOWED_FLAGS = {
  validate: new Set(['--base-sha']),
  run: new Set(['--base-sha', '--allow-commit', '--create-pr', '--dry-run']),
  resume: new Set(['--base-sha', '--decision-file', '--allow-commit', '--create-pr', '--dry-run', '--remove-orphan-lock']),
  review: new Set(['--base-sha']),
};
const USAGE = `Usage:
  cli.cjs validate <spec-path> [--base-sha <sha>]
  cli.cjs run <spec-path> [--base-sha <sha>] [--allow-commit] [--create-pr] [--dry-run]
  cli.cjs resume <spec-path> [--base-sha <sha>] [--decision-file <path|->] [--allow-commit] [--create-pr] [--dry-run] [--remove-orphan-lock]
  cli.cjs review <spec-path> [--base-sha <sha>]
  cli.cjs --help
`;

class CliError extends Error {
  constructor(message, code = 'CLI_INVALID_ARGUMENT') {
    super(message);
    this.name = 'CliError';
    this.code = code;
  }
}

function initialOptions(command) {
  return {
    command,
    specPath: null,
    baseSha: null,
    decisionFile: null,
    allowCommit: false,
    createPr: false,
    dryRun: false,
    removeOrphanLock: false,
    help: false,
  };
}

function parseArgs(argv) {
  if (!Array.isArray(argv) || argv.some((argument) => typeof argument !== 'string')) {
    throw new CliError('Arguments must be an array of strings');
  }

  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    return { ...initialOptions(null), help: true };
  }

  const [command, ...args] = argv;
  if (!COMMANDS.has(command)) {
    throw new CliError(command ? `Unknown command: ${command}` : 'A command is required');
  }
  if (args.includes('--help') || args.includes('-h')) {
    if (args.length !== 1) throw new CliError('--help cannot be combined with other arguments');
    return { ...initialOptions(command), help: true };
  }

  const options = initialOptions(command);
  const seenFlags = new Set();
  let positionalOnly = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!positionalOnly && argument === '--') {
      positionalOnly = true;
      continue;
    }

    const valueKey = !positionalOnly && VALUE_FLAGS.get(argument);
    const booleanKey = !positionalOnly && BOOLEAN_FLAGS.get(argument);
    if (valueKey || booleanKey) {
      if (!ALLOWED_FLAGS[command].has(argument)) {
        throw new CliError(`${argument} is not valid for ${command}`);
      }
      if (seenFlags.has(argument)) throw new CliError(`Duplicate option: ${argument}`);
      seenFlags.add(argument);

      if (valueKey) {
        const value = args[index + 1];
        if (value === undefined || (value.startsWith('-') && !(argument === '--decision-file' && value === '-'))) {
          throw new CliError(`${argument} requires a value`);
        }
        options[valueKey] = value;
        index += 1;
      } else {
        options[booleanKey] = true;
      }
      continue;
    }

    if (!positionalOnly && argument.startsWith('-')) {
      throw new CliError(`Unknown option: ${argument}`);
    }
    if (options.specPath !== null) {
      throw new CliError(`Unexpected positional argument: ${argument}`);
    }
    options.specPath = argument;
  }

  if (!options.specPath) throw new CliError('A spec path is required');
  if (options.dryRun && (options.allowCommit || options.createPr || options.removeOrphanLock || options.decisionFile !== null)) {
    throw new CliError('--dry-run cannot be combined with mutable options');
  }

  return options;
}

function loadOrchestrator() {
  try {
    return require('./orchestrator.cjs');
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND'
      && error.message.startsWith("Cannot find module './orchestrator.cjs'")) {
      throw new CliError(
        'Workflow orchestration capability is not implemented yet',
        'CAPABILITY_NOT_IMPLEMENTED',
      );
    }
    throw error;
  }
}

async function main(argv = process.argv.slice(2), dependencies = {}) {
  const options = parseArgs(argv);
  const stdout = dependencies.stdout || process.stdout;
  if (options.help) {
    stdout.write(USAGE);
    return 0;
  }

  const orchestrator = dependencies.loadOrchestrator
    ? dependencies.loadOrchestrator()
    : loadOrchestrator();
  const capability = orchestrator && orchestrator[options.command];
  if (typeof capability !== 'function') {
    throw new CliError(
      `Workflow capability is not implemented: ${options.command}`,
      'CAPABILITY_NOT_IMPLEMENTED',
    );
  }
  const result = await capability(options, dependencies.workflowDependencies || {});
  if (result !== undefined && dependencies.quiet !== true) {
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
  // A blocked or failed run must not exit 0: callers check $?, not the JSON body.
  return result?.ok === false ? 1 : 0;
}

module.exports = { CliError, main, parseArgs };

if (require.main === module) {
  main().then(
    (exitCode) => { process.exitCode = exitCode; },
    (error) => {
      process.stderr.write(`${error.code || 'WORKFLOW_ERROR'}: ${error.message}\n`);
      process.exitCode = 1;
    },
  );
}
