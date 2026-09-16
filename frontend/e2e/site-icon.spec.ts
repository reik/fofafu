import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Covers fofafu_vault/features/site-icon.md acceptance criteria:
 *
 *  AC1  Browser tab shows a fofafu icon on every page (not the browser's
 *       blank default).
 *  AC2  Icon is provided at resolutions covering standard favicon + Apple
 *       touch icon + Android/PWA home-screen use.
 *
 * Deliberately NOT covered here (see ### E2E coverage in the feature file
 * for why):
 *  AC3  "Icon reflects the fofafu brand ... not a generic placeholder" is a
 *       pixel-level/visual-design judgment call (does the icon look right,
 *       is it the right color) — ui-designer/a11y-auditor visual-review
 *       territory, not something a DOM assertion can meaningfully verify.
 *
 * IMPLEMENTATION NOTE: Playwright has no access to actual browser-chrome or
 * OS-level rendering (the tab bar, a phone's home-screen icon grid) —
 * page.screenshot() only captures page content, never chrome. So AC1 can't
 * be verified as "the pixel in the tab looks right"; the best a runtime
 * test can do is prove the contract the browser/OS reads from: the <link>
 * tags exist in the served document with the expected rel, and each one's
 * href is a real, fetchable, image-typed asset (not a 404, not an empty
 * href, not a leftover placeholder).
 *
 * The <link> tags live in the static index.html shell — not rendered by
 * React, not route-dependent — so a single page load is representative of
 * "every page" for AC1; there's no per-route branching to cover. Android/PWA
 * home-screen use (part of AC2) is deliberately not asserted via a separate
 * manifest-driven <link> here: a full manifest.json is explicitly out of
 * scope for this feature (see ## Out of scope in the feature file), and
 * without one, Chrome's Android "Add to Home Screen" falls back to the same
 * favicon <link> already checked below — there's no distinct contract to
 * assert.
 *
 * Href is read from the live DOM rather than hardcoded (e.g. "/favicon.svg")
 * so this spec doesn't couple to frontend-dev's exact filename/format
 * choice — it stays correct regardless of whether the icon ships as SVG,
 * PNG, or ICO.
 */

async function assertReachableImageAsset(
  request: APIRequestContext,
  href: string,
  label: string,
): Promise<void> {
  if (href.startsWith('data:')) {
    // Inlined asset — nothing to fetch over the network; validate the data
    // URI itself declares an image MIME type.
    expect(href, `${label} data URI should declare an image MIME type`).toMatch(/^data:image\//);
    return;
  }

  const res = await request.get(href);
  expect(res.ok(), `${label} asset (${href}) should be reachable`).toBe(true);
  expect(res.headers()['content-type'] ?? '', `${label} asset should be served as an image`).toMatch(
    /^image\//,
  );
}

test.describe('site icon', () => {
  test('favicon <link> is present and points at a real, reachable image', async ({ page, request }) => {
    await page.goto('/');

    const favicon = page.locator('link[rel="icon"]').first();
    await expect(favicon).toHaveCount(1);

    const href = await favicon.getAttribute('href');
    expect(href, 'favicon <link> must have a non-empty href').toBeTruthy();

    await assertReachableImageAsset(request, href!, 'favicon');
  });

  test('apple-touch-icon <link> is present and points at a real, reachable image', async ({
    page,
    request,
  }) => {
    await page.goto('/');

    const appleIcon = page.locator('link[rel="apple-touch-icon"]');
    await expect(appleIcon).toHaveCount(1);

    const href = await appleIcon.getAttribute('href');
    expect(href, 'apple-touch-icon <link> must have a non-empty href').toBeTruthy();

    await assertReachableImageAsset(request, href!, 'apple-touch-icon');
  });
});
