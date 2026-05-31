# GDA n8n QA Agents

This bundle creates two n8n agents:

1. **GDA.qa.agent-runner**  
   Read-only testing and inspection agent.

2. **GDA.qa.fix-runner**  
   Controlled repair agent. It is dry-run by default and requires explicit approval before applying write actions.

## What these agents are for

The goal is to support this loop:

```text
Test → Find failure → Diagnose → Propose fix → Apply approved fix → Retest → Report
```

## Phase model

### Phase 1: React smoke

Checks that the main React Launchpad loads and shows live dashboard data.

```powershell
npm run test:react
```

### Phase 2: React module coverage

Clicks through the React sidebar modules and catches broken API calls, direct browser-to-n8n calls, 403s, blank screens, and visible error text.

```powershell
npm run test:react:coverage
```

### Phase 3: n8n workflow coverage

Uses `GDA.qa.agent-runner` to inventory workflows, test selected workflow groups, and retrieve latest failed executions.

## Files

```text
workflows/GDA.qa.agent-runner.json
workflows/GDA.qa.fix-runner.json
scripts/call-qa-agent.ps1
scripts/call-fix-agent.ps1
examples/qa-agent-requests.json
examples/current-react-failures-fix-plan.json
```

## Required environment variables inside n8n

Set these in the n8n environment, not in browser JavaScript.

```text
GDA_QA_N8N_BASE_URL=https://n8n.csr-llc.tech
GDA_QA_N8N_API_KEY=<temporary n8n API key>
GDA_WEBHOOK_AUTH_HEADER_NAME=x-gda-key
GDA_WEBHOOK_AUTH_HEADER_VALUE=<current real webhook key>
GDA_QA_AGENT_KEY=<new private key for qa-agent-runner>
GDA_QA_FIX_KEY=<new private key for fix-runner>
GDA_QA_FIX_MODE=dry-run
```

When you are ready for controlled writes, change:

```text
GDA_QA_FIX_MODE=enabled
```

Keep it as `dry-run` until the read-only agent is working.

## Import order

1. Import `workflows/GDA.qa.agent-runner.json` into n8n.
2. Add Header Auth or keep the internal `x-gda-qa-key` guard.
3. Activate the workflow.
4. Test the health action.
5. Import `workflows/GDA.qa.fix-runner.json`.
6. Keep fix runner in dry-run mode first.
7. Activate the workflow.

## QA runner endpoint

After import, the read-only agent webhook path is:

```text
/webhook/gda-qa-agent
```

Supported actions:

```text
health
inventory_workflows
test_selected_workflow_group
test_react_used_workflows
test_retool_used_workflows
return_execution_failures
return_latest_failed_workflows
workflow_details
```

## Fix runner endpoint

After import, the controlled fix agent webhook path is:

```text
/webhook/gda-qa-fix
```

Supported actions:

```text
health
suggest_fix
create_proxy_fix_manifest
activate_workflow
deactivate_workflow
apply_n8n_workflow_update
rollback_n8n_workflow
```

Write actions require:

```json
{
  "approved": true
}
```

They also require:

```text
GDA_QA_FIX_MODE=enabled
```

## First checks to run

Read-only health:

```json
{
  "action": "health"
}
```

Inventory:

```json
{
  "action": "inventory_workflows"
}
```

React-used workflow tests:

```json
{
  "action": "test_react_used_workflows"
}
```

Latest failed executions:

```json
{
  "action": "return_latest_failed_workflows",
  "limit": 25
}
```

## Current React failures to fix first

The React coverage crawl found direct or broken backend calls in:

```text
Intel Feed
Deep Research
Proposal Factory
Financial Bible
```

Current examples:

```text
https://n8n.csr-llc.tech/webhook/gda-deep-research-history → 403
https://n8n.csr-llc.tech/webhook/gda-capture-plan → 403
https://gda.csr-llc.tech/api/gda-action-history → aborted
```

Correct frontend pattern:

```text
Browser → https://gda.csr-llc.tech/api/<path> → server proxy adds x-gda-key → n8n webhook
```

Avoid this pattern in browser code:

```text
Browser → https://n8n.csr-llc.tech/webhook/<path>
```

