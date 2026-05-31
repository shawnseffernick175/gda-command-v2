# Step-by-step setup

This guide is for non-technical setup.

## Recommendation

Use your Windows ThinkPad first. It has plenty of memory and will be stable for the first inventory run.

After we identify the important n8n workflows, we can move this into GitHub Actions so it runs automatically.

## What you are setting up

You are setting up a local QA agent that can:

- Check your React launchpad.
- Check your Retool dashboard once a Retool test user is added.
- Inventory your n8n workflows.
- Generate a report showing what passed, what failed, and what needs attention.

## Important safety rule

Do not paste your n8n API key into ChatGPT, Perplexity, Slack, email, or anywhere public.

Only paste it into the `.env` file on your own computer or into a secure secret manager such as GitHub Actions secrets.

## Part 1: Install Node.js

1. Open this page: https://nodejs.org/
2. Download the **LTS** version for Windows.
3. Run the installer.
4. Accept the default options.
5. When it finishes, restart your computer if asked.

## Part 2: Unzip the QA agent

1. Download the `qa_agent_starter` zip file.
2. Right-click it.
3. Choose **Extract All**.
4. Put it somewhere easy, such as your Desktop.

You should now have a folder named:

```txt
qa-agent-starter
```

## Part 3: Open PowerShell in the folder

1. Open the `qa-agent-starter` folder.
2. Click the address bar at the top of File Explorer.
3. Type:

```txt
powershell
```

4. Press Enter.

A blue or black PowerShell window should open in that folder.

## Part 4: Create your n8n API key

In n8n:

1. Open your n8n account.
2. Go to settings.
3. Look for API or API keys.
4. Create a new API key.
5. Name it something like:

```txt
QA Agent Inventory
```

6. Copy the API key.

Do not send the key to me. You will paste it into the setup script on your own computer.

## Part 5: Run guided setup

In PowerShell, run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\setup-windows.ps1
```

The script will ask for:

1. Your n8n base URL.
2. Your n8n API key.

Example n8n base URLs:

```txt
https://your-company.app.n8n.cloud
https://n8n.yourdomain.com
```

Use the main URL, not a workflow URL.

## Part 6: Run n8n inventory

After setup finishes, run:

```powershell
npm run n8n:inventory
```

When it completes, it creates this file:

```txt
artifacts\reports\n8n-workflow-inventory.md
```

## Part 7: Send me the safe report

Open:

```txt
artifacts\reports\n8n-workflow-inventory.md
```

You can send me the contents of that markdown report.

Before sending, quickly check that it does not include your API key. It should not.

## Part 8: Run the React smoke test

Run:

```powershell
npm run test:react
```

Expected result:

```txt
1 passed
```

Note: the React app currently shows backend 403 errors for some API calls. The smoke test can still pass because the page renders, but the report will flag the backend calls as suspicious.

## Part 9: Generate the QA report

Run:

```powershell
npm run report
```

Open:

```txt
artifacts\reports\qa-report.md
```

## What to send me

Send me:

1. `artifacts\reports\n8n-workflow-inventory.md`
2. `artifacts\reports\qa-report.md`

Do not send:

- `.env`
- API keys
- Passwords

## If something goes wrong

Copy the error message from PowerShell and send it to me.

Do not include your API key.
