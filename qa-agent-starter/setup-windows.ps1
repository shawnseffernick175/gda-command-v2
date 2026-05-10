Write-Host ""
Write-Host "QA Agent guided setup for Windows" -ForegroundColor Cyan
Write-Host "This script creates your local .env file. Do not share the .env file." -ForegroundColor Yellow
Write-Host ""

$envPath = Join-Path $PSScriptRoot ".env"
$examplePath = Join-Path $PSScriptRoot ".env.example"

if (!(Test-Path $envPath)) {
  Copy-Item $examplePath $envPath
  Write-Host "Created .env from .env.example"
} else {
  Write-Host ".env already exists. I will update known fields only."
}

$n8nBaseUrl = Read-Host "Paste your n8n base URL, for example https://your-company.app.n8n.cloud"
$n8nApiKey = Read-Host "Paste your n8n API key. It will only be saved on this computer"

$content = Get-Content $envPath -Raw
$content = $content -replace "N8N_BASE_URL=.*", "N8N_BASE_URL=$n8nBaseUrl"
$content = $content -replace "N8N_API_KEY=.*", "N8N_API_KEY=$n8nApiKey"
$content = $content -replace "REACT_APP_URL=.*", "REACT_APP_URL=https://gda.csr-llc.tech/#launchpad"
$content = $content -replace "RETOOL_BASE_URL=.*", "RETOOL_BASE_URL=https://gdacommand.retool.com"
$content = $content -replace "RETOOL_APP_URL=.*", "RETOOL_APP_URL=https://gdacommand.retool.com/apps/9b2e8dbe-3f30-11f1-a98a-d30e2de07c9f/GDA%20Command%20Platform/dashboard"
Set-Content -Path $envPath -Value $content

Write-Host ""
Write-Host "Installing the QA agent packages..." -ForegroundColor Cyan
npm install

Write-Host ""
Write-Host "Installing the browser used by the test runner..." -ForegroundColor Cyan
npm run install:browsers

Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host "Next command to run:"
Write-Host "npm run n8n:inventory" -ForegroundColor Cyan
