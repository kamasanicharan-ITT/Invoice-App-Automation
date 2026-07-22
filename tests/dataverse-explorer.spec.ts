import { test, expect, request, type Request } from '@playwright/test';

const APP_URL =
  'https://apps.powerapps.com/play/e/5ae6e1b2-1834-e538-87c8-7bea27dfc2db/a/f6aa60b5-4c74-48f6-87af-9623b4417105?tenantId=18323149-cc4d-4bff-809d-3eda6caec73a';
const DATAVERSE_URL = 'https://dev-itt-apps.crm8.dynamics.com';

type DiaTable = {
  displayName: string;
  logicalName: string;
  entitySetName: string;
};

/**
 * Captures the Bearer token the Canvas app uses for Dataverse, then lists every
 * table whose LogicalName starts with "dia_" (display name, logical name, EntitySetName).
 */
test.describe('Dataverse Explorer', () => {
  let dataverseToken = '';

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();

    // Capture the Bearer token the Canvas app uses when calling Dataverse
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

  test('List all dia_ tables', async () => {
    expect(dataverseToken, 'Bearer token must be captured from Canvas traffic').toBeTruthy();

    const apiContext = await request.newContext();
    // Metadata EntityDefinitions does not support startswith(); filter client-side.
    const select = encodeURIComponent('LogicalName,DisplayName,EntitySetName');
    const url = `${DATAVERSE_URL}/api/data/v9.2/EntityDefinitions?$select=${select}`;

    const headers = {
      Authorization: `Bearer ${dataverseToken}`,
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Accept: 'application/json',
      Prefer: 'odata.include-annotations="*"',
    };

    type EntityDef = {
      LogicalName?: string;
      EntitySetName?: string;
      DisplayName?: { UserLocalizedLabel?: { Label?: string } };
    };

    const allEntities: EntityDef[] = [];
    let nextUrl: string | undefined = url;

    while (nextUrl) {
      const response = await apiContext.get(nextUrl, { headers });
      if (!response.ok()) {
        throw new Error(
          `Dataverse error [${response.status()}]: ${(await response.text()).slice(0, 500)}`
        );
      }
      const data = await response.json();
      allEntities.push(...(data.value ?? []));
      nextUrl = data['@odata.nextLink'];
    }

    const tables: DiaTable[] = allEntities
      .filter((entity) => (entity.LogicalName ?? '').startsWith('dia_'))
      .map((entity) => ({
        displayName: entity.DisplayName?.UserLocalizedLabel?.Label ?? '(no display name)',
        logicalName: entity.LogicalName ?? '',
        entitySetName: entity.EntitySetName ?? '',
      }))
      .sort((a, b) => a.logicalName.localeCompare(b.logicalName));

    console.log(`\nFound ${tables.length} table(s) with LogicalName starting with "dia_":\n`);
    console.log(
      'Display Name'.padEnd(40) +
        'Logical Name'.padEnd(40) +
        'EntitySetName'
    );
    console.log('-'.repeat(120));

    for (const table of tables) {
      console.log(
        table.displayName.padEnd(40) +
          table.logicalName.padEnd(40) +
          table.entitySetName
      );
    }

    console.log('\n--- JSON ---');
    console.log(JSON.stringify(tables, null, 2));

    expect(tables.length).toBeGreaterThan(0);
  });
});
