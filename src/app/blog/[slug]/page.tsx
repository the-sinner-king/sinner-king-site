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
  await params
  // [GHOST: Fetch post from Ghost or markdown files. When CMS is live, remove notFound().]
  notFound()
}
