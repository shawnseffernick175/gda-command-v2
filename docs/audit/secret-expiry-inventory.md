# Secret Expiry Inventory

> Last updated: 2026-05-19
> Purpose: Single source of truth for all GDA secret expirations.
> Auto-monitored secrets are checked by the `secret_expiry_check` Sentinel probe every 6 hours.

## n8n API Keys

| Secret Name | Location | Expiry | Days Remaining | Rotation Owner | Auto-Monitored |
|---|---|---|---|---|---|
| GDA CMF_0519'26 (I0WVrleWWSljclfX) | n8n DB `user_api_keys` | Never | ∞ | Shawn | Yes (DB query) |
| GDA Command_05/17/26 (EF2kYdqZwPjyMugO) | n8n DB `user_api_keys` | Never | ∞ | Shawn | Yes (DB query) |
| Devin-Rotated (WoNIFcP3nyJnC8v5) | n8n DB `user_api_keys` | 2026-06-09 | ~21 | Devin | Yes (DB query) |
| 050724_MCP API (Q9U4Ihh32PMoAKU2) | n8n DB `user_api_keys` | Never | ∞ | Shawn | Yes (DB query) |
| MCP Server API Key (339O6NNJ5ZuM4NbZ) | n8n DB `user_api_keys` | Never | ∞ | Shawn | Yes (DB query) |

**Active key in `.env`:** GDA CMF_0519'26 (never expires). Rotated 2026-05-19.

> **REROTATE_RECOMMENDED:** Devin-Rotated (WoNIFcP3nyJnC8v5) expires 2026-06-09 (~21 days). Consider revoking since it is not in active use.

## n8n Encryption Key

| Secret Name | Location | Expiry | Days Remaining | Rotation Owner | Auto-Monitored |
|---|---|---|---|---|---|
| N8N_ENCRYPTION_KEY | `/root/n8n-envision/.env` | Never | ∞ | Shawn | No (static) |

n8n encryption keys do not expire. Rotation requires re-encrypting all credentials.

## n8n Environment Secrets

| Secret Name | Location | Expiry | Days Remaining | Rotation Owner | Auto-Monitored |
|---|---|---|---|---|---|
| GDA_QA_N8N_API_KEY | `/root/n8n-envision/.env` | Never | ∞ | Devin | Yes (DB query) |
| GDA_FIX_AGENT_KEY | `/root/n8n-envision/.env` | Never (app-defined) | ∞ | Shawn | Yes (inventory) |
| GDA_QA_AGENT_KEY | `/root/n8n-envision/.env` | Never (app-defined) | ∞ | Shawn | Yes (inventory) |
| GDA_WEBHOOK_HEADER_VALUE | `/root/n8n-envision/.env` | Never (app-defined) | ∞ | Shawn | Yes (inventory) |
| N8N_API_KEY | `/root/n8n-envision/.env` | Never (app-defined) | ∞ | Shawn | Yes (inventory) |
| POSTGRES_PASSWORD | `/root/n8n-envision/.env` | Never (self-managed) | ∞ | Shawn | No (static) |
| DB_POSTGRESDB_PASSWORD | `/root/n8n-envision/.env` | Never (self-managed) | ∞ | Shawn | No (static) |

## External API Keys

| Secret Name | Location | Expiry | Days Remaining | Rotation Owner | Auto-Monitored |
|---|---|---|---|---|---|
| SAM_GOV_API_KEY | `/root/n8n-envision/.env` | Never (SAM.gov keys do not expire) | ∞ | Shawn | Yes (inventory) |
| OPENAI_API_KEY | `/root/n8n-envision/.env` | Never (OpenAI API keys do not expire) | ∞ | Shawn | Yes (inventory) |
| ANTHROPIC_API_KEY | `/root/n8n-envision/.env` | Never (Anthropic keys do not expire) | ∞ | Shawn | Yes (inventory) |
| TAVILY_API_KEY | `/root/n8n-envision/.env` | Never (Tavily keys do not expire) | ∞ | Shawn | Yes (inventory) |
| PINECONE_API_KEY | `/root/n8n-envision/.env` | Never (Pinecone keys do not expire) | ∞ | Shawn | Yes (inventory) |

## n8n Credentials (stored encrypted in n8n DB)

