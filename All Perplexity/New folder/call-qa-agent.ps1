param(
  [string]$Url = "https://n8n.csr-llc.tech/webhook/gda-qa-agent",
  [string]$Action = "health",
  [string]$Key = $env:GDA_QA_AGENT_KEY
)

$ErrorActionPreference = "Stop"

if (-not $Key) {
  $Key = Read-Host "Enter GDA_QA_AGENT_KEY"
}

$body = @{ action = $Action } | ConvertTo-Json -Depth 20
$headers = @{
  "x-gda-qa-key" = $Key
  "Content-Type" = "application/json"
}

Invoke-RestMethod -Uri $Url -Method POST -Headers $headers -Body $body | ConvertTo-Json -Depth 50

