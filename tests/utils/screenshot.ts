import { expect, type Page, type Locator, type TestInfo } from '@playwright/test';

/**
 * Reusable screenshot marking utilities for the Invoice Canvas app.
 *
 * The goal: capture a FULL-CONTEXT screenshot (the whole visible app) with the element under
 * test highlighted directly ON the image (a coloured box + caption), instead of a separate
 * cropped picture of just that element. Use these in any spec so every test produces
 * self-explanatory, marked evidence in the HTML report.
 *
 * Notes for the Canvas app:
 * - The target Locator must live inside the app frame
 *   (`page.frameLocator('iframe[name="fullscreen-app-host"]')...`). The overlay is injected
 *   INTO that iframe document via `locator.evaluate`, so it lines up with the element.
 * - We take `page.screenshot()` (the whole page, including the iframe) so the mark is shown
 *   in context — never `locator.screenshot()`, which crops to the element.
 */

const OVERLAY_ID = '__pw-mark-overlay';

export interface MarkOptions {
  /** Extra pixels drawn around the element box. */
  padding?: number;
  /** Accent colour for the box + caption. */
  color?: string;
  /** Dim the rest of the screen so the marked area pops (spotlight effect). */
  dim?: boolean;
  /** Capture the full scrollable page instead of just the viewport. */
  fullPage?: boolean;
}

function fileNameFor(label: string): string {
  return `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`;
}

/** Waits two animation frames inside the frame document so the overlay is painted. */
async function settle(target: Locator): Promise<void> {
  await target.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

/**
 * Highlights `target` (box + caption) and attaches a full-context screenshot to the report.
 * Returns the saved file path.
 */
export async function markAndShot(
  page: Page,
  target: Locator,
  label: string,
  testInfo: TestInfo,
  options: MarkOptions = {},
): Promise<string> {
  const { padding = 6, color = '#ff3d00', dim = true, fullPage = false } = options;
  const element = target.first();

  // Make sure the scenario is actually loaded and in view before we capture it.
  await expect(element).toBeVisible({ timeout: 20000 });
  await element.scrollIntoViewIfNeeded();

  await element.evaluate(
    (el: HTMLElement, opts: { id: string; label: string; padding: number; color: string; dim: boolean }) => {
      document.getElementById(opts.id)?.remove();

      const rect = el.getBoundingClientRect();
      const overlay = document.createElement('div');
      overlay.id = opts.id;
      overlay.style.position = 'fixed';
      overlay.style.left = `${rect.left - opts.padding}px`;
      overlay.style.top = `${rect.top - opts.padding}px`;
      overlay.style.width = `${rect.width + opts.padding * 2}px`;
      overlay.style.height = `${rect.height + opts.padding * 2}px`;
      overlay.style.border = `3px solid ${opts.color}`;
      overlay.style.borderRadius = '6px';
      overlay.style.background = 'transparent';
      overlay.style.boxShadow = opts.dim ? '0 0 0 100vmax rgba(0, 0, 0, 0.45)' : 'none';
      overlay.style.zIndex = '2147483647';
      overlay.style.pointerEvents = 'none';

      const badge = document.createElement('div');
      badge.textContent = opts.label;
      badge.style.position = 'absolute';
      badge.style.left = '-3px';
      // Place the caption above the box, or below if the box is near the top edge.
      const placeAbove = rect.top - opts.padding > 32;
      if (placeAbove) {
        badge.style.top = '-30px';
      } else {
        badge.style.bottom = '-30px';
      }
      badge.style.background = opts.color;
      badge.style.color = '#ffffff';
      badge.style.padding = '4px 10px';
      badge.style.font = '600 13px/1.2 "Segoe UI", Arial, sans-serif';
      badge.style.borderRadius = '4px';
      badge.style.whiteSpace = 'nowrap';
      badge.style.boxShadow = '0 1px 4px rgba(0, 0, 0, 0.4)';
      overlay.appendChild(badge);

      document.body.appendChild(overlay);
    },
    { id: OVERLAY_ID, label, padding, color, dim },
  );

  await settle(element);

  const path = testInfo.outputPath(fileNameFor(label));
  await page.screenshot({ path, fullPage });
  await testInfo.attach(label, { path, contentType: 'image/png' });

  await element.evaluate((_el, id: string) => document.getElementById(id)?.remove(), OVERLAY_ID);

  return path;
}

/**
 * Attaches a plain full-context screenshot (no mark) to the report. Use for overview shots.
 * Returns the saved file path.
 */
export async function shot(
  page: Page,
  label: string,
  testInfo: TestInfo,
  options: { fullPage?: boolean } = {},
): Promise<string> {
  const path = testInfo.outputPath(fileNameFor(label));
  await page.screenshot({ path, fullPage: options.fullPage ?? false });
  await testInfo.attach(label, { path, contentType: 'image/png' });
  return path;
}