| Secret Name | Location | Expiry | Days Remaining | Rotation Owner | Auto-Monitored |
|---|---|---|---|---|---|
| Anthropic account (d92MU0tRK7bEGV83) | n8n credentials_entity | Never | ∞ | Shawn | No |
| GDA GitHub Bridge PAT (TBzQR4MBiWOGoJmV) | n8n credentials_entity | Unknown — check github.com/settings/tokens | ? | Shawn | Yes (inventory) |
| GDA Perplexity API (XbSFD2Awtv15Iare) | n8n credentials_entity | Never (Perplexity keys do not expire) | ∞ | Shawn | No |
| GDA Postgres (HwronxMmGY5XDGEt) | n8n credentials_entity | Never (self-managed) | ∞ | Shawn | No |
| GDA Telegram Bot (Jr8OOsZqc9DarQE6) | n8n credentials_entity | Never (Telegram bot tokens do not expire) | ∞ | Shawn | No |
| GDA VPS SSH Key (NKOxLo5F81sRNPua) | n8n credentials_entity | Never (SSH keys do not expire) | ∞ | Shawn | No |
| GDA Webhook Auth (1pNPY36DDz49OtKL) | n8n credentials_entity | Never (app-defined) | ∞ | Shawn | No |
| GDA Webhook Auth v2 (F4J3vYsPrJrYiO49) | n8n credentials_entity | Never (app-defined) | ∞ | Shawn | No |
| GitHub Gist PAT (sKJFLNzetK86JnvO) | n8n credentials_entity | Unknown — check github.com/settings/tokens | ? | Shawn | Yes (inventory) |
| OpenAi account (unLYjAN4H9MFrJ0u) | n8n credentials_entity | Never | ∞ | Shawn | No |
| PineconeApi account 2 (wRjQmgKElTHbBf5J) | n8n credentials_entity | Never | ∞ | Shawn | No |
| Postgres account (yK1VVsSN3tn0baVm) | n8n credentials_entity | Never (self-managed) | ∞ | Shawn | No |
| Redis account (F6aCGUnktFFSwjS8) | n8n credentials_entity | Never | ∞ | Shawn | No |
| Tavily account (M6lh2vbM59NsCJ0A) | n8n credentials_entity | Never | ∞ | Shawn | No |

## GitHub Actions Secrets

| Secret Name | Location | Expiry | Days Remaining | Rotation Owner | Auto-Monitored |
|---|---|---|---|---|---|
| TS_OAUTH_CLIENT_ID | GitHub Actions secrets | Depends on Tailscale admin console config | ? | Shawn | Yes (inventory) |
| TS_OAUTH_SECRET | GitHub Actions secrets | Depends on Tailscale admin console config | ? | Shawn | Yes (inventory) |
| PROD_SSH_PRIVATE_KEY | GitHub Actions secrets | Never (SSH keys do not expire) | ∞ | Shawn | No |
| PROD_SSH_HOST | GitHub Actions secrets | N/A (not a secret with expiry) | ∞ | Shawn | No |
| PROD_SSH_USER | GitHub Actions secrets | N/A (not a secret with expiry) | ∞ | Shawn | No |

## GitHub PATs

| Secret Name | Location | Expiry | Days Remaining | Rotation Owner | Auto-Monitored |
|---|---|---|---|---|---|
| GDA GitHub Bridge PAT | n8n credential + GitHub | Unknown — classic PATs cannot be queried for expiry via API. Check https://github.com/settings/tokens | ? | Shawn | Yes (inventory) |
| GitHub Gist PAT | n8n credential + GitHub | Unknown — same limitation. Check https://github.com/settings/tokens | ? | Shawn | Yes (inventory) |

> **ACTION REQUIRED:** Shawn should verify GitHub PAT and Tailscale OAuth expiry dates at:
> - https://github.com/settings/tokens (for PATs)
> - https://login.tailscale.com/admin/settings/oauth (for Tailscale OAuth)
> Then update the `expiry_date` fields in this file and in the Sentinel probe inventory section.

## Monitoring Summary

- **Auto-monitored (DB query):** n8n API keys — the `secret_expiry_check` probe decodes JWT `exp` claims directly
- **Auto-monitored (inventory):** All secrets listed above with `Yes (inventory)` — the probe parses this file for `expiry_date:` annotations
- **Not monitored:** Database passwords, SSH keys, encryption keys — these do not expire
- **Manual check required:** GitHub PATs, Tailscale OAuth — expiry cannot be queried programmatically

## Inventory Format for Sentinel Probe

The `secret_expiry_check` probe reads entries from this file using `expiry_date:` annotations.
To add a manually-tracked expiry, append a comment line after the table row:

```text
&lt;!-- expiry_date: SECRET_NAME 2026-12-31 --&gt;
```

### Active Expiry Annotations

<!-- expiry_date: DEVIN_ROTATED_API_KEY 2026-06-09 -->
<!-- expiry_date: GDA_GITHUB_BRIDGE_PAT unknown -->
<!-- expiry_date: GITHUB_GIST_PAT unknown -->
<!-- expiry_date: TS_OAUTH_CLIENT unknown -->
