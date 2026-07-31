# Where Brainstorm sits, and what would widen the gap

*July 2026. Sources at the bottom. A note on them first: several of the
comparison pages that rank for these searches are written by competitors
(Fabric and Storyflow both run large comparison-page operations), so their
verdicts on rivals are marketing. What they say about **their own** product,
and what independent reviews and the pricing pages say, is what is used here.*

---

## 1. The landscape, in five bands

Nobody is in Brainstorm's exact position. Five bands surround it, and each one
breaks at a different seam.

### Arrangement, for creatives — Milanote, Miro, Whimsical, FigJam

Milanote is the closest by *audience*: creatives, marketers, agencies, ~$9.99/mo
Pro. It solves scattered creative planning by putting notes, images, links and
references on beautiful visual boards.

The seam is named plainly in the reviews: it is *"where ideas look organized but
not where they get worked on."* And more usefully — **"the need for an
alternative usually appears when the board can no longer support what needs to
happen after ideas are captured."**

That sentence is Brainstorm's entire market.

Miro is the same shape at team scale, with AI clustering. FigJam and Whimsical
sit next to it. All four are surfaces for *arranging*.

### Research canvases — Heptabase (~$8.99), Scrintal (~$9.99), Kosmik, Muse

Long-lived canvases where every source is a real linked note; whiteboard-in-
whiteboard nesting; PDF annotation and citations. Excellent at *understanding*.

The seam: they end in understanding. Nothing here produces the work. And they
ask for a good deal of structure to stay useful.

### AI knowledge systems — Fabric, Mem, Tana, Capacities, Reflect

The strongest claim to Brainstorm's "you don't have to file it" line. Fabric's
Memory Engine extracts and maps relationships across every file type; Mem
organises without folders and surfaces related notes.

The seam: these are **retrieval** systems. You ask, they answer. There is no
spatial thinking, and nothing acts. Tana is the opposite failure — it asks you
to design supertags, fields and queries, which is building a system rather than
having one.

### AI mind maps — MyMap, MindMeister, Xmind AI, Whimsical AI

Chat-to-map. Prettier maps, faster. MindMeister→MeisterTask is the nearest
thing to concept-to-execution in this band, and it is task *export*.

The seam: **the map is the deliverable.** You still do all of the work.

### Agentic workspaces — Notion 3.0, Figma AI, Adobe Firefly, ImagineArt

This is the real competition and it is moving fast. Notion 3.0 rebuilt around
autonomous agents doing multi-step work over 20 minutes; Custom Agents on
schedules and triggers since February; **over a million agents built.** Figma
shipped a Design Agent in May; Adobe's Firefly Assistant sequences five Creative
Cloud apps from one instruction.

The seams, and they are real:

- **Notion needs the structure first.** Its unit is a page or a database row.
  You cannot dump a half-formed thought into Notion and have the shape emerge —
  you choose a database, a template, a set of properties. It is a workspace
  control layer, sold to teams.
- **Figma / Adobe / ImagineArt produce assets, not decisions.** They make the
  image. They have no opinion about whether it is the right image, what it is
  for, or what has to happen before it.

### Execution — Sunsama, Motion, Amie

Task-first. They assume you already know what the work is. That assumption is
the thing creative work never satisfies.

---

## 2. The gap everybody leaves

Two findings recur and they are the same finding:

1. Boards fail *after capture* — the point at which something has to happen.
2. Second-brain tools die in a documented pattern: **initial excitement →
   capture a lot → manual organisation becomes overwhelming → abandon.** People
   describe becoming digital hoarders with a graveyard of forgotten ideas.

So the market is split between tools that make capture pleasant and then strand
you, and tools that will act but demand you build a system before they will.

**Nobody owns the arc.** Concept → shape → decision → the thing itself.

---

## 3. What Brainstorm actually is, against that

Stated honestly, from what the code does today:

| Stage | Brainstorm | Nearest rival | Who wins |
| --- | --- | --- | --- |
| Capture with zero decisions | Hold the sky, write. Nothing is filed. | Mem, Fabric | **Draw** — but they file into a list, we file into nothing |
| Make sense of a dump | `organize` splits, types, groups and threads it | Miro AI clustering | **Brainstorm** — theirs clusters stickies, ours creates typed thoughts and edges |
| Spatial thinking | The sky: drops, pools, threads, nesting | Milanote, Heptabase | **Rivals** on beauty and reference handling; **Brainstorm** on it meaning something |
| Deciding what follows | `rain` condenses a saturated cloud into real actions *under* it | MindMeister→MeisterTask | **Brainstorm** — theirs exports nodes as tasks, ours reads across the group and says what it turned out to be about |
| Finding things out | `answer`, live web search, cited, `asOf` honesty | Notion AI, ChatGPT | **Draw**, but ours lands in the map rather than a chat log |
| **Producing the deliverable** | `draft` writes the actual thing | Notion agents; Figma/Adobe for assets | **Contested — the most important square on the board** |
| One thing at a time | The Current shows exactly one | Sunsama, Motion | **Draw** |
| Learning you | Memory that reconciles — adds, corrects, archives, supersedes — with a visible trail | Fabric Memory Engine | **Brainstorm** on honesty; theirs is bigger but you cannot see it change its mind |
| Closing the loop | `evaporate` — finishing can put a new thought in the air | *nobody* | **Brainstorm, uncontested** |

### The one-line position

