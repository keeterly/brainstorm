import { describe, expect, it } from 'vitest'
import { addressAllowed, heroImage, pageTitle, reachable } from '../_lib/reach'

// The app now fetches pages a model chose. That is the one place in it where
// "where may this end up" has to be answered by something other than hope.

describe('where an outbound fetch may land', () => {
  it('goes to the ordinary web', () => {
    for (const h of ['www.tate.org.uk', 'metmuseum.org', 'sfmoma.org', 'a-b.co.uk', '1.1.1.1']) {
      expect(addressAllowed(h), h).toBe(true)
    }
  })

  it('will not go to this machine, however the address is spelled', () => {
    // Every one of these reaches 127.0.0.1 in a browser, and every one of them
    // looks like a hostname to a regex written in a hurry.
    for (const h of ['localhost', '127.0.0.1', '127.1', '0177.0.0.1', '0x7f.0.0.1', '2130706433', '::1', '0.0.0.0']) {
      expect(addressAllowed(h), h).toBe(false)
    }
  })

  it('will not go to the cloud metadata service', () => {
    // the single most valuable address to reach from inside a function, and
    // the reason this file exists
    expect(addressAllowed('169.254.169.254')).toBe(false)
    expect(addressAllowed('[::ffff:169.254.169.254]')).toBe(false)
  })

  it('will not go anywhere inside a private network', () => {
    for (const h of ['10.0.0.5', '172.16.3.1', '172.31.255.254', '192.168.1.1', '100.64.0.1', 'db.internal', 'printer.local']) {
      expect(addressAllowed(h), h).toBe(false)
    }
  })

  it('will not go to a v6 address that is really a v4 one', () => {
    expect(addressAllowed('[::ffff:127.0.0.1]')).toBe(false)
    expect(addressAllowed('[::ffff:10.0.0.1]')).toBe(false)
  })

  it('will not go to link-local or unique-local v6', () => {
    expect(addressAllowed('[fe80::1]')).toBe(false)
    expect(addressAllowed('[fd00::1]')).toBe(false)
  })
})

describe('the gate every URL passes through', () => {
  it('takes a plain https page', () => {
    expect(reachable('https://www.tate.org.uk/art/artworks/x')?.hostname).toBe('www.tate.org.uk')
  })

  it('refuses anything that is not https', () => {
    for (const u of ['http://tate.org.uk/', 'file:///etc/passwd', 'gopher://tate.org.uk/', 'data:text/html,x']) {
      expect(reachable(u), u).toBeNull()
    }
  })

  it('refuses credentials in the URL, which are a way to confuse a parser', () => {
    expect(reachable('https://user:pass@tate.org.uk/')).toBeNull()
    // …including the classic one, where the real host is after the @
    expect(reachable('https://tate.org.uk@169.254.169.254/')).toBeNull()
  })

  it('refuses a port that is not the one the web is on', () => {
    expect(reachable('https://tate.org.uk:8080/')).toBeNull()
    expect(reachable('https://tate.org.uk:443/x')?.pathname).toBe('/x')
  })

  it('refuses nonsense rather than throwing on it', () => {
    expect(reachable('not a url')).toBeNull()
    expect(reachable('')).toBeNull()
  })
})

describe('the picture a page says is its own', () => {
  const page = (head: string) => `<!doctype html><html><head>${head}</head><body><img src="/logo.png"></body></html>`

  it('reads og:image, which is what a museum page declares', () => {
    const html = page(`<meta property="og:image" content="https://media.tate.org.uk/work.jpg">`)
    expect(heroImage(html, 'https://tate.org.uk/a')).toBe('https://media.tate.org.uk/work.jpg')
  })

  it('resolves a relative one against the page it came from', () => {
    const html = page(`<meta property="og:image" content="/img/work.jpg">`)
    expect(heroImage(html, 'https://tate.org.uk/art/x')).toBe('https://tate.org.uk/img/work.jpg')
  })

  it('falls back to twitter:image, then to link rel=image_src', () => {
    expect(heroImage(page(`<meta name="twitter:image" content="https://x.org/a.jpg">`), 'https://x.org/')).toBe(
      'https://x.org/a.jpg',
    )
    expect(heroImage(page(`<link rel="image_src" href="https://x.org/b.jpg">`), 'https://x.org/')).toBe(
      'https://x.org/b.jpg',
    )
  })

  it('never takes the first <img> on the page', () => {
    // which is a logo far more often than it is the work, and a wall of logos
    // is worse than a short wall
    expect(heroImage(page(''), 'https://x.org/')).toBeNull()
  })

  it('puts an og:image through the same gate as everything else', () => {
    // the page is chosen by a model; the image URL is chosen by the page
    expect(heroImage(page(`<meta property="og:image" content="http://x.org/a.jpg">`), 'https://x.org/')).toBeNull()
    expect(
      heroImage(page(`<meta property="og:image" content="https://169.254.169.254/a.jpg">`), 'https://x.org/'),
    ).toBeNull()
  })

  it('unescapes the entities a real page puts in an attribute', () => {
    const html = page(`<meta property="og:image" content="https://x.org/a.jpg?w=1&amp;h=2">`)
    expect(heroImage(html, 'https://x.org/')).toBe('https://x.org/a.jpg?w=1&h=2')
  })

  it('copes with single quotes and reversed attribute order', () => {
    const html = page(`<meta content='https://x.org/a.jpg' property='og:image'>`)
    expect(heroImage(html, 'https://x.org/')).toBe('https://x.org/a.jpg')
  })
})

