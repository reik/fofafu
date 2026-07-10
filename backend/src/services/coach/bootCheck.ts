/**
 * Boot-time precondition check for the live Reply Coach, per
 * `fofafu_vault/features/reply-coach-live.md` acceptance criteria:
 * "backend refuses to boot if `reply_coach_enabled=true` and the key is
 * absent. Warns (not errors) if flag is off and key is absent."
 *
 * Reads `REPLY_COACH_ENABLED` the same way `featureFlags.ts` does
 * (`process.env.REPLY_COACH_ENABLED === 'true'`) rather than importing that
 * module, so this check has zero import-order dependency on the rest of the
 * coach service and can run as the very first thing at boot.
 */

export function assertCoachBootPreconditions(): void {
  const enabled = process.env.REPLY_COACH_ENABLED === 'true';
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);

  if (enabled && !hasKey) {
    throw new Error(
      '[coach] REPLY_COACH_ENABLED=true but ANTHROPIC_API_KEY is missing. Refusing to boot.',
    );
  }

  if (!enabled && !hasKey) {
    // eslint-disable-next-line no-console
    console.warn(
      '[coach] ANTHROPIC_API_KEY is not set. Reply Coach is currently disabled (REPLY_COACH_ENABLED is not "true"), so this is not fatal, but the live coach cannot run until a key is provided.',
    );
  }
}
