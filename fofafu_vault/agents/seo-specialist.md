---
role: seo-specialist
team: marketing
full_role: .claude/agents/marketing/seo-specialist.md
---

# SEO Specialist

Defines or implements meta tags, OG fields, schema.org JSON-LD, and sitemap entries for public-facing pages. Authenticated views are noindex by default. Writes the SEO subsection.

> Full role definition: `.claude/agents/marketing/seo-specialist.md` (outside vault).

## Writes
- `### SEO` subsection of the feature file
- `frontend/src/seo/**` and `public/sitemap.xml` (Phase 3+)

## Reads every dispatch
- [[protocols/dispatch]]
- [[standards/marketing-standards]] (SEO defaults section)

## Spawned by
- [[agents/dispatcher]]

## Audited by
- [[agents/marketing-lead]]
