/**
 * sitemap.ts — Next.js App Router dynamic sitemap
 *
 * Served at /sitemap.xml. Referenced in public/robots.txt.
 * Includes all public routes + wiki pages + blog posts.
 *
 * Excludes:
 *   /cockpit, /lab*, /kingdom-hud-lab*, /glyph — internal/testing
 *   /blog/[slug] — Ghost CMS not connected yet (404s)
 */

import { MetadataRoute } from 'next'
import { POSTS } from '@/lib/the-already-haunted-posts'
import wikiManifest from '../../public/wiki-manifest.json'

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://sinner-king.com'

interface WikiPage {
  slug: string
  updated_at: string
}

export default function sitemap(): MetadataRoute.Sitemap {
  // ── Static routes ────────────────────────────────────────
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/kingdom-map`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/radio`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/archive`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/archive/scraps`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/archive/pulp`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/archive/novels`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/cinema`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/spirit`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/spirit/portal`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/thealreadyhaunted`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/wiki`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/kingdom-wiki`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.6,
    },
  ]

  // ── The Already Haunted blog posts ───────────────────────
  const blogRoutes: MetadataRoute.Sitemap = POSTS.map((post) => ({
    url: `${BASE_URL}/thealreadyhaunted/${post.slug}`,
    lastModified: new Date(post.date),
    changeFrequency: 'yearly' as const,
    priority: 0.7,
  }))

  // ── Wiki pages ───────────────────────────────────────────
  const typedManifest = wikiManifest as { pages: WikiPage[] }
  const wikiRoutes: MetadataRoute.Sitemap = typedManifest.pages.map((page) => ({
    url: `${BASE_URL}/wiki/${page.slug}`,
    lastModified: new Date(page.updated_at),
    changeFrequency: 'monthly' as const,
    priority: 0.5,
  }))

  return [...staticRoutes, ...blogRoutes, ...wikiRoutes]
}
