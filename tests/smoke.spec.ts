import { test, expect } from '@playwright/test';

test('lands on invoice app already logged in', async ({ page }) => {
  await page.goto('https://apps.powerapps.com/play/e/5ae6e1b2-1834-e538-87c8-7bea27dfc2db/a/f6aa60b5-4c74-48f6-87af-9623b4417105?tenantId=18323149-cc4d-4bff-809d-3eda6caec73a');
  await expect(page.getByText('Invoice Application')).toBeVisible({ timeout: 20000 });
});