> Everyone else helps you **arrange** ideas or **retrieve** them.
> Brainstorm is the only place where the surface you think on and the thing that
> does the work are the same surface — and where finishing something puts
> something new in the air.

Or, for a creative who has used the others:

> Milanote for the concept. Notion for the plan. ChatGPT for the draft.
> Brainstorm is all three, and it remembers how you write.

---

## 4. Where we are genuinely weaker

This has to be said plainly or the strategy is wishful.

1. **Visual references are not first-class.** A fashion designer's concept work
   is mostly images. A photo is a drop with a thumbnail; there is no moodboard,
   no web clipper, no PDF, no video, no colour. Milanote, Kosmik and Fabric all
   beat us badly here, and for the target user it is the *first* thing they do.
2. **The deliverable cannot leave.** `draft` writes a buyer note and it lives in
   a page inside a PWA. No export, no copy-as-markdown, no send. "Concept to
   execution" is not true if execution cannot be sent to a buyer.
3. **Nothing comes in from the world.** No share sheet, no email-in, no clipper,
   no import except one legacy blob. Everything must be typed or dictated here.
   iOS PWAs cannot register a share target, which makes this genuinely hard —
   worth naming rather than wishing away.
4. **No collaboration at all.** Fine for one person; fatal the moment a second
   person is involved, and VENIA is two people.
5. **Time barely exists.** `due_date` is stored and mostly ignored. A shoot in
   three weeks should press on everything; it does not.
6. **The metaphor has no door.** The water world is the best thing about the app
   and a stranger will not know what to do with it. There is no onboarding.

---

## 5. Six moves, ranked by how much wedge they buy

### Tier 1 — the two that decide whether creatives can use it at all

**1. Make references first-class, and then do the thing nobody else does with
them.** Milanote *holds* your references. The move is not to match that — it is
to **read them**. `organize` already accepts images. Extend it so a cloud of
references can be named and rained: *"these eleven images are all about light
falling through fabric, and none of them are about the clothes."*

That is a sentence no competitor in any band can produce, and it is exactly what
a designer wants at the concept stage. Holding references is table stakes;
having an opinion about them is the product.

**2. Let the work leave.** `draft` → copy as markdown, share sheet, mail. One
afternoon of work, and it is the difference between a demo and a tool. Until
this exists the funnel dead-ends one inch from the finish.

### Tier 2 — sharpen what is already unique

**3. A deliverable you can push back on.** A brief is currently a snapshot. Let
it be revised in place: *"shorter"*, *"aimed at buyers, not press"*, *"lose the
third paragraph"*. `reshape` already does this for the map; the same shape for a
draft turns a one-shot generator into a collaborator, which is the whole
difference between Brainstorm and a prompt box.

**4. Let time press on the world.** The world already carries the hour and the
tide, and that is the thing Brainstorm does better than anything else — state
carried by weather rather than by UI. A deadline closing in should be visible
*in the sky*, not as a red badge. Nobody else can do this, because nobody else
has a world.

### Tier 3 — the moat

**5. Memory as a voice, said out loud.** It already learns things like *"writes
to buyers in plain sentences, never bullet lists."* After three months of use,
`draft` should write like you — and the app should be willing to show you the
profile it has built and let you correct it. Fabric and Mem have bigger memory
engines; neither turns memory into *authorship*. This is the hardest thing for a
competitor to copy because it only exists after months of your use.

**6. The demo is the front door.** A working demo already exists and now shows
every action including ⚡. Ship it as the landing page. For a product whose whole
argument is "this feels different", a two-minute play beats any copy.

---

## 6. The competitive risk worth watching

Notion. A million agents, a developer platform, and enough money to add a canvas
whenever it wants.

The defence is not features — it is that Notion's unit is a page and ours is a
thought. They cannot make an app where you dump a half-formed sentence and the
shape emerges, because their entire value is the structure you build first.
Every feature they add makes that truer, not less true.

So the moat is depth in the arc, phone-first, and the world. None of the three
is on Notion's roadmap, and all three get stronger the longer one person uses
them.

---

## Sources

- [Milanote alternatives — where boards stop supporting the work](https://storyflow.so/blog/best-milanote-alternatives-2026)
- [Miro vs Milanote](https://mockflow.com/blog/miro-vs-milanote)
- [Milanote pricing and limitations](https://toolradar.com/tools/milanote/pricing)
- [Best infinite canvas tools 2026](https://storyflow.so/blog/best-infinite-canvas-tools-2026)
- [Heptabase alternatives and positioning](https://storyflow.so/blog/best-heptabase-alternatives-2026)
- [Scrintal alternatives](https://toolfinder.com/alternatives/scrintal)
- [Fabric — the AI workspace comparison pages (vendor)](https://fabric.so/comparison)
- [Notion turned its workspace into a hub for AI agents — TechCrunch](https://techcrunch.com/2026/05/13/notion-just-turned-its-workspace-into-a-hub-for-ai-agents/)
- [Notion custom agents, February 2026](https://virtualassistantva.com/news/notion-ai-custom-agents-autonomous-workspace-automation-february-2026)
- [Best AI agents for creative teams — tool vs agent distinction](https://www.imagine.art/blogs/best-ai-agents)
- [AI mind map generators, tested](https://storyflow.so/blog/ai-mind-map-generator-2026)
- [Second brain apps — the abandonment pattern](https://buildin.ai/blog/best-second-brain-apps-2026)
