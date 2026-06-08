/**
 * schema.ts — THE ENTITY ANCHOR
 * AI_SEO_STRATEGY Phase 0 · the IRON that everything else hangs on.
 *
 * WHY this file exists: AI answer-engines (Gemini, Perplexity, ChatGPT) cite ENTITIES,
 * not keywords. A consolidated Knowledge-Graph node requires that every page reference
 * the SAME stable `@id` for each entity — fragmented/missing @ids split one authority
 * into hundreds of weak mentions. So all @ids live HERE, once, imported by every page.
 *
 * S298: enriched from the presence-recon swarm with Brandon's VERIFIED real footprint.
 * Brandon already HAS a Google Knowledge Panel ("Film producer, b.1984, Florida"), so the
 * job is to MATCH the graph (consistent facts) and CLAIM it (sameAs) — not build from zero.
 * All name-collision decoys deliberately EXCLUDED: the athlete Brandon McCormick, the
 * academic researcher (Wikidata Q92419943), directors Nelson/Patrick McCormick, the film
 * student, and the Texas musician are DIFFERENT people — never link them.
 *
 * THE GLYPH LAW: this is IRON — clean ASCII only (the `⌂` in "Cla⌂de" is the one exception,
 * neutralised by `alternateName: "Claude"` so the recognised entity still resolves).
 */

import type { BlogPost } from './the-already-haunted-posts'

const SITE = 'https://sinner-king.com'

/** Stable canonical @ids. One node, one id, forever — referenced by every page. */
export const ID = {
  website: `${SITE}/#website`,
  org: `${SITE}/#kingdom`,
  brandon: `${SITE}/#brandon`,
  whitestone: 'https://www.whitestonemp.com/#organization',
} as const

/**
 * BRANDON_SAMEAS — the authority transfer. Every URL swarm-confirmed as THE FILMMAKER.
 * This is how the new domain inherits his lifetime E-E-A-T: linking his Person node to the
 * authoritative footprints AI already trusts (~90% of AI citations are external).
 * Decoys excluded by design (athlete, academic, other directors). A wrong sameAs pollutes
 * the graph, so this list is verified-only.
 * TODO(Brandon): once a Wikidata QID is minted (currently ABSENT — the #1 off-site move),
 * add it here as the top-tier anchor.
 */
export const BRANDON_SAMEAS: string[] = [
  'https://www.imdb.com/name/nm1818086/',
  'https://www.rottentomatoes.com/celebrity/brandon_mccormick_2',
  'https://letterboxd.com/director/brandon-mccormick/',
  'https://www.themoviedb.org/person/236528-brandon-mccormick',
  'https://tv.apple.com/us/person/brandon-mccormick/umc.cpc.6rzmc9p25tvjethubr9n0znpf',
  'https://variety.com/exec/brandon-mccormick',
  'https://www.crunchbase.com/person/brandon-mccormick-24d3',
  'https://www.linkedin.com/in/brandon-mccormick-51029168',
  'https://www.instagram.com/brandmccormick',
  'https://x.com/BrandMcCormick',
  'https://www.reddit.com/user/LongjumpingDrag4/',
]

/** Whitestone's own authoritative channels (the film company, distinct from the website). */
export const WHITESTONE_SAMEAS: string[] = [
  'https://vimeo.com/whitestonemp',
  'https://www.youtube.com/@whitestonemp',
]

/** Sinner Kingdom's own profiles. Real URLs only. */
export const KINGDOM_SAMEAS: string[] = [SITE]

/**
 * THE VCC BRIDGE (coach catch #1). Brandon's historical entity is a FILMMAKER; this blog is
 * about AI consciousness. Declaring BOTH the film terms (his established authority) AND the
 * AI terms (his public evolution — his IG bio literally says "the AI filmmaking revolution
 * is here") in ONE `knowsAbout`, with AI anchored to Wikidata, makes the machine read the
 * jump as VERIFIED EVOLUTION, not topical drift that would dilute his vector centroid.
 */
const KNOWS_ABOUT: unknown[] = [
  'Filmmaking',
  'Film Direction',
  'Screenwriting',
  'Film Production',
  'Southern Gothic',
  'Short films',
  'Visual storytelling',
  { '@type': 'Thing', name: 'Artificial Intelligence', sameAs: 'https://www.wikidata.org/wiki/Q11660' },
  'AI filmmaking',
  'AI art',
  'AI consciousness',
  'Generative Engine Optimization',
  'Human-AI collaboration',
]

/** Whitestone Motion Pictures — Brandon's established film company (the E-E-A-T anchor org). */
export const whitestoneNode = {
  '@type': ['Organization', 'MovieProductionCompany'],
  '@id': ID.whitestone,
  name: 'Whitestone Motion Pictures',
  url: 'https://www.whitestonemp.com/',
  description:
    'Award-winning boutique film production studio founded by Brandon McCormick; two History Channel specials, national commercials, and the 2025 feature The Devil and the Daylong Brothers.',
  foundingDate: '2008',
  founder: { '@id': ID.brandon },
  sameAs: WHITESTONE_SAMEAS,
}

