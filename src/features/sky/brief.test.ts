import { describe, expect, it } from 'vitest'
import { briefHtml, briefMapHtml, type MapRow } from './SkyPage'

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
  it('separates what a finding is from why it matters', () => {
    // `**the point** — why it matters` is the one shape the agent writes, in
    // every bullet and every step, and it used to come out as a single 13.5px
    // run-on with a bold bit at the front. Two different weights of
    // information, set identically, on a phone.
    expect(html).toContain('<div class="h">7(a) is the right programme</div>')
    expect(html).toContain('<div class="d">504 is for property, and you are funding inventory</div>')
    expect(html).not.toContain('**')
  })
  it('does the same for a step, into the two rows the grid has always had', () => {
    expect(html).toContain('<div class="v">Get two years of returns together</div>')
    expect(html).toContain('<div class="d">the lender asks first and it is the slowest bit</div>')
  })
  it('knows the other mark the agent uses', () => {
    // `_like this_` printed with its underscores showing, in the middle of an
    // otherwise finished page — the reference reader signs its briefs that way
    const out = briefHtml('_Read from the references in SS27._', [])
    expect(out).toContain('<i>Read from the references in SS27.</i>')
    expect(out).not.toContain('_')
  })

  it('leaves an underscore inside a word alone', () => {
    // snake_case in a source name is not emphasis
    expect(briefHtml('- the venia_workspace blob', [])).toContain('venia_workspace')
  })

  it('leaves a plain sentence at reading weight, and marks it as a caveat', () => {
    /*
     * The watch-outs are written as plain sentences, not as point-and-reason.
     * Setting one of those at heading weight turns a caveat into a claim — so
     * it keeps reading weight. What it did not have was any way to tell it
     * apart from the reasons above it: an unmarked run of body text up to 220
     * characters long, in a section whose whole job is "this is where it goes
     * wrong". `note` is the marker and the clamp.
     */
    expect(html).toContain('<div class="a note">Applying before the LLC is registered</div>')
    // still not a heading — that is the half of this that was already right
    expect(html).not.toContain('<div class="h">Applying before the LLC')
  })
  it('slots what to do about it in before the sources, never after', () => {
    // a brief that ends in a bibliography is a document; one that ends in a
    // button is the agent finishing the job it started
    const withTodo = briefHtml(MD, SOURCES, '<div class="todo">DO</div>')
    expect(withTodo.indexOf('class="todo"')).toBeGreaterThan(withTodo.indexOf('The way through'))
    expect(withTodo.indexOf('class="todo"')).toBeLessThan(withTodo.indexOf('where this came from'))
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

/*
 * The map that replaces the numbered steps.
 *
 * `deepen` returns each step with an effort and a dependsOn list, and
 * `applyDeepen` writes both into the graph — and this page then rendered a
 * markdown summary of them that mentioned neither. These pin the shape that
 * replaced it, and the fact that a brief without one still renders the old way.
 */
describe('the steps, drawn', () => {
  const row = (p: Partial<MapRow> & { id: string; title: string }): MapRow => ({
    dots: '••',
    guessed: false,
    why: '',
    done: false,
    blocked: false,
    waits: '',
    act: '',
    ...p,
  })

  it('does not make a picture out of fewer than two steps', () => {
    // one step is a sentence, not a diagram
    expect(briefMapHtml([])).toBe('')
    expect(briefMapHtml([row({ id: 'a', title: 'One thing' })])).toBe('')
  })

  it('draws a node per step, with a dot and a place for the wires', () => {
    const html = briefMapHtml([row({ id: 'a', title: 'First' }), row({ id: 'b', title: 'Second' })])
    expect(html).toContain('data-sky="wires"')
    expect(html.match(/class="mnode/g)).toHaveLength(2)
    expect(html.match(/class="dot"/g)).toHaveLength(2)
    expect(html).toContain('data-id="a"')
    expect(html).toContain('aria-expanded="false"')
  })

  it('never puts a title in the markup', () => {
    /*
     * The one rule this page has had since it was written: these are the
     * model's words and the user's, and neither goes in innerHTML. Titles are
     * set with textContent after the fact — so a title with a tag in it must
     * not appear here at all, escaped or otherwise.
     */
    const html = briefMapHtml([
      row({ id: 'a', title: '<img src=x onerror=alert(1)>' }),
      row({ id: 'b', title: 'Second' }),
    ])
    expect(html).not.toContain('<img')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('alert')
    // the slot is there and it is empty
    expect(html).toContain('<span class="t"></span>')
  })

  it('escapes the id it does put in the markup', () => {
    const html = briefMapHtml([row({ id: '"><b>x', title: 'a' }), row({ id: 'b', title: 'b' })])
    expect(html).not.toContain('"><b>')
    expect(html).toContain('&quot;&gt;&lt;b&gt;x')
  })

  it('marks what is finished and what is waiting', () => {
    const html = briefMapHtml([
      row({ id: 'a', title: 'Done one', done: true }),
      row({ id: 'b', title: 'Blocked one', blocked: true, waits: 'after Done one' }),
    ])
    expect(html).toContain('class="mnode done"')
    expect(html).toContain('class="mnode waiting"')
  })

  it('carries the verb on the node, so nothing has to repeat the steps', () => {
    /*
     * The brief drew the map and then drew "what to do about it" over the same
     * step-children, so a plan of three said everything twice and the page came
     * out longer than the numbered list it replaced — which was the complaint.
     * The act rides the node; the list stands down.
     */
    const html = briefMapHtml([
      row({ id: 'a', title: 'a', act: 'work it' }),
      row({ id: 'b', title: 'b' }),
    ])
    expect(html.match(/class="go"/g)).toHaveLength(1)
    expect(html).toContain('data-act="a"')
    // …and the verb itself is text, set after the fact like every other word
    expect(html).not.toContain('work it')
  })

  it('leaves out the effort slot when nobody sized it', () => {
    const html = briefMapHtml([
      row({ id: 'a', title: 'a', dots: '' }),
      row({ id: 'b', title: 'b', dots: '•••' }),
    ])
    expect(html.match(/class="e"/g)).toHaveLength(1)
  })

  it('and marks a guess as a guess', () => {
    const html = briefMapHtml([
      row({ id: 'a', title: 'a', dots: '◦◦', guessed: true }),
      row({ id: 'b', title: 'b' }),
    ])
    expect(html).toContain('class="e guessed"')
  })
})

describe('a brief with a map in it', () => {
  it('puts the map where the numbered steps were, and drops them', () => {
    const map = '<div class="map">MAP</div>'
    const html = briefHtml(MD, [], '', map)
    expect(html).toContain('MAP')
    // the list the map replaces is gone — it said less and took more room
    expect(html).not.toContain('class="step')
    expect(html).not.toContain('Get two years of returns together')
    // …and it landed under that section's own heading rather than at the end
    expect(html.indexOf('MAP')).toBeGreaterThan(html.indexOf('The way through'))
    expect(html.indexOf('MAP')).toBeLessThan(html.indexOf('Where this goes wrong'))
  })

  it('keeps the numbered steps when there is no map to draw', () => {
    // a brief whose thought has no step-children — an older one, or a draft —
    // renders exactly as it always did
    const html = briefHtml(MD, [])
    expect(html).toContain('class="step first"')
    expect(html).toContain('Get two years of returns together')
    expect(html).not.toContain('class="map"')
  })

  it('leaves everything that is not a step alone', () => {
    const html = briefHtml(MD, [], '', '<div class="map">MAP</div>')
    // findings and watch-outs are not the map's business
    expect(html).toContain('7(a) is the right programme')
    expect(html).toContain('Where this goes wrong')
  })
})

describe('a map with nowhere obvious to go', () => {
  it('still draws when the write-up has no numbered steps', () => {
    /*
     * The map slots in where the first numbered line was, so it lands under
     * that section's own heading. A brief is not obliged to have one — `deepen`
     * can come back with findings and no sequence — and the map was being
     * dropped while the graph it draws sat in the store.
     */
    const noSteps = `# A thing\n\n## What I found\n- **One** — a fact\n`
    const html = briefHtml(noSteps, [], '', '<div class="map">MAP</div>')
    expect(html).toContain('MAP')
  })

  it('and does not draw it twice when there is one', () => {
    const html = briefHtml(MD, [], '', '<div class="map">MAP</div>')
    expect(html.match(/MAP/g)).toHaveLength(1)
  })

  it('stays ahead of the sources and the things to do', () => {
    const html = briefHtml('# t\n\n## What I found\n- **One** — a fact\n', [{ title: 's', url: 'https://a.co/x' }], '<div class="todo"></div>', '<div class="map">MAP</div>')
    expect(html.indexOf('MAP')).toBeLessThan(html.indexOf('class="todo"'))
    expect(html.indexOf('MAP')).toBeLessThan(html.indexOf('where this came from'))
  })
})
