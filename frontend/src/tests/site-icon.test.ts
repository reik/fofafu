/**
 * Static sweep for [[features/site-icon]].
 *
 * Verifies the contract between frontend/index.html's <link rel="icon">
 * tags and the actual files under frontend/public/: every href must
 * resolve to a real file (a typo'd href is a *silent* failure — the
 * browser just falls back to a blank tab, no console error), referenced
 * PNGs must be the exact pixel dimensions their use case implies (favicon
 * / Apple touch icon / Android-PWA home-screen), and the icon must carry
 * real brand color rather than a generic/placeholder mark.
 *
 * This is a source/asset-scan, not a rendered-DOM check — jsdom does not
 * fetch real <link> resources, so this is the closest scriptable proxy to
 * "does the browser actually receive a fofafu icon" available in a unit
 * test. Browser-level confirmation (actual favicon paint, home-screen
 * install) is out of this file's scope — see e2e coverage in the feature
 * spec's ### E2E coverage section.
 *
 * Written before frontend-dev's asset delivery lands, per the project's
 * TDD rule (see src/tests/brand-contrast.test.ts for precedent — same
 * source-scan pattern, written ahead of its corresponding migration).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const FRONTEND_ROOT = path.resolve(__dirname, '../..');
const INDEX_HTML_PATH = path.join(FRONTEND_ROOT, 'index.html');
const PUBLIC_DIR = path.join(FRONTEND_ROOT, 'public');

interface LinkTag {
  rel: string;
  href: string;
  type?: string | undefined;
  raw: string;
}

function parseLinkTags(html: string): LinkTag[] {
  const tags: LinkTag[] = [];
  const linkTagRegex = /<link\b[^>]*>/gi;
  const matches = html.match(linkTagRegex) ?? [];
  for (const raw of matches) {
    const relMatch = raw.match(/\brel=["']([^"']+)["']/i);
    if (!relMatch) continue;
    const hrefMatch = raw.match(/\bhref=["']([^"']+)["']/i);
    const typeMatch = raw.match(/\btype=["']([^"']+)["']/i);
    tags.push({
      rel: relMatch[1] ?? '',
      href: hrefMatch?.[1] ?? '',
      type: typeMatch?.[1],
      raw,
    });
  }
  return tags;
}

/** hrefs are root-relative ("/favicon.svg") because Vite serves
 * frontend/public/* at the site root, unchanged, in both `dev` and the
 * built `dist/` — see vite.config.ts (no custom `publicDir`). */
