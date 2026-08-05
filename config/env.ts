/**
 * Multi-environment config for Invoice Canvas automation.
 *
 * Usage:
 *   ENV=dev|sit|qa|uat   (default: dev)
 *   Optional overrides: APP_URL, DATAVERSE_URL, TENANT_ID
 *
 * Auth (gitignored):
 *   Preferred: auth/<env>/admin.json  and  auth/<env>/pm.json
 *   DEV fallback: auth/admin.json / auth/pm.json (legacy flat layout)
 *
 * Personas:
 *   admin — your account (BDU + Security Roles admin)
 *   pm    — teammate account (Basic User 2.0, not admin)
 *
 * Production is forbidden.
 */
import fs from 'node:fs';
import path from 'node:path';

export type AppEnvName = 'dev' | 'sit' | 'qa' | 'uat';

export type EnvConfig = {
  name: AppEnvName;
  appUrl: string;
  dataverseUrl: string;
  tenantId: string;
  authAdmin: string;
  authPm: string;
};

const TENANT_ID_DEFAULT = '18323149-cc4d-4bff-809d-3eda6caec73a';

/** Known non-prod endpoints. Fill SIT/QA/UAT when URLs are available (or set env overrides). */
const ENV_DEFAULTS: Record<
  AppEnvName,
  { appUrl: string; dataverseUrl: string; tenantId: string }
> = {
  dev: {
    appUrl:
      'https://apps.powerapps.com/play/e/5ae6e1b2-1834-e538-87c8-7bea27dfc2db/a/f6aa60b5-4c74-48f6-87af-9623b4417105?tenantId=18323149-cc4d-4bff-809d-3eda6caec73a',
    dataverseUrl: 'https://dev-itt-apps.crm8.dynamics.com',
    tenantId: TENANT_ID_DEFAULT,
  },
  sit: {
    appUrl: '',
    dataverseUrl: '',
    tenantId: TENANT_ID_DEFAULT,
  },
  qa: {
    appUrl: '',
    dataverseUrl: '',
    tenantId: TENANT_ID_DEFAULT,
  },
  uat: {
    appUrl: '',
    dataverseUrl: '',
    tenantId: TENANT_ID_DEFAULT,
  },
};

function parseEnvName(raw: string | undefined): AppEnvName {
  const value = (raw ?? 'dev').trim().toLowerCase();
  if (value === 'prod' || value === 'production') {
    throw new Error(
      'ENV=prod is forbidden. Invoice automation must never run against Production.',
    );
  }
  if (value === 'dev' || value === 'sit' || value === 'qa' || value === 'uat') {
    return value;
  }
  throw new Error(
    `Unknown ENV="${raw}". Use one of: dev, sit, qa, uat (never prod).`,
  );
}

function resolveAuthPath(envName: AppEnvName, persona: 'admin' | 'pm'): string {
  const nested = path.join('auth', envName, `${persona}.json`);
  const flat = path.join('auth', `${persona}.json`);
  if (fs.existsSync(nested)) return nested;
  // DEV-only legacy layout so existing local sessions keep working.
  if (envName === 'dev' && fs.existsSync(flat)) return flat;
  return nested;
}

function resolveConfig(): EnvConfig {
  const name = parseEnvName(process.env.ENV);
  const defaults = ENV_DEFAULTS[name];

  const appUrl = (process.env.APP_URL ?? defaults.appUrl).trim();
  const dataverseUrl = (process.env.DATAVERSE_URL ?? defaults.dataverseUrl).trim();
  const tenantId = (process.env.TENANT_ID ?? defaults.tenantId).trim();

  if (!appUrl || !dataverseUrl) {
    throw new Error(
      [
        `ENV=${name} is missing appUrl and/or dataverseUrl.`,
        `Set them in config/env.ts for "${name}", or export APP_URL and DATAVERSE_URL.`,
        'Create seed partners/projects/contracts in that Dataverse before running Create Invoice tests.',
      ].join(' '),
    );
  }

  return {
    name,
    appUrl,
    dataverseUrl,
    tenantId,
    authAdmin: resolveAuthPath(name, 'admin'),
    authPm: resolveAuthPath(name, 'pm'),
  };
}

/** Resolved once at import time (Playwright config + specs share the same values). */
export const env: EnvConfig = resolveConfig();

export const APP_URL = env.appUrl;
export const DATAVERSE_URL = env.dataverseUrl;
export const TENANT_ID = env.tenantId;
