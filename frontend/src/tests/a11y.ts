import { expect } from 'vitest';
import { axe } from 'vitest-axe';
// vitest-axe@0.1.0 ships an empty extend-expect; register the matcher manually.
import * as matchers from 'vitest-axe/matchers';

expect.extend(matchers as unknown as Parameters<typeof expect.extend>[0]);

interface ToHaveNoViolations {
  toHaveNoViolations: () => void;
}

export async function expectNoA11yViolations(container: Element): Promise<void> {
  // Only run rules that are jsdom-safe + actually meaningful at unit-test scope.
  const results = await axe(container, {
    rules: {
      // Color-contrast in jsdom is unreliable (no real layout / computed styles)
      // — we verify contrast manually in the feature spec.
      'color-contrast': { enabled: false },
    },
  });
  (expect(results) as unknown as ToHaveNoViolations).toHaveNoViolations();
}
