import { expect, type Page, type Locator, type TestInfo } from '@playwright/test';

/**
 * Reusable screenshot marking utilities for the Invoice Canvas app.
 *
 * The goal: capture a FULL-CONTEXT screenshot (the whole visible app) with the element(s)
 * under test highlighted directly ON the image (a coloured box + caption), instead of a
 * separate cropped picture of just that element. Use these in any spec so every test produces
 * self-explanatory, marked evidence in the HTML report.
 *
 * Notes for the Canvas app:
 * - Targets must live inside the app frame
 *   (`page.frameLocator('iframe[name="fullscreen-app-host"]')...`). The overlay is injected
 *   INTO that iframe document via `locator.evaluate`, so it lines up with the element(s).
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

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
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

async function injectOverlay(
  host: Locator,
  rect: Rect,
  label: string,
  opts: { id: string; padding: number; color: string; dim: boolean },
): Promise<void> {
  await host.evaluate(
    (el: HTMLElement, args: {
      id: string;
      label: string;
      padding: number;
      color: string;
      dim: boolean;
      left: number;
      top: number;
      right: number;
      bottom: number;
    }) => {
      document.getElementById(args.id)?.remove();

      const overlay = document.createElement('div');
      overlay.id = args.id;
      overlay.style.position = 'fixed';
      overlay.style.left = `${args.left - args.padding}px`;
      overlay.style.top = `${args.top - args.padding}px`;
      overlay.style.width = `${args.right - args.left + args.padding * 2}px`;
      overlay.style.height = `${args.bottom - args.top + args.padding * 2}px`;
      overlay.style.border = `3px solid ${args.color}`;
      overlay.style.borderRadius = '6px';
      overlay.style.background = 'transparent';
      overlay.style.boxShadow = args.dim ? '0 0 0 100vmax rgba(0, 0, 0, 0.45)' : 'none';
      overlay.style.zIndex = '2147483647';
      overlay.style.pointerEvents = 'none';

      const badge = document.createElement('div');
      badge.textContent = args.label;
      badge.style.position = 'absolute';
      badge.style.left = '-3px';
      // Larger caption needs more clearance above/below the box.
      const placeAbove = args.top - args.padding > 44;
      if (placeAbove) {
        badge.style.top = '-42px';
      } else {
        badge.style.bottom = '-42px';
      }
      badge.style.background = args.color;
      badge.style.color = '#ffffff';
      badge.style.padding = '8px 14px';
      badge.style.font = '700 20px/1.3 "Segoe UI", Arial, sans-serif';
      badge.style.letterSpacing = '0.2px';
      badge.style.borderRadius = '6px';
      badge.style.whiteSpace = 'nowrap';
      badge.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.45)';
      overlay.appendChild(badge);

      // Keep TypeScript happy — `el` proves we are inside the frame document.
      void el;
      document.body.appendChild(overlay);
    },
    {
      id: opts.id,
      label,
      padding: opts.padding,
      color: opts.color,
      dim: opts.dim,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    },
  );
}

async function removeOverlay(host: Locator): Promise<void> {
  await host.evaluate((_el, id: string) => document.getElementById(id)?.remove(), OVERLAY_ID);
}

async function rectOf(target: Locator): Promise<Rect> {
  return target.evaluate((el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  });
}

function unionRects(rects: Rect[]): Rect {
  return {
    left: Math.min(...rects.map((r) => r.left)),
    top: Math.min(...rects.map((r) => r.top)),
    right: Math.max(...rects.map((r) => r.right)),
    bottom: Math.max(...rects.map((r) => r.bottom)),
  };
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
  return markGroupAndShot(page, [target], label, testInfo, options);
}

/**
 * Highlights the union bounding box of multiple targets (one group mark + caption) and
 * attaches a full-context screenshot. Use for navigation bars, card strips, dropdowns,
 * and forms where a single label is too narrow.
 * Returns the saved file path.
 */
export async function markGroupAndShot(
  page: Page,
  targets: Locator[],
  label: string,
  testInfo: TestInfo,
  options: MarkOptions = {},
): Promise<string> {
  if (targets.length === 0) {
    throw new Error('markGroupAndShot requires at least one target locator');
  }

  const { padding = 6, color = '#ff3d00', dim = true, fullPage = false } = options;
  const elements = targets.map((t) => t.first());

  for (const element of elements) {
    await expect(element).toBeVisible({ timeout: 20000 });
  }

  // Bring the group into view: scroll the first and last anchors.
  await elements[0].scrollIntoViewIfNeeded();
  if (elements.length > 1) {
    await elements[elements.length - 1].scrollIntoViewIfNeeded();
    await elements[0].scrollIntoViewIfNeeded();
  }

  const rects = await Promise.all(elements.map((el) => rectOf(el)));
  const union = unionRects(rects);
  const host = elements[0];

  await injectOverlay(host, union, label, { id: OVERLAY_ID, padding, color, dim });
  await settle(host);

  const path = testInfo.outputPath(fileNameFor(label));
  await page.screenshot({ path, fullPage });
  await testInfo.attach(label, { path, contentType: 'image/png' });

  await removeOverlay(host);
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
