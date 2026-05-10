$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "GDA QA Agent hotfix: updating the React smoke test..." -ForegroundColor Cyan
Write-Host ""

$startDir = Get-Location
$testCasesPath = Join-Path $startDir "config\test-cases.json"

if (-not (Test-Path $testCasesPath)) {
  $nestedPath = Join-Path $startDir "qa-agent-starter\config\test-cases.json"
  if (Test-Path $nestedPath) {
    Set-Location (Join-Path $startDir "qa-agent-starter")
    $testCasesPath = Join-Path (Get-Location) "config\test-cases.json"
  } else {
    Write-Host "I could not find config\test-cases.json here." -ForegroundColor Red
    Write-Host "Please run this from inside your qa-agent-starter folder." -ForegroundColor Yellow
    Write-Host "Example folder:"
    Write-Host "C:\Users\shawn\OneDrive\Desktop\qa-agent-starter (5)\qa-agent-starter"
    exit 1
  }
}

$backupPath = Join-Path (Split-Path $testCasesPath) ("test-cases.backup-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".json")
Copy-Item $testCasesPath $backupPath
Write-Host "Backup created:" $backupPath -ForegroundColor DarkGray

$json = Get-Content $testCasesPath -Raw | ConvertFrom-Json
$react = $json.react | Where-Object { $_.name -eq "gda-launchpad-smoke" } | Select-Object -First 1

if (-not $react) {
  Write-Host "Could not find the gda-launchpad-smoke React test." -ForegroundColor Red
  exit 1
}

$react.steps = @(
  [PSCustomObject][ordered]@{ action="expectTitle"; value="GDA Command" },
  [PSCustomObject][ordered]@{ action="expectVisible"; selector="role=heading[name='Command Center']" },
  [PSCustomObject][ordered]@{ action="expectVisible"; selector='text="INTELLIGENCE"' },
  [PSCustomObject][ordered]@{ action="expectVisible"; selector='text="BUSINESS DEVELOPMENT"' },
  [PSCustomObject][ordered]@{ action="expectVisible"; selector='text="CAPTURE & PROPOSALS"' },
  [PSCustomObject][ordered]@{ action="expectVisible"; selector="input[placeholder='Semantic search across 700+ opps & capture plans...']" },
  [PSCustomObject][ordered]@{ action="expectVisible"; selector='text="Active Opportunities"' },
  [PSCustomObject][ordered]@{ action="expectVisible"; selector='text="Opportunity Value"' },
  [PSCustomObject][ordered]@{ action="expectVisible"; selector='text="Avg GDA Score"' },
  [PSCustomObject][ordered]@{ action="expectVisible"; selector="role=heading[name=/Market Analysis/]" },
  [PSCustomObject][ordered]@{ action="expectVisible"; selector='text="$886.0B"' },
  [PSCustomObject][ordered]@{ action="expectValue"; selector="select"; value="Department of War" },
  [PSCustomObject][ordered]@{ action="expectVisible"; selector="button:has-text('How Scoring Works')" },
  [PSCustomObject][ordered]@{ action="expectVisible"; selector="textarea[placeholder*='Ask about predictions'], input[placeholder*='Ask about predictions']" },
  [PSCustomObject][ordered]@{ action="expectDisabled"; selector="button:has-text('Ask')" },
  [PSCustomObject][ordered]@{ action="expectVisible"; selector='text="Pipeline Intelligence"' },
  [PSCustomObject][ordered]@{ action="expectVisible"; selector='text="Top 10 Opportunities by GDA Score"' },
  [PSCustomObject][ordered]@{ action="expectVisible"; selector='text="View All in Opp Tracker"' },
  [PSCustomObject][ordered]@{ action="expectVisible"; selector="role=heading[name='Upcoming Deadlines']" },
  [PSCustomObject][ordered]@{ action="expectVisible"; selector="button:has-text('+ Action Item')" },
  [PSCustomObject][ordered]@{ action="expectVisible"; selector="button:has-text('+ Risk')" }
)

$cleanJson = $json | ConvertTo-Json -Depth 50
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Resolve-Path $testCasesPath), $cleanJson, $utf8NoBom)

Write-Host ""
Write-Host "React smoke test updated successfully." -ForegroundColor Green
Write-Host "Now running the React test..." -ForegroundColor Cyan
Write-Host ""

npm run test:react

Write-Host ""
Write-Host "Now regenerating the QA report..." -ForegroundColor Cyan
Write-Host ""

npm run report

Write-Host ""
Write-Host "Done. If the report says no failed artifacts, you are good." -ForegroundColor Green
