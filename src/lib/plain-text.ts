// Markdown, for somewhere that cannot read markdown.
//
// This app's model writes markdown, and for a long time that is exactly what
// left the app: `sendWork` handed `navigator.share` the raw thing on the
// argument that it "survives arriving somewhere that understands it as
// headings and lists". The flaw is that the share sheet never tells you where
// it is going, and the commonest destination is Messages, which understands
// none of it. What arrived was `# Beyond identifying the 3 target lenders…`
// and `- [SBA 7(a) Paperwork Explained](https://…)`. Nobody reads that.
//
// Plain text is the only register that reads correctly everywhere a share
// sheet can go, so everything is levelled to it at the boundary.

/**
 * The agent writes markdown. A message bubble does not read it.
 *
 * What went out was raw: `# The wall is about mass without edges`, `##  What
 * runs through it`, `- **a single dark form**`. Seen in somebody's Messages
 * thread, that is not a thought you shared, it is a file you leaked. Headings
 * become plain lines, emphasis is dropped, bullets become the one bullet this
 * app uses everywhere, and a link becomes its words with the address after
 * them — because a bare `[text](url)` is unreadable and a bare url is
 * untrustworthy.
 */
export function plainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .split('\n')
    .map((raw) => {
      let l = raw.trimEnd()
      // `\s+|$`, so a bare `###` on its own line goes too. It required a
      // space after the hashes, which meant an empty heading — which markdown
      // allows and models emit — travelled to the message intact as `###`.
      // `#tag` is untouched either way: what follows the hash is neither a
      // space nor the end of the line.
      l = l.replace(/^\s{0,3}#{1,6}(?:\s+|$)/, '')
      l = l.replace(/^\s*[-*+]\s+/, '· ')
      l = l.replace(/^\s*(\d+)\.\s+/, '$1. ')
      l = l.replace(/^\s*>\s?/, '')
      // [words](url) → words (url); an image is not text at all
      l = l.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      l = l.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
      l = l.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
      l = l.replace(/__([^_]+)__/g, '$1')
      l = l.replace(/`([^`]+)`/g, '$1')
      l = l.replace(/^\s*([-*_])\1{2,}\s*$/, '')
      return l.trimEnd()
    })
    .join('\n')
    // three or more blank lines is what stripping a heading leaves behind
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
