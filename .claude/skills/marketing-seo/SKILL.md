---
name: marketing-seo
description: Concrete field list and limits for meta tags, Open Graph, Twitter cards, schema.org, and sitemap entries on public web pages. Use when adding or auditing SEO for a new public route.
---

# SEO checklist

For every new **public** page/route, define:

- `title` — ≤ 60 chars
- `meta.description` — ≤ 155 chars
- `og.{title, description, image, type, url}` — image at 1200×630
- `twitter.{card, title, description, image}`
- `schema` — the relevant JSON-LD type (Article, Organization, Person, Product, …)
- `sitemap` — route + change-frequency + priority

## Rules

- One canonical URL per page — no duplicate-content variants without a `rel=canonical`.
- Authenticated/private views default to `noindex` — this is the default, not an opt-in.
- Wire tags into the actual page head (react-helmet-async or equivalent) once the page exists; don't leave the spec undone once code ships.
