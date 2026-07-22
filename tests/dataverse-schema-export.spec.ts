import { test, expect, request, type APIRequestContext, type Request } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const APP_URL =
  'https://apps.powerapps.com/play/e/5ae6e1b2-1834-e538-87c8-7bea27dfc2db/a/f6aa60b5-4c74-48f6-87af-9623b4417105?tenantId=18323149-cc4d-4bff-809d-3eda6caec73a';
const DATAVERSE_URL = 'https://dev-itt-apps.crm8.dynamics.com';
const OUTPUT_PATH = path.join(__dirname, '..', 'specs', 'dataverse-schema.md');

type AttributeRow = {
  displayName: string;
  logicalName: string;
  attributeType: string;
  required: string;
};

function displayLabel(entity: {
  DisplayName?: { UserLocalizedLabel?: { Label?: string } };
}): string {
  return entity.DisplayName?.UserLocalizedLabel?.Label ?? '(no display name)';
}

function requiredLabel(entity: {
  RequiredLevel?: { Value?: string } | string;
}): string {
  if (typeof entity.RequiredLevel === 'string') return entity.RequiredLevel;
  return entity.RequiredLevel?.Value ?? '(unknown)';
}

async function fetchAttributes(
  api: APIRequestContext,
  token: string,
  entityLogicalName: string,
  extraFilter?: string
): Promise<AttributeRow[]> {
  const select = encodeURIComponent('LogicalName,DisplayName,AttributeType,RequiredLevel');
  let url =
    `${DATAVERSE_URL}/api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')` +
    `/Attributes?$select=${select}`;
  if (extraFilter) {
    url += `&$filter=${encodeURIComponent(extraFilter)}`;
  }

  const rows: AttributeRow[] = [];
  let nextUrl: string | undefined = url;

  while (nextUrl) {
    const response = await api.get(nextUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Accept: 'application/json',
        Prefer: 'odata.include-annotations="*"',
      },
    });

    if (!response.ok()) {
      throw new Error(
        `Dataverse error [${response.status()}] ${entityLogicalName}: ${(await response.text()).slice(0, 500)}`
      );
    }

    const data = await response.json();
    for (const attr of data.value ?? []) {
      // Client-side Virtual filter as fallback if $filter is rejected on metadata
      if (extraFilter?.includes("AttributeType ne 'Virtual'") && attr.AttributeType === 'Virtual') {
        continue;
      }
      rows.push({
        displayName: displayLabel(attr),
        logicalName: attr.LogicalName ?? '',
        attributeType: attr.AttributeType ?? '(unknown)',
        required: requiredLabel(attr),
      });
    }
    nextUrl = data['@odata.nextLink'];
  }

  return rows.sort((a, b) => a.logicalName.localeCompare(b.logicalName));
}

function tableMarkdown(rows: AttributeRow[]): string {
  const lines = [
    '| Display Name | Logical Name | Type | Required |',
    '|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.displayName.replace(/\|/g, '\\|')} | \`${r.logicalName}\` | ${r.attributeType} | ${r.required} |`
    ),
  ];
  return lines.join('\n');
}

test.describe('Dataverse Schema Export', () => {
  let dataverseToken = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();

    const tokenPromise = new Promise<string>((resolve) => {
      const onRequest = (req: Request) => {
        const authHeader = req.headers()['authorization'];
        if (req.url().includes('crm8.dynamics.com') && authHeader?.startsWith('Bearer ')) {
          page.off('request', onRequest);
          resolve(authHeader.replace('Bearer ', ''));
        }
      };
      page.on('request', onRequest);
      setTimeout(() => resolve(''), 30000);
    });

    await page.goto(APP_URL);
    dataverseToken = await tokenPromise;

    const appFrame = page.frameLocator('iframe[name="fullscreen-app-host"]');
    await expect(appFrame.getByText('Dashboard', { exact: true }).first()).toBeVisible({
      timeout: 30000,
    });
    await page.close();

    console.log('Token captured:', dataverseToken ? 'YES' : 'NO');
  });

  test('Export project, productservices, and lineitem attribute schemas', async () => {
    expect(dataverseToken).toBeTruthy();
    test.setTimeout(120000);

    const api = await request.newContext();

    // 1. dia_project — exclude Virtual (try server filter; fall back client-side)
    let projectAttrs: AttributeRow[];
    try {
      projectAttrs = await fetchAttributes(
        api,
        dataverseToken,
        'dia_project',
        "AttributeType ne 'Virtual'"
      );
    } catch {
      console.log('Server-side Virtual filter failed; filtering client-side.');
      projectAttrs = await fetchAttributes(api, dataverseToken, 'dia_project');
      projectAttrs = projectAttrs.filter((r) => r.attributeType !== 'Virtual');
    }

    // 2. dia_productservices
    const productAttrs = await fetchAttributes(api, dataverseToken, 'dia_productservices');

    // 3. dia_invoicelineitemdetails
    const lineItemAttrs = await fetchAttributes(
      api,
      dataverseToken,
      'dia_invoicelineitemdetails'
    );

    const md = [
      '# Dataverse Schema',
      '',
      `Generated from DEV Dataverse (\`${DATAVERSE_URL}\`).`,
      '',
      '## 1. `dia_project` (Project)',
      '',
      'Filter: `AttributeType ne \'Virtual\'`',
      '',
      tableMarkdown(projectAttrs),
      '',
      `**${projectAttrs.length} columns**`,
      '',
      '## 2. `dia_productservices` (Product/ Services)',
      '',
      tableMarkdown(productAttrs),
      '',
      `**${productAttrs.length} columns**`,
      '',
      '## 3. `dia_invoicelineitemdetails` (Billing Info)',
      '',
      tableMarkdown(lineItemAttrs),
      '',
      `**${lineItemAttrs.length} columns**`,
      '',
    ].join('\n');

    fs.writeFileSync(OUTPUT_PATH, md, 'utf8');
    console.log(`\nWrote ${OUTPUT_PATH}`);
    console.log(`  dia_project: ${projectAttrs.length} columns`);
    console.log(`  dia_productservices: ${productAttrs.length} columns`);
    console.log(`  dia_invoicelineitemdetails: ${lineItemAttrs.length} columns`);

    // Echo tables to console for the run output
    console.log('\n' + md);

    expect(projectAttrs.length).toBeGreaterThan(0);
    expect(productAttrs.length).toBeGreaterThan(0);
    expect(lineItemAttrs.length).toBeGreaterThan(0);
  });
});