describe('the ways a museum page names its picture', () => {
  // Open Graph alone produced one image out of five real gallery pages.
  // Collection systems are usually rendered by JavaScript with only structured
  // data in the served HTML, and plenty of gallery pages never learned og.
  const page = (body: string) => `<!doctype html><html><head></head><body>${body}</body></html>`
  const ld = (json: string) => page(`<script type="application/ld+json">${json}</script>`)

  it('reads a plain string image out of JSON-LD', () => {
    const html = ld(`{"@type":"VisualArtwork","name":"x","image":"https://m.org/w.jpg"}`)
    expect(heroImage(html, 'https://m.org/a')).toBe('https://m.org/w.jpg')
  })

  it('reads an ImageObject, which is what the bigger collections emit', () => {
    const html = ld(`{"@type":"CreativeWork","image":{"@type":"ImageObject","url":"https://m.org/o.jpg"}}`)
    expect(heroImage(html, 'https://m.org/a')).toBe('https://m.org/o.jpg')
  })

  it('reads the first of an array of them', () => {
    const html = ld(`{"image":["https://m.org/1.jpg","https://m.org/2.jpg"]}`)
    expect(heroImage(html, 'https://m.org/a')).toBe('https://m.org/1.jpg')
  })

  it('finds it inside an @graph, where half of them put it', () => {
    const html = ld(`{"@context":"https://schema.org","@graph":[{"@type":"WebSite"},{"@type":"WebPage","primaryImageOfPage":{"@id":"https://m.org/g.jpg"}}]}`)
    expect(heroImage(html, 'https://m.org/a')).toBe('https://m.org/g.jpg')
  })

  it('resolves a relative one and puts it through the same gate', () => {
    expect(heroImage(ld(`{"image":"/img/w.jpg"}`), 'https://m.org/a')).toBe('https://m.org/img/w.jpg')
    expect(heroImage(ld(`{"image":"http://m.org/w.jpg"}`), 'https://m.org/a')).toBeNull()
  })

  it('does not choke on the malformed JSON-LD half the web ships', () => {
    expect(heroImage(ld('{ this is not json'), 'https://m.org/a')).toBeNull()
  })

  it('reads the older itemprop spelling', () => {
    const html = `<head><meta itemprop="image" content="https://m.org/i.jpg"></head>`
    expect(heroImage(html, 'https://m.org/a')).toBe('https://m.org/i.jpg')
  })

  it('takes a picture the page wrapped in a figure', () => {
    // a figure is the page saying this picture *is* the content, which is
    // exactly the claim being looked for
    const html = page(`<figure><img src="https://m.org/fig.jpg" width="900"><figcaption>x</figcaption></figure>`)
    expect(heroImage(html, 'https://m.org/a')).toBe('https://m.org/fig.jpg')
  })

  it('reads a srcset when there is no plain src', () => {
    const html = page(`<figure><img srcset="https://m.org/a.jpg 900w, https://m.org/b.jpg 1800w"></figure>`)
    expect(heroImage(html, 'https://m.org/a')).toBe('https://m.org/a.jpg')
  })

  it('will not take a logo, an icon or a spacer, whatever it is wrapped in', () => {
    for (const src of ['/assets/logo.png', '/i/icon-share.png', '/sprite.svg', '/img/placeholder.jpg', '/avatar.jpg']) {
      expect(heroImage(page(`<figure><img src="${src}" width="900"></figure>`), 'https://m.org/a'), src).toBeNull()
    }
  })

  it('will not take something that says it is tiny', () => {
    expect(heroImage(page(`<figure><img src="/w.jpg" width="60"></figure>`), 'https://m.org/a')).toBeNull()
  })

  it('still never takes a bare img outside a figure', () => {
    // the masthead is a bare img on every page in the world
    expect(heroImage(page(`<img src="https://m.org/hero.jpg" width="1200">`), 'https://m.org/a')).toBeNull()
  })

  it('prefers what the page meant most: og over structured data over a figure', () => {
    const html =
      `<head><meta property="og:image" content="https://m.org/og.jpg"></head>` +
      `<body><script type="application/ld+json">{"image":"https://m.org/ld.jpg"}</script>` +
      `<figure><img src="https://m.org/fig.jpg" width="900"></figure></body>`
    expect(heroImage(html, 'https://m.org/a')).toBe('https://m.org/og.jpg')
    expect(heroImage(html.replace(/<meta[^>]*>/, ''), 'https://m.org/a')).toBe('https://m.org/ld.jpg')
  })
})

describe('what the page calls itself', () => {
  it('prefers og:title', () => {
    const html = `<head><meta property="og:title" content="City of Refuge III"><title>Tate | thing</title></head>`
    expect(pageTitle(html)).toBe('City of Refuge III')
  })

  it('falls back to the title tag, on one line', () => {
    expect(pageTitle(`<head><title>\n  Draped Seated Woman\n</title></head>`)).toBe('Draped Seated Woman')
  })

  it('is null when the page says nothing', () => {
    expect(pageTitle('<head></head>')).toBeNull()
  })
})