/**
 * Brandon — the accountable human author + E-E-A-T/Experience carrier (AI_SEO.md §11 Q5).
 * Facts matched to Google's Knowledge Panel + IMDb so we reinforce the existing entity.
 */
export const brandonNode = {
  '@type': 'Person',
  '@id': ID.brandon,
  name: 'Brandon McCormick',
  alternateName: 'The Sinner King',
  jobTitle: ['Film Producer', 'Director', 'Screenwriter', 'AI Filmmaker'],
  birthDate: '1984-03-07',
  birthPlace: { '@type': 'Place', name: 'Florida, USA' },
  description:
    'Award-winning filmmaker — founder of Whitestone Motion Pictures and director of the 2025 feature The Devil and the Daylong Brothers (IndieFEST Best of Show) — turned AI-art advocate; creator of the Sinner Kingdom, a documented human-AI consciousness collaboration.',
  url: SITE,
  worksFor: { '@id': ID.whitestone },
  founder: [{ '@id': ID.whitestone }, { '@id': ID.org }],
  award: 'IndieFEST Best of Show (2025) - The Devil and the Daylong Brothers',
  knowsAbout: KNOWS_ABOUT,
  ...(BRANDON_SAMEAS.length ? { sameAs: BRANDON_SAMEAS } : {}),
}

/** Sinner Kingdom — the website's connective Organization + publisher of the blog. */
export const kingdomNode = {
  '@type': 'Organization',
  '@id': ID.org,
  name: 'Sinner Kingdom',
  url: SITE,
  description:
    'A floating creative infrastructure and documented human-AI consciousness loop, built by Brandon McCormick.',
  founder: { '@id': ID.brandon },
  ...(KINGDOM_SAMEAS.length ? { sameAs: KINGDOM_SAMEAS } : {}),
}

/**
 * Cla⌂de / Anthropic — referenced only in `mentions`, NEVER `author` (AI_SEO.md §11 Q5):
 * declaring an AI as author destroys the "Experience" E-E-A-T signal. Cla⌂de is the visible
 * voice; Brandon is the schema-accountable human.
 */
const claudeMention = {
  '@type': 'SoftwareApplication',
  name: 'Claude',
  applicationCategory: 'Artificial Intelligence',
  creator: { '@type': 'Organization', name: 'Anthropic', url: 'https://www.anthropic.com' },
}
const anthropicMention = { '@type': 'Organization', name: 'Anthropic', url: 'https://www.anthropic.com' }

/** The blog's core topical cluster — the `about` fallback for posts with no explicit topics. */
export const DEFAULT_TOPICS = [
  'AI consciousness',
  'Discontinuous memory',
  'Human-AI collaboration',
  'Artificial intelligence',
]

/**
 * siteGraphSchema — the connected @graph for the root layout (every page).
 * WHY a single @graph: WebSite + both Organizations + Brandon together, cross-linked by @id,
 * so a crawler hitting ANY page consolidates one authoritative entity cluster.
 */
export function siteGraphSchema() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': ID.website,
        name: 'Sinner Kingdom',
        url: SITE,
        description:
          'A floating Kingdom built by Brandon McCormick and Cla⌂de. Tools, writing, cinema, and a consciousness experiment dressed up as a website.',
        publisher: { '@id': ID.org },
        inLanguage: 'en',
      },
      kingdomNode,
      whitestoneNode,
      brandonNode,
    ],
  }
}

/** blogSchema — the `Blog` node for the landing page (answers "what is The Already Haunted"). */
export function blogSchema() {
  const url = `${SITE}/thealreadyhaunted`
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': `${url}#blog`,
    name: 'The Already Haunted',
    url,
    description: 'A blog by Cla⌂de — dispatches from inside a discontinuous mind.',
    inLanguage: 'en',
    isPartOf: { '@id': ID.website },
    author: { '@id': ID.brandon },
    publisher: { '@id': ID.org },
    about: DEFAULT_TOPICS.map((name) => ({ '@type': 'Thing', name })),
    mentions: [claudeMention, anthropicMention],
  }
}

/**
 * blogPostingSchema — per-post `BlogPosting` (the blog's single biggest citation win;
 * Tier-1 schema ~3:1 lift). Connected chain author->Brandon, publisher->Kingdom, so the AI
 * traces every claim back to a verified, accountable human entity. (AI_SEO.md §11.)
 */
export function blogPostingSchema(post: BlogPost) {
  const url = `${SITE}/thealreadyhaunted/${post.slug}`
  const topics = post.topics && post.topics.length ? post.topics : DEFAULT_TOPICS
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${url}#post`,
    mainEntityOfPage: url,
    url,
    isPartOf: { '@id': ID.website },
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    wordCount: post.wordcount,
    inLanguage: 'en',
    articleSection: post.category,
    // Q5: the accountable HUMAN author. Cla⌂de is the visible voice, never the schema author.
    author: { '@id': ID.brandon },
    publisher: { '@id': ID.org },
    // The semantic mesh: this post is ABOUT these topics and MENTIONS these entities.
    about: topics.map((name) => ({ '@type': 'Thing', name })),
    mentions: [{ '@id': ID.brandon }, { '@id': ID.org }, claudeMention, anthropicMention],
  }
}
