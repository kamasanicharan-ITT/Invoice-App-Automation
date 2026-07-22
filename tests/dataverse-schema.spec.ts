import { test, expect, request, type APIRequestContext, type Request } from '@playwright/test';

const APP_URL =
  'https://apps.powerapps.com/play/e/5ae6e1b2-1834-e538-87c8-7bea27dfc2db/a/f6aa60b5-4c74-48f6-87af-9623b4417105?tenantId=18323149-cc4d-4bff-809d-3eda6caec73a';
const DATAVERSE_URL = 'https://dev-itt-apps.crm8.dynamics.com';

type TableInfo = {
  displayName: string;
  logicalName: string;
  logicalCollectionName: string;
  entitySetName: string;
};

type ColumnInfo = {
  logicalName: string;
  displayName: string;
  dataType: string;
  targets?: string[];
};

function displayLabel(entity: {
  DisplayName?: { UserLocalizedLabel?: { Label?: string } };
}): string {
  return entity.DisplayName?.UserLocalizedLabel?.Label ?? '(no display name)';
}

function attributeType(attr: {
  AttributeType?: string;
  AttributeTypeName?: { Value?: string };
}): string {
  return attr.AttributeTypeName?.Value ?? attr.AttributeType ?? '(unknown)';
}

async function dataverseGet(
  api: APIRequestContext,
  token: string,
  pathAndQuery: string
): Promise<unknown> {
  const url = pathAndQuery.startsWith('http')
    ? pathAndQuery
    : `${DATAVERSE_URL}/api/data/v9.2/${pathAndQuery}`;

  const response = await api.get(url, {
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
      `Dataverse error [${response.status()}] ${url}: ${(await response.text()).slice(0, 600)}`
    );
  }

  return response.json();
}

async function fetchAllPages<T>(
  api: APIRequestContext,
  token: string,
  pathAndQuery: string
): Promise<T[]> {
  const items: T[] = [];
  let nextUrl: string | undefined = pathAndQuery;

  while (nextUrl) {
    const data = (await dataverseGet(api, token, nextUrl)) as {
      value?: T[];
      '@odata.nextLink'?: string;
    };
    items.push(...(data.value ?? []));
    nextUrl = data['@odata.nextLink'];
  }

  return items;
}

async function getTableColumns(
  api: APIRequestContext,
  token: string,
  logicalName: string
): Promise<ColumnInfo[]> {
  // Base AttributeMetadata has no Targets — fetch that separately via Lookup cast
  const attrs = await fetchAllPages<{
    LogicalName?: string;
    AttributeType?: string;
    AttributeTypeName?: { Value?: string };
    DisplayName?: { UserLocalizedLabel?: { Label?: string } };
  }>(
    api,
    token,
    `EntityDefinitions(LogicalName='${logicalName}')/Attributes` +
      `?$select=LogicalName,DisplayName,AttributeType,AttributeTypeName`
  );

  const lookups = await fetchAllPages<{
    LogicalName?: string;
    Targets?: string[];
  }>(
    api,
    token,
    `EntityDefinitions(LogicalName='${logicalName}')/Attributes` +
      `/Microsoft.Dynamics.CRM.LookupAttributeMetadata?$select=LogicalName,Targets`
  );

  const targetsByName = new Map(
    lookups.map((l) => [l.LogicalName ?? '', l.Targets ?? []] as const)
  );

  return attrs
    .map((attr) => {
      const name = attr.LogicalName ?? '';
      const targets = targetsByName.get(name);
      return {
        logicalName: name,
        displayName: displayLabel(attr),
        dataType: attributeType(attr),
        targets: targets?.length ? targets : undefined,
      };
    })
    .sort((a, b) => a.logicalName.localeCompare(b.logicalName));
}

function printColumns(title: string, columns: ColumnInfo[]): void {
  console.log(`\n=== ${title} (${columns.length} columns) ===\n`);
  console.log(
    'Logical Name'.padEnd(45) + 'Display Name'.padEnd(40) + 'Data Type'.padEnd(22) + 'Targets'
  );
  console.log('-'.repeat(140));
  for (const col of columns) {
    console.log(
      col.logicalName.padEnd(45) +
        col.displayName.padEnd(40) +
        col.dataType.padEnd(22) +
        (col.targets?.join(', ') ?? '')
    );
  }
}

