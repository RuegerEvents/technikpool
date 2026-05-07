#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DEFAULT_ENV_FILE="$SCRIPT_DIR/../.env"

ENV_FILE="${1:-$DEFAULT_ENV_FILE}"

if [[ ! -f "$ENV_FILE" ]]; then
	echo "Error: env file not found: $ENV_FILE" >&2
	echo "Usage: $0 [path/to/.env]" >&2
	exit 1
fi

# Load .env (must be valid shell KEY=VALUE syntax)
set -a
# shellcheck source=/dev/null
. "$ENV_FILE"
set +a

if [[ -z "${TECHNIKPOOL_SERVER_IP-}" || -z "${TECHNIKPOOL_SERVER_USER-}" || -z "${TECHNIKPOOL_SERVER_PASSWORD-}" ]]; then
	echo "Error: missing required env vars in $ENV_FILE" >&2
	echo "Set these variables:" >&2
	echo "  TECHNIKPOOL_SERVER_IP" >&2
	echo "  TECHNIKPOOL_SERVER_USER" >&2
	echo "  TECHNIKPOOL_SERVER_PASSWORD" >&2
	exit 1
fi

REMOTE_DIR="/home/${TECHNIKPOOL_SERVER_USER}/server-configs/services/technikpool"

if ! command -v sshpass >/dev/null 2>&1; then
	echo "Error: 'sshpass' is required for password-based SSH." >&2
	echo "macOS: brew install hudochenkov/sshpass/sshpass" >&2
	exit 1
fi

REMOTE_SCRIPT=$(cat <<'REMOTE'
set -euo pipefail
cd "$REMOTE_DIR"

# Read sudo password from stdin once; refresh sudo timestamp.
sudo -S -v
sudo docker compose pull
sudo docker compose up -d
REMOTE
)

# Provide sudo password via stdin (not via command args).
# Note: sshpass still needs the SSH password; we pass it via env to avoid it appearing in argv.
remote_dir_escaped=$(printf %q "$REMOTE_DIR")
remote_script_escaped=$(printf %q "$REMOTE_SCRIPT")
remote_cmd="REMOTE_DIR=$remote_dir_escaped bash -lc $remote_script_escaped"

printf '%s\n' "$TECHNIKPOOL_SERVER_PASSWORD" | env SSHPASS="$TECHNIKPOOL_SERVER_PASSWORD" \
	sshpass -e ssh -tt \
		-o StrictHostKeyChecking=accept-new \
		"$TECHNIKPOOL_SERVER_USER@$TECHNIKPOOL_SERVER_IP" \
		"$remote_cmd"
