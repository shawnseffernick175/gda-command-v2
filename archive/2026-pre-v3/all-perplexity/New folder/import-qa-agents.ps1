$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "GDA QA Agents importer" -ForegroundColor Cyan
Write-Host ""

function Read-DotEnvFile {
  param([string]$Path)
  $values = @{}
  if (-not (Test-Path $Path)) {
    return $values
  }

  foreach ($line in Get-Content $Path) {
    if ($line -match '^\s*#') { continue }
    if ($line -match '^\s*$') { continue }
    if ($line -match '^\s*([^=]+?)\s*=\s*(.*)\s*$') {
      $key = $Matches[1].Trim()
      $value = $Matches[2].Trim()
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      $values[$key] = $value
    }
  }
  return $values
}

function Find-EnvFile {
  $candidates = @(
    ".\.env",
    "..\.env",
    "..\qa-agent-starter\.env",
    "..\..\qa-agent-starter\.env",
    "..\qa-agent-starter (5)\qa-agent-starter\.env",
    "..\qa-agent-starter (4)\qa-agent-starter\.env",
    "..\qa-agent-starter (3)\qa-agent-starter\.env",
    "..\qa-agent-starter (2)\qa-agent-starter\.env"
  )

  foreach ($candidate in $candidates) {
    $resolved = Resolve-Path $candidate -ErrorAction SilentlyContinue
    if ($resolved) {
      return $resolved.Path
    }
  }
  return $null
}

function ConvertTo-N8nCreateWorkflowPayload {
  param([object]$Workflow)

  $payload = [ordered]@{
    name = $Workflow.name
    nodes = $Workflow.nodes
    connections = $Workflow.connections
    settings = $Workflow.settings
  }

  if ($Workflow.staticData) {
    $payload.staticData = $Workflow.staticData
  }

  return $payload
}

function Import-Workflow {
  param(
    [string]$FilePath,
    [string]$BaseUrl,
    [string]$ApiKey
  )

  if (-not (Test-Path $FilePath)) {
    throw "Workflow file not found: $FilePath"
  }

  $workflow = Get-Content $FilePath -Raw | ConvertFrom-Json
  $payload = ConvertTo-N8nCreateWorkflowPayload -Workflow $workflow
  $body = $payload | ConvertTo-Json -Depth 100

  $headers = @{
    "X-N8N-API-KEY" = $ApiKey
    "Content-Type" = "application/json"
    "Accept" = "application/json"
  }

  $url = ($BaseUrl.TrimEnd("/")) + "/api/v1/workflows"
  Write-Host "Importing $($workflow.name)..." -ForegroundColor Cyan

  try {
    $result = Invoke-RestMethod -Uri $url -Method POST -Headers $headers -Body $body
    Write-Host "Imported: $($workflow.name)" -ForegroundColor Green
    if ($result.id) {
      Write-Host "Workflow ID: $($result.id)" -ForegroundColor DarkGray
    }
    return $result
  } catch {
    Write-Host ""
    Write-Host "Import failed for $($workflow.name)." -ForegroundColor Red
    Write-Host "n8n may already have a workflow with this name, or the API key may not allow workflow creation." -ForegroundColor Yellow
    Write-Host $_.Exception.Message
    throw
  }
}

$root = Split-Path $PSScriptRoot -Parent
$workflowDir = Join-Path $root "workflows"
$qaWorkflow = Join-Path $workflowDir "GDA.qa.agent-runner.json"
$fixWorkflow = Join-Path $workflowDir "GDA.qa.fix-runner.json"

$envPath = Find-EnvFile
$envValues = @{}
if ($envPath) {
  Write-Host "Using .env file:" $envPath -ForegroundColor DarkGray
  $envValues = Read-DotEnvFile -Path $envPath
}

$baseUrl = $envValues["N8N_BASE_URL"]
if (-not $baseUrl) {
  $baseUrl = Read-Host "Enter your n8n base URL, for example https://n8n.csr-llc.tech"
}

$apiKey = $envValues["N8N_API_KEY"]
if (-not $apiKey) {
  $secureKey = Read-Host "Enter your n8n API key" -AsSecureString
  $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey))
}

Write-Host ""
Write-Host "This will create two new workflows in n8n:" -ForegroundColor Yellow
Write-Host "- GDA.qa.agent-runner"
Write-Host "- GDA.qa.fix-runner"
Write-Host ""

$confirm = Read-Host "Type IMPORT to continue"
if ($confirm -ne "IMPORT") {
  Write-Host "Cancelled." -ForegroundColor Yellow
  exit 0
}

$qaResult = Import-Workflow -FilePath $qaWorkflow -BaseUrl $baseUrl -ApiKey $apiKey
$fixResult = Import-Workflow -FilePath $fixWorkflow -BaseUrl $baseUrl -ApiKey $apiKey

Write-Host ""
Write-Host "Done. Next steps:" -ForegroundColor Green
Write-Host "1. Open n8n."
Write-Host "2. Find GDA.qa.agent-runner and GDA.qa.fix-runner."
Write-Host "3. Add the required environment variables from INSTALL_CHECKLIST.md."
Write-Host "4. Activate GDA.qa.agent-runner first."
Write-Host "5. Keep GDA.qa.fix-runner in dry-run mode until health checks pass."
Write-Host ""
