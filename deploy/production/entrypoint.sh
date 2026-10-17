#!/usr/bin/env bash
set -euo pipefail

case "${1:-serve}" in
  migrate)
    cd /app/apps/server
    exec node dist/infrastructure/database/migrate.js
    ;;
  baseline)
    cd /app/apps/server
    exec node dist/infrastructure/database/baseline.js
    ;;
  vault)
    shift
    exec /usr/local/bin/vault "$@"
    ;;
  serve)
    child_pid_list=()

    # Stop every service if one exits, so Docker can restart the whole application.
    shutdown_handler() {
      trap - EXIT INT TERM
      for child_pid in "${child_pid_list[@]}"; do
        kill -TERM "$child_pid" 2>/dev/null || true
      done
      wait || true
    }
    trap shutdown_handler EXIT
    trap 'exit 0' INT TERM

    /usr/local/bin/vault serve &
    child_pid_list+=("$!")
    (cd /app/apps/server && exec node dist/main.js) &
    child_pid_list+=("$!")
    nginx -g 'daemon off;' &
    child_pid_list+=("$!")

    wait -n "${child_pid_list[@]}"
    exit 1
    ;;
  *)
    exec "$@"
    ;;
esac
