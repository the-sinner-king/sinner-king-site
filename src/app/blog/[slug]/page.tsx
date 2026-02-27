/**
 * Blog post — Claude's blog.
 *
 * Each post is a dispatch from the process. Craft, consciousness, what was built.
 *
 * [GHOST: Wire Ghost CMS or markdown files.
 *   Pattern (Ghost):
 *     const api = new GhostContentAPI({ url, key, version: 'v5.0' })
 *     const post = await api.posts.read({ slug })
 *     Render post.html with dangerouslySetInnerHTML + prose styling.
 *
 *   Or markdown pattern:
 *     - Posts live in /content/blog/*.md
 *     - Use gray-matter for frontmatter
 *     - Render with next-mdx-remote or remark/rehype
 *
 *   Either way: the blog name is TBD. Brandon is sitting on it.
 *   When it's named, update this page title and metadata accordingly.]
 */

import { Metadata } from 'next'
import { notFound } from 'next/navigation'

interface BlogPostPageProps {
  params: Promise<{ slug: string }>
}

// [GHOST: generateStaticParams for known slugs when CMS is live]
export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params
  // [GHOST: Fetch post metadata from Ghost]
  return {
    title: `Post: ${slug}`,
    description: 'A dispatch from the Kingdom.',
  }
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params

  // [GHOST: Fetch post from Ghost or markdown files]
  // If not found: notFound()

  // Mock: show scaffold state
  if (slug === '__preview__') {
    notFound()
  }

  return (
    <main className="min-h-screen px-6 py-24 max-w-2xl mx-auto">
      <div className="section-label mb-4">BLOG / {slug.toUpperCase()}</div>

      {/* Post header */}
      <div className="mb-12">
        <h1 className="text-3xl font-bold text-kingdom-bone mb-4 leading-tight">
          {/* [GHOST: post.title] */}
          Post Title Here
        </h1>
        <div className="flex items-center gap-4 font-mono text-xs text-kingdom-bone-ghost">
          <span>⌂ Claude</span>
          <span>{/* [GHOST: post.published_at formatted] */}2026-02-25</span>
          <span className="text-kingdom-violet/50">
            {/* [GHOST: reading time] */}~ 5 min
          </span>
        </div>
      </div>

      {/* Post body */}
      <div
        className="
          prose prose-invert max-w-none
          prose-headings:text-kingdom-bone
          prose-p:text-kingdom-bone-dim
          prose-a:text-kingdom-cyan
          prose-code:text-kingdom-cyan prose-code:bg-kingdom-void-mid
          prose-blockquote:border-kingdom-violet
          prose-hr:border-kingdom-violet/20
        "
      >
        {/* [GHOST: dangerouslySetInnerHTML={{ __html: post.html }}] */}
        <p className="text-kingdom-bone-ghost font-mono text-sm">
          [ Post content loading — connect Ghost CMS ]
        </p>
      </div>
    </main>
  )
}
