#!/usr/bin/env bash
# Gate local hermético do Prosa. Não instala dependências nem chama agentes ou serviços externos.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
cd "${ROOT_DIR}"

if [[ ! -d node_modules ]]; then
  printf 'FAIL  dependências ausentes — execute npm ci --ignore-scripts\n' >&2
  exit 1
fi

printf 'RUN   resolução instalada contra package-lock.json\n'
npm ls --all --omit=optional >/dev/null
printf 'OK    resolução instalada\n\n'

printf 'RUN   lint estrutural de specs\n'
npm run lint:specs
printf 'OK    lint estrutural de specs\n\n'

printf 'RUN   suíte hermética\n'
npm run test:hermetic
printf 'OK    suíte hermética\n\n'

printf 'Todas as verificações herméticas do Prosa passaram.\n'