function resolvePublicPath(href: string): string {
  const withoutQuery = href.split(/[?#]/)[0] ?? href;
  const relative = withoutQuery.replace(/^\//, '');
  return path.join(PUBLIC_DIR, relative);
}

/**
 * Minimal PNG IHDR parser — width/height live at fixed byte offsets
 * (bytes 16-19 / 20-23, big-endian uint32) right after the 8-byte PNG
 * signature and the "IHDR" chunk header. Deliberately dependency-free
 * (no sharp/image-size) per engineering-standards's "no new dependency
 * without justification" — this is the one thing "the file exists" can't
 * tell us, and a handful of fixed byte offsets don't justify a package.
 */
function readPngDimensions(filePath: string): { width: number; height: number } {
  const buf = readFileSync(filePath);
  const isPng =
    buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (!isPng) {
    throw new Error(`${filePath} does not start with a valid PNG signature`);
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
  };
}

describe('site-icon — index.html <link rel="icon"> contract with frontend/public/', () => {
  let html: string;
  let linkTags: LinkTag[];

  beforeAll(() => {
    expect(existsSync(INDEX_HTML_PATH), `frontend/index.html not found at ${INDEX_HTML_PATH}`).toBe(
      true,
    );
    html = readFileSync(INDEX_HTML_PATH, 'utf-8');
    linkTags = parseLinkTags(html);
  });

  it('declares at least one <link rel="icon"> in <head>', () => {
    const iconLinks = linkTags.filter((t) => t.rel === 'icon');
    expect(
      iconLinks.length,
      'Expected index.html to declare one or more <link rel="icon"> tags — none found. ' +
        'Without this, every page falls back to the browser\'s blank default tab icon.',
    ).toBeGreaterThan(0);
  });

  it('declares an SVG icon (type="image/svg+xml") as the primary favicon', () => {
    const svgIcon = linkTags.find((t) => t.rel === 'icon' && t.type === 'image/svg+xml');
    expect(
      svgIcon,
      'Expected a <link rel="icon" type="image/svg+xml" href="..."> tag for the primary favicon.',
    ).toBeDefined();
  });

  it('declares a PNG fallback <link rel="icon"> for browsers without SVG favicon support', () => {
    const pngIcon = linkTags.find(
      (t) => t.rel === 'icon' && (t.type === 'image/png' || t.href.toLowerCase().endsWith('.png')),
    );
    expect(
      pngIcon,
      'Expected a <link rel="icon" type="image/png" href="..."> PNG fallback alongside the SVG favicon ' +
        '(Safari and older browsers do not support SVG favicons).',
    ).toBeDefined();
  });

  it('declares <link rel="apple-touch-icon"> for iOS home-screen bookmarking', () => {
    const appleIcon = linkTags.find((t) => t.rel === 'apple-touch-icon');
    expect(appleIcon, 'Expected a <link rel="apple-touch-icon" href="..."> tag.').toBeDefined();
  });

  it('every icon <link> href resolves to a real file under frontend/public/ (catches a typo\'d href)', () => {
    const relevant = linkTags.filter((t) => (t.rel === 'icon' || t.rel === 'apple-touch-icon') && t.href);
    expect(relevant.length, 'Expected at least one icon <link> with an href to check.').toBeGreaterThan(
      0,
    );

    const missing = relevant.filter((t) => !existsSync(resolvePublicPath(t.href)));
    const report = missing
      .map((t) => `  rel="${t.rel}" href="${t.href}" -> ${resolvePublicPath(t.href)} (not found)`)
      .join('\n');

    expect(
      missing.length,
      `Found ${missing.length} icon <link> href(s) in index.html pointing at files that don't exist ` +
        `under frontend/public/. This fails silently in a real browser (blank tab icon, no console ` +
        `error), so it will not be caught by typecheck or a passing build:\n${report}`,
    ).toBe(0);
  });

  it('apple-touch-icon PNG is exactly 180x180px', () => {
    const appleIcon = linkTags.find((t) => t.rel === 'apple-touch-icon');
    expect(appleIcon, 'apple-touch-icon <link> tag must exist first (see earlier test).').toBeDefined();
    const filePath = resolvePublicPath(appleIcon!.href);
    expect(existsSync(filePath), `${filePath} must exist`).toBe(true);

    const { width, height } = readPngDimensions(filePath);
    expect({ width, height }, 'apple-touch-icon must be 180x180 per Apple HIG home-screen spec').toEqual({
      width: 180,
      height: 180,
    });
  });

  it('frontend/public/icon-192.png exists and is exactly 192x192px (Android/PWA)', () => {
    const filePath = path.join(PUBLIC_DIR, 'icon-192.png');
    expect(existsSync(filePath), `${filePath} must exist for Android/PWA home-screen use`).toBe(true);
    const { width, height } = readPngDimensions(filePath);
    expect({ width, height }).toEqual({ width: 192, height: 192 });
  });

  it('frontend/public/icon-512.png exists and is exactly 512x512px (Android/PWA)', () => {
    const filePath = path.join(PUBLIC_DIR, 'icon-512.png');
    expect(existsSync(filePath), `${filePath} must exist for Android/PWA home-screen use`).toBe(true);
    const { width, height } = readPngDimensions(filePath);
    expect({ width, height }).toEqual({ width: 512, height: 512 });
  });

  it('frontend/public/favicon.svg exists, is a real <svg> document, and is not an empty placeholder', () => {
    const filePath = path.join(PUBLIC_DIR, 'favicon.svg');
    expect(existsSync(filePath), `${filePath} must exist`).toBe(true);
    const svg = readFileSync(filePath, 'utf-8');
    expect(svg).toMatch(/<svg[\s>]/);
    expect(svg.trim().length, 'favicon.svg is suspiciously short for a real icon mark').toBeGreaterThan(
      40,
    );
  });

  it('favicon.svg reflects the fofafu brand (color.brand.primary #4D9463), not a generic placeholder', () => {
    const filePath = path.join(PUBLIC_DIR, 'favicon.svg');
    expect(existsSync(filePath), `${filePath} must exist`).toBe(true);
    const svg = readFileSync(filePath, 'utf-8').toLowerCase();

    // Reject the tell-tale generic/placeholder colors (Vite's default
    // purple, or plain black/white with nothing else) UNLESS the brand
    // token itself is also present — some compositions legitimately mix
    // brand.primary with ink/surface tokens (#1F1B18 / #FFFBF5) for
    // contrast, so black/white alone isn't disqualifying, only being
    // *exclusively* a known placeholder color is.
    const brandTokenPresent = svg.includes('#4d9463');
    const worksAroundVitePurple = svg.includes('#646cff') || svg.includes('#61dafb');

    expect(
      brandTokenPresent || !worksAroundVitePurple,
      'favicon.svg contains the stock Vite/React logo placeholder color and no occurrence of ' +
        'color.brand.primary (#4D9463) — looks like a copy-pasted placeholder rather than a fofafu mark.',
    ).toBe(true);
    expect(
      brandTokenPresent,
      'favicon.svg does not reference color.brand.primary (#4D9463). If a documented brand-approved ' +
        'derivative was used instead, note the divergence in the feature file\'s ### Visual section.',
    ).toBe(true);
  });
});
