import { test, expect } from '@playwright/test';
import { APP_URL } from '../config/env';

test('lands on invoice app already logged in', async ({ page }) => {
  await page.goto(APP_URL);
  await expect(page.getByText('Invoice Application')).toBeVisible({ timeout: 20000 });
});
