# QA Agent Starter

This starter kit creates a repeatable QA agent for a tool with:

- n8n as the backend workflow layer
- React as one frontend
- Retool as another frontend
- Optional AI review of test artifacts

The key idea is simple: deterministic tests decide pass or fail, and the AI reviewer explains failures from logs, screenshots, network traces, and response artifacts.

## Non-technical setup

If you want the slow, step-by-step version, start here:

```txt
STEP_BY_STEP.md
```

On Windows, the guided setup script is:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\setup-windows.ps1
```

On Mac, the guided setup script is:

```bash
chmod +x setup-mac.sh
./setup-mac.sh
```

## Which AI agent should do the test?

Use **Playwright as the testing agent** and an **LLM as the reviewing agent**.

Do not rely on an AI model to freely click around and decide whether the app works. That is flaky. Instead:

- **Playwright** executes the browser steps exactly.
- **API checks** validate the n8n backend and JSON contracts.
- **Retool Test Deploy** verifies Retool source-control deployability.
- **Claude/OpenAI/another LLM** reviews artifacts and writes the QA report.

Recommended split:

| Agent | Job |
|---|---|
| n8n API checker | Hits test webhooks, checks status codes, validates response schema |
| Playwright UI checker | Runs React and Retool journeys |
| AI reviewer | Reads artifacts and explains likely root causes |

## Quick start

```bash
cp .env.example .env
npm install
npm run install:browsers
```

Edit `.env`:

```bash
REACT_APP_URL=https://your-react-staging-url.example.com
RETOOL_BASE_URL=https://your-org.retool.com
RETOOL_APP_URL=https://your-org.retool.com/apps/your-app
RETOOL_TEST_EMAIL=qa-test@example.com
RETOOL_TEST_PASSWORD=replace-me
N8N_BASE_URL=https://your-n8n.example.com
N8N_API_KEY=replace-me
```

Then edit:

```txt
config/test-cases.json
config/expected-contracts.json
```

Run everything:

```bash
npm run qa
```

Run pieces individually:

```bash
npm run n8n:inventory
npm run test:n8n
npm run test:react
npm run test:retool
npm run retool:test-deploy
npm run report
```

## If you have many n8n workflows

If you have dozens or hundreds of n8n workflows, do not manually hunt for webhook URLs first. Use the inventory command.

Set:

```bash
N8N_BASE_URL=https://your-n8n.example.com
N8N_API_KEY=replace-me
```

Then run:

```bash
npm run n8n:inventory
```

It writes:

```txt
artifacts/logs/n8n-workflows-raw.json
artifacts/logs/n8n-workflow-inventory.json
artifacts/logs/n8n-suggested-test-cases.json
artifacts/reports/n8n-workflow-inventory.md
```

Use `artifacts/reports/n8n-workflow-inventory.md` to identify webhook-style workflows and likely test URLs.

Recommended process for 100+ workflows:

1. Run `npm run n8n:inventory`.
2. Pick the top 5 to 10 workflows that the React and Retool apps actually depend on.
3. Copy entries from `artifacts/logs/n8n-suggested-test-cases.json` into the `n8n` array in `config/test-cases.json`.
4. Set `"enabled": true` only after you replace the placeholder body with a safe test payload.
5. Add or tighten the response schema in `config/expected-contracts.json`.
6. Run `npm run test:n8n`.
7. Expand coverage once the critical workflows are stable.

The inventory script generates both `/webhook-test/...` and `/webhook/...` candidates when it finds webhook paths. Prefer `/webhook-test/...` for inactive/manual testing and staging workflows, and use `/webhook/...` only when you intentionally want to test active production-style endpoints.

## Configure test cases

All test journeys live in `config/test-cases.json`.

### n8n test case

```json
{
  "name": "happy-path-webhook",
  "enabled": true,
  "method": "POST",
  "webhookPath": "/webhook-test/your-test-webhook",
  "headers": {
    "Content-Type": "application/json"
  },
  "body": {
    "testRunId": "{{RUN_ID}}",
    "companyName": "Acme Inc"
  },
  "expectedStatus": 200,
  "responseSchemaName": "workflowResult"
}
```

### React test case

Use stable `data-testid` attributes in your React app.

```json
{
  "name": "react-happy-path",
  "enabled": true,
  "url": "{{REACT_APP_URL}}",
  "steps": [
    {
      "action": "fill",
      "selector": "[data-testid='input-company']",
      "value": "Acme Inc"
    },
    {
      "action": "click",
      "selector": "[data-testid='button-run-workflow']"
    },
    {
      "action": "expectText",
      "selector": "[data-testid='status-result']",
      "value": "Completed",
      "timeoutMs": 15000
    }
  ]
}
```

### Retool test case

Retool selectors can use CSS, text selectors, or component-derived selectors. Prefer stable component names where possible.

```json
{
  "name": "retool-happy-path",
  "enabled": true,
  "url": "{{RETOOL_APP_URL}}",
  "requiresLogin": true,
  "steps": [
    {
      "action": "fill",
      "selector": "input[placeholder='Company name']",
      "value": "Acme Inc"
    },
    {
      "action": "click",
      "selector": "button:has-text('Run')"
    },
    {
      "action": "wait",
      "timeoutMs": 3000
    },
    {
      "action": "expectText",
      "selector": "body",
      "value": "Completed",
      "timeoutMs": 15000
    }
  ]
}
```

Retool does not expose a universal programmatic way to await query completion, so use explicit waits after actions that trigger Retool queries.

## Response contracts

Define expected n8n response shapes in `config/expected-contracts.json`.

Example:

```json
{
  "workflowResult": {
    "type": "object",
    "required": ["status"],
    "properties": {
      "status": {
        "type": "string"
      }
    },
    "additionalProperties": true
  }
}
```

## AI reviewer

By default, the reporter works without an AI key and creates a deterministic markdown report.

To enable OpenAI:

```bash
AI_PROVIDER=openai
AI_API_KEY=replace-me
AI_MODEL=gpt-4.1-mini
```

To enable Anthropic:

```bash
AI_PROVIDER=anthropic
AI_API_KEY=replace-me
AI_MODEL=claude-3-5-sonnet-latest
```

Output:

```txt
artifacts/reports/qa-report.md
```

## Retool test deploy

If your Retool app uses source control, set:

```bash
RETOOL_BASE_URL=https://your-org.retool.com
RETOOL_TEST_DEPLOY_API_KEY=replace-me
COMMIT_SHA=your-full-commit-sha
```

Then run:

```bash
npm run retool:test-deploy
```

## GitHub Actions

Copy `.github/workflows/qa-agent.yml` into your repository and configure these secrets:

- `REACT_APP_URL`
- `RETOOL_BASE_URL`
- `RETOOL_APP_URL`
- `RETOOL_TEST_EMAIL`
- `RETOOL_TEST_PASSWORD`
- `N8N_BASE_URL`
- `N8N_API_KEY`
- `AI_PROVIDER`
- `AI_API_KEY`
- `AI_MODEL`
- Optional: `RETOOL_TEST_DEPLOY_API_KEY`

## How to customize this for your actual tool

1. Add test IDs to your React app for every important input, button, and output.
2. Create a limited-permission Retool test user.
3. Create a staging or test n8n webhook path.
4. Add 3 to 5 happy-path and failure-path examples in `config/test-cases.json`.
5. Tighten `config/expected-contracts.json` so schema drift gets caught.
6. Run locally.
7. Add GitHub Actions.
8. Review the AI report after each run.

## Safety notes

- Do not run write-heavy tests against production data.
- Use test records with a clear `testRunId`.
- Give the Retool test user the minimum permissions needed.
- Keep API keys in `.env` or CI secrets only.
- Use staging n8n workflows or inactive/test copies during development.