function highlight(
  label: string,
  columns: ColumnInfo[],
  predicate: (c: ColumnInfo) => boolean
): void {
  const matches = columns.filter(predicate);
  console.log(`\n--- ${label} ---`);
  if (matches.length === 0) {
    console.log('(none found)');
    return;
  }
  for (const col of matches) {
    console.log(
      `  ${col.logicalName}  |  ${col.displayName}  |  ${col.dataType}` +
        (col.targets ? `  |  → ${col.targets.join(', ')}` : '')
    );
  }
}

/**
 * Schema discovery: Accounts EntitySetName, contract tables, and key columns on
 * dia_project / dia_productservices.
 */
test.describe('Dataverse Schema', () => {
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

  test('Discover Accounts, contracts, project & product columns', async () => {
    expect(dataverseToken, 'Bearer token must be captured from Canvas traffic').toBeTruthy();

    const api = await request.newContext();
    test.setTimeout(120000);

    // ── 1 & 2: Accounts + any table with "contract" in the logical name ──────
    // Preferred query (as requested). Metadata often rejects contains(); fall back
    // to fetching EntityDefinitions and filtering client-side if needed.
    const select =
      '$select=LogicalName,LogicalCollectionName,EntitySetName,DisplayName';
    const preferredFilter =
      "$filter=contains(LogicalName,'contract') or LogicalName eq 'account'";
    const preferredUrl = `EntityDefinitions?${preferredFilter}&${select}`;

    type EntityDef = {
      LogicalName?: string;
      LogicalCollectionName?: string;
      EntitySetName?: string;
      DisplayName?: { UserLocalizedLabel?: { Label?: string } };
    };

    let matchingTables: TableInfo[] = [];

    try {
      console.log(`\nTrying preferred query:\n  GET .../EntityDefinitions?${preferredFilter}&${select}`);
      const data = (await dataverseGet(api, dataverseToken, preferredUrl)) as {
        value?: EntityDef[];
      };
      matchingTables = (data.value ?? []).map((e) => ({
        displayName: displayLabel(e),
        logicalName: e.LogicalName ?? '',
        logicalCollectionName: e.LogicalCollectionName ?? '',
        entitySetName: e.EntitySetName ?? '',
      }));
      console.log('Preferred query succeeded.');
    } catch (err) {
      console.log(
        `Preferred query failed (expected for metadata contains()): ${(err as Error).message.slice(0, 200)}`
      );
      console.log('Falling back to client-side filter on all EntityDefinitions...');

      const all = await fetchAllPages<EntityDef>(api, dataverseToken, `EntityDefinitions?${select}`);
      matchingTables = all
        .filter((e) => {
          const name = (e.LogicalName ?? '').toLowerCase();
          return name === 'account' || name.includes('contract');
        })
        .map((e) => ({
          displayName: displayLabel(e),
          logicalName: e.LogicalName ?? '',
          logicalCollectionName: e.LogicalCollectionName ?? '',
          entitySetName: e.EntitySetName ?? '',
        }));
    }

    matchingTables.sort((a, b) => a.logicalName.localeCompare(b.logicalName));

    console.log(`\n=== Accounts + contract tables (${matchingTables.length}) ===\n`);
    console.log(
      'Display Name'.padEnd(40) +
        'Logical Name'.padEnd(35) +
        'LogicalCollectionName'.padEnd(35) +
        'EntitySetName'
    );
    console.log('-'.repeat(140));
    for (const t of matchingTables) {
      console.log(
        t.displayName.padEnd(40) +
          t.logicalName.padEnd(35) +
          t.logicalCollectionName.padEnd(35) +
          t.entitySetName
      );
    }

    const account = matchingTables.find((t) => t.logicalName === 'account');
    console.log('\n--- Accounts (Partners) ---');
    if (account) {
      console.log(`  Display Name:          ${account.displayName}`);
      console.log(`  Logical Name:          ${account.logicalName}`);
      console.log(`  LogicalCollectionName: ${account.logicalCollectionName}`);
      console.log(`  EntitySetName:         ${account.entitySetName}`);
    } else {
      console.log('  (account table not found)');
    }

    const contracts = matchingTables.filter((t) =>
      t.logicalName.toLowerCase().includes('contract')
    );
    console.log(`\n--- Tables with "contract" in logical name (${contracts.length}) ---`);
    for (const t of contracts) {
      console.log(
        `  ${t.displayName}  |  ${t.logicalName}  |  EntitySetName=${t.entitySetName}`
      );
    }

    // ── 3: dia_project columns (logical name is dia_project, not dia_projects) ─
    // EntitySetName is dia_projects; LogicalName is dia_project.
    const projectColumns = await getTableColumns(api, dataverseToken, 'dia_project');
    printColumns('dia_project columns', projectColumns);

    highlight('Partner / Account link', projectColumns, (c) => {
      const n = c.logicalName.toLowerCase();
      const d = c.displayName.toLowerCase();
      return (
        n.includes('account') ||
        n.includes('partner') ||
        d.includes('account') ||
        d.includes('partner') ||
        (c.targets?.some((t) => t === 'account' || t.includes('partner')) ?? false)
      );
    });

    highlight('Region column', projectColumns, (c) => {
      const n = c.logicalName.toLowerCase();
      const d = c.displayName.toLowerCase();
      return n.includes('region') || d.includes('region');
    });

    highlight('Project Name column', projectColumns, (c) => {
      const n = c.logicalName.toLowerCase();
      const d = c.displayName.toLowerCase();
      return (
        n.includes('name') ||
        d === 'name' ||
        d.includes('project name') ||
        n === 'dia_project' ||
        n.endsWith('name')
      );
    });

    highlight('Contract-related columns', projectColumns, (c) => {
      const n = c.logicalName.toLowerCase();
      const d = c.displayName.toLowerCase();
      return n.includes('contract') || d.includes('contract');
    });

    // ── 4: dia_productservices columns ───────────────────────────────────────
    const productColumns = await getTableColumns(api, dataverseToken, 'dia_productservices');
    printColumns('dia_productservices columns', productColumns);

    highlight('Product name', productColumns, (c) => {
      const n = c.logicalName.toLowerCase();
      const d = c.displayName.toLowerCase();
      return (
        n.includes('name') ||
        d.includes('name') ||
        n.includes('product') ||
        d.includes('product') ||
        d.includes('service')
      );
    });

    highlight('Rate / price', productColumns, (c) => {
      const n = c.logicalName.toLowerCase();
      const d = c.displayName.toLowerCase();
      return (
        n.includes('rate') ||
        n.includes('price') ||
        n.includes('amount') ||
        n.includes('cost') ||
        d.includes('rate') ||
        d.includes('price') ||
        d.includes('amount') ||
        d.includes('cost')
      );
    });

    highlight('Fixed vs editable rate (flags / choices)', productColumns, (c) => {
      const n = c.logicalName.toLowerCase();
      const d = c.displayName.toLowerCase();
      return (
        n.includes('fixed') ||
        n.includes('editable') ||
        n.includes('lock') ||
        n.includes('type') ||
        d.includes('fixed') ||
        d.includes('editable') ||
        d.includes('lock') ||
        d.includes('type') ||
        d.includes('rate type') ||
        d.includes('pricing')
      );
    });

    // Resolve picklist labels for Product/Service Type (fixed vs editable candidate)
    try {
      const picklistMeta = (await dataverseGet(
        api,
        dataverseToken,
        `EntityDefinitions(LogicalName='dia_productservices')` +
          `/Attributes(LogicalName='ittdev_productservicetype')` +
          `/Microsoft.Dynamics.CRM.PicklistAttributeMetadata` +
          `?$select=LogicalName&$expand=OptionSet($select=Options)`
      )) as {
        OptionSet?: {
          Options?: Array<{
            Value?: number;
            Label?: { UserLocalizedLabel?: { Label?: string } };
          }>;
        };
      };
      const options = picklistMeta.OptionSet?.Options ?? [];
      console.log('\n--- ittdev_productservicetype option values ---');
      for (const opt of options) {
        console.log(
          `  ${opt.Value}: ${opt.Label?.UserLocalizedLabel?.Label ?? '(no label)'}`
        );
      }
    } catch (err) {
      console.log(
        `\nCould not load ittdev_productservicetype options: ${(err as Error).message.slice(0, 300)}`
      );
    }

    console.log('\n--- JSON: matching tables ---');
    console.log(JSON.stringify(matchingTables, null, 2));

    expect(account?.entitySetName).toBeTruthy();
    expect(projectColumns.length).toBeGreaterThan(0);
    expect(productColumns.length).toBeGreaterThan(0);
  });
});
