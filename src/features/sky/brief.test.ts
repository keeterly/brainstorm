import { describe, expect, it } from 'vitest'
import { briefHtml } from './SkyPage'

const MD = `# Getting an SBA 7(a) loan for a small apparel label

## What I found
- **7(a) is the right programme** — 504 is for property, and you are funding inventory
- **Expect 30–45 days** once the packet is complete

## The way through
1. **Get two years of returns together** — the lender asks first and it is the slowest bit
2. **Write the use of funds** — line items, not a paragraph

## Where this goes wrong
- Applying before the LLC is registered

## Sources
- [SBA 7(a) overview](https://www.sba.gov/funding-programs/loans/7a)
`

const SOURCES = [
  { title: 'SBA 7(a) overview', url: 'https://www.sba.gov/funding-programs/loans/7a' },
  { title: '', url: 'https://lendio.com/blog/sba-timeline' },
]

describe('reading a brief back', () => {
  const html = briefHtml(MD, SOURCES)

  it('keeps the sections the agent wrote', () => {
    expect(html).toContain('What I found')
    expect(html).toContain('The way through')
    expect(html).toContain('Where this goes wrong')
  })
  it('drops the title, because the page is already headed with it', () => {
    expect(html).not.toContain('Getting an SBA')
  })
  it('numbers the steps in order', () => {
    const ks = [...html.matchAll(/<div class="k">(\d+)<\/div>/g)].map((m) => m[1])
    expect(ks).toEqual(['1', '2'])
    expect(html).toContain('class="step first"')
  })
  it('turns the lead of a bullet bold and leaves the rest alone', () => {
    expect(html).toContain('<b>7(a) is the right programme</b>')
    expect(html).not.toContain('**')
  })
  it('makes every source a real target, with where it came from', () => {
    expect(html).toContain('href="https://www.sba.gov/funding-programs/loans/7a"')
    expect(html).toContain('sba.gov')
    // an untitled source is named by its host rather than left blank
    expect(html).toContain('lendio.com')
  })
  it('lists the sources once, under one heading, with links', () => {
    expect(html.match(/sba\.gov\/funding-programs/g)).toHaveLength(1)
    // the agent writes its own plain "## Sources" list; that is dropped in
    // favour of the real one, rather than both being shown
    expect(html.match(/class="lab"/g)?.filter(Boolean)).toHaveLength(4)
    expect(html).toContain('where this came from')
  })
  it('names an untitled source by its host, and does not then repeat it', () => {
    // the row is <t>name</t><h>host</h>; with no name the host is the name,
    // and printing it twice side by side read as a mistake
    expect(html).toContain('<span class="t">lendio.com</span></a>')
    expect(html).toContain('<span class="t">SBA 7(a) overview</span><span class="h">sba.gov</span>')
  })
  it('says so plainly when nothing was written down', () => {
    expect(briefHtml('', [])).toContain('Nothing was written down')
  })
})

describe('a brief is text off the open web', () => {
  it('cannot put markup into the page', () => {
    const html = briefHtml('## <img src=x onerror=alert(1)>\n- <script>alert(2)</script>', [])
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;img')
    expect(html).toContain('&lt;script')
  })
  it('cannot smuggle markup through a source title or url', () => {
    const html = briefHtml('', [{ title: '"><script>alert(1)</script>', url: 'https://a.test/"><b>' }])
    expect(html).not.toContain('<script')
    expect(html).not.toContain('href="https://a.test/"><b>"')
    expect(html).toContain('&quot;')
  })
  it('will not hand the operating system anything but a web address', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>1</script>', 'file:///etc/passwd', 'JavaScript:x']) {
      expect(briefHtml('', [{ title: 'tap me', url }]), url).not.toContain('tap me')
    }
    expect(briefHtml('', [{ title: 'fine', url: 'https://ok.test' }])).toContain('fine')
  })
  it('survives a malformed url without throwing', () => {
    expect(() => briefHtml('', [{ title: 'x', url: 'https://[[[' }])).not.toThrow()
  })
})
