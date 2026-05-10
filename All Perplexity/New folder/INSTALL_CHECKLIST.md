# Install Checklist

## 1. Import the read-only QA agent

In n8n:

1. Go to **Workflows**.
2. Select **Import from File**.
3. Import:

```text
workflows/GDA.qa.agent-runner.json
```

4. Save.
5. Activate.

## 2. Import the controlled fix agent

Import:

```text
workflows/GDA.qa.fix-runner.json
```

Keep fix mode dry-run first:

```text
GDA_QA_FIX_MODE=dry-run
```

Activate it only after the read-only agent health check works.

## 3. Add n8n environment values

Minimum values:

```text
GDA_QA_N8N_BASE_URL=https://n8n.csr-llc.tech
GDA_QA_N8N_API_KEY=<temporary n8n API key>
GDA_WEBHOOK_AUTH_HEADER_NAME=x-gda-key
GDA_WEBHOOK_AUTH_HEADER_VALUE=<current real webhook key>
GDA_QA_AGENT_KEY=<private qa runner key>
GDA_QA_FIX_KEY=<private fix runner key>
GDA_QA_FIX_MODE=dry-run
```

## 4. Restart n8n if needed

n8n may need a restart to see new environment variables.

## 5. Test health

From PowerShell:

```powershell
.\scripts\call-qa-agent.ps1 -Action health
```

Then:

```powershell
.\scripts\call-fix-agent.ps1 -Action health
```

## 6. First production-safe runs

Read-only inventory:

```powershell
.\scripts\call-qa-agent.ps1 -Action inventory_workflows
```

React-used workflow tests:

```powershell
.\scripts\call-qa-agent.ps1 -Action test_react_used_workflows
```

Latest failed workflows:

```powershell
.\scripts\call-qa-agent.ps1 -Action return_latest_failed_workflows
```

## 7. Fix flow

1. Run React coverage test.
2. Send findings to fix runner with `suggest_fix` or `create_proxy_fix_manifest`.
3. Review the proposed fix.
4. Apply only after approval.
5. Rerun React coverage test.

Write actions require:

```json
{
  "approved": true
}
```

and:

```text
GDA_QA_FIX_MODE=enabled
```

