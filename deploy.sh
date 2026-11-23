#!/usr/bin/env bash
# Deploy sapl-stock-inventory to the on-prem server from macOS.
# Usage: ./deploy.sh

set -euo pipefail

SERVER_USER="jaipurrugs"
SERVER_HOST="192.168.0.82"
SERVER="${SERVER_USER}@${SERVER_HOST}"
REMOTE_DIR="/home/${SERVER_USER}/sapl-stock-inventory"
PM2_NAME="sapl-inventory"
PORT=3000

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARCHIVE="$(mktemp -t webapp-deploy).tar.gz"

CYAN=$'\033[36m'; YELLOW=$'\033[33m'; GREEN=$'\033[32m'; RED=$'\033[31m'; RESET=$'\033[0m'

# Reuse one SSH connection for scp + ssh so the password is only asked once.
mkdir -p "$HOME/.ssh"
SSH_OPTS=(-o ControlMaster=auto -o "ControlPath=$HOME/.ssh/cm-%C" -o ControlPersist=120)

cleanup() {
  rm -f "$ARCHIVE"
  ssh "${SSH_OPTS[@]}" -O exit "$SERVER" 2>/dev/null || true
}
trap cleanup EXIT

echo "${CYAN}Deploying sapl-stock-inventory to ${SERVER_HOST}...${RESET}"

echo "${YELLOW}[1/3] Packaging files...${RESET}"
# COPYFILE_DISABLE stops macOS tar from adding ._* AppleDouble files.
COPYFILE_DISABLE=1 tar -czf "$ARCHIVE" -C "$SRC" \
  --exclude='./node_modules' \
  --exclude='./.next' \
  --exclude='./.git' \
  --exclude='.env*' \
  --exclude='.DS_Store' \
  .
echo "${GREEN}Packaged ($(du -h "$ARCHIVE" | cut -f1)).${RESET}"

echo "${YELLOW}[2/3] Uploading... (enter password when asked)${RESET}"
if ! scp "${SSH_OPTS[@]}" "$ARCHIVE" "${SERVER}:/home/${SERVER_USER}/webapp.tar.gz"; then
  echo "${RED}UPLOAD FAILED. Deploy aborted — server still has the old code.${RESET}"
  exit 1
fi

echo "${YELLOW}[3/3] Building on server...${RESET}"
if ! ssh "${SSH_OPTS[@]}" "$SERVER" bash -s <<REMOTE
set -e
rm -rf ~/deploy-tmp ~/env-backup
mkdir -p ~/deploy-tmp ~/env-backup
tar -xzf ~/webapp.tar.gz -C ~/deploy-tmp

# Keep the server's env files (they are never uploaded).
if [ -d "${REMOTE_DIR}" ]; then
  find "${REMOTE_DIR}" -maxdepth 1 -name '.env*' -type f -exec cp -p {} ~/env-backup/ \;
fi

rm -rf "${REMOTE_DIR}"
mkdir -p "${REMOTE_DIR}"
cp -rp ~/deploy-tmp/. "${REMOTE_DIR}/"
if ls ~/env-backup/.env* >/dev/null 2>&1; then
  cp -p ~/env-backup/.env* "${REMOTE_DIR}/"
fi
rm -rf ~/deploy-tmp ~/env-backup ~/webapp.tar.gz

cd "${REMOTE_DIR}"
npm install
npm run build
(pm2 restart ${PM2_NAME} 2>/dev/null || pm2 start npm --name '${PM2_NAME}' -- start -- -p ${PORT})
pm2 save
REMOTE
then
  echo "${RED}BUILD/DEPLOY FAILED ON SERVER. Scroll up to see the real error. The app may still be running the PREVIOUS version.${RESET}"
  exit 1
fi

echo "${GREEN}Done! App live at http://${SERVER_HOST}:${PORT}${RESET}"
