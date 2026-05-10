param(
  [string]$Url = "https://n8n.csr-llc.tech/webhook/gda-qa-fix",
  [string]$Action = "health",
  [string]$Key = $env:GDA_QA_FIX_KEY,
  [switch]$Approved
)

$ErrorActionPreference = "Stop"

if (-not $Key) {
  $Key = Read-Host "Enter GDA_QA_FIX_KEY"
}

$bodyObject = @{
  action = $Action
  approved = [bool]$Approved
}

$body = $bodyObject | ConvertTo-Json -Depth 20
$headers = @{
  "x-gda-fix-key" = $Key
  "Content-Type" = "application/json"
}

Invoke-RestMethod -Uri $Url -Method POST -Headers $headers -Body $body | ConvertTo-Json -Depth 50

