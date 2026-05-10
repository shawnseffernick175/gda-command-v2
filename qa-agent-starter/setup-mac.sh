#!/usr/bin/env bash
set -euo pipefail

echo ""
echo "QA Agent guided setup for Mac"
echo "This script creates your local .env file. Do not share the .env file."
echo ""

cd "$(dirname "$0")"

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
else
  echo ".env already exists. I will update known fields only."
fi

read -r -p "Paste your n8n base URL, for example https://your-company.app.n8n.cloud: " N8N_BASE_URL_VALUE
read -r -s -p "Paste your n8n API key. It will only be saved on this computer: " N8N_API_KEY_VALUE
echo ""

python3 - <<PY
from pathlib import Path

env_path = Path(".env")
content = env_path.read_text()
replacements = {
    "N8N_BASE_URL": "$N8N_BASE_URL_VALUE",
    "N8N_API_KEY": "$N8N_API_KEY_VALUE",
    "REACT_APP_URL": "https://gda.csr-llc.tech/#launchpad",
    "RETOOL_BASE_URL": "https://gdacommand.retool.com",
    "RETOOL_APP_URL": "https://gdacommand.retool.com/apps/9b2e8dbe-3f30-11f1-a98a-d30e2de07c9f/GDA%20Command%20Platform/dashboard",
}
lines = content.splitlines()
seen = set()
for i, line in enumerate(lines):
    if "=" not in line or line.strip().startswith("#"):
        continue
    key = line.split("=", 1)[0]
    if key in replacements:
        lines[i] = f"{key}={replacements[key]}"
        seen.add(key)
for key, value in replacements.items():
    if key not in seen:
        lines.append(f"{key}={value}")
env_path.write_text("\\n".join(lines) + "\\n")
PY

echo ""
echo "Installing the QA agent packages..."
npm install

echo ""
echo "Installing the browser used by the test runner..."
npm run install:browsers

echo ""
echo "Setup complete."
echo "Next command to run:"
echo "npm run n8n:inventory"
