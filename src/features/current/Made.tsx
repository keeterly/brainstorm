// The work, where the work was.
//
// The same argument as Answered: the sky can hand you a brief and let you open
// it, and the Current cannot. There is one thing on this screen, you are
// looking straight at it, and when the agent has just written the thing the
// thing belongs right underneath, already open. Nobody waits a minute for a
// draft and then goes looking for where it was filed.
//
// Rendered by the same walker the brief reader uses, because a draft is
// markdown that came off a model and the one thing that must never happen is
// markup from a model reaching the page as markup.
import { briefHtml } from '@/features/sky/SkyPage'

export function Made({
  title,
  md,
  sources = [],
  done,
  onDone,
}: {
  title: string
  md: string
  /** what it looked up, if anything — a draft that cites is one you can check */
  sources?: { title: string; url: string }[]
  done: boolean
  onDone?: () => void
}) {
  return (
    <div className="card" style={{ marginTop: 18, textAlign: 'left' }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        {title}
      </div>
      {/* The draft itself, rendered by the brief reader's walker and styled by
          `.made` — the same shapes it makes on paper, read in this room's
          light rather than the sky page's. */}
      <div className="made" dangerouslySetInnerHTML={{ __html: briefHtml(md, sources) }} />
      {onDone && (
        <button
          className={done ? 'btn btn--primary btn--sm' : 'btn btn--ghost btn--sm'}
          style={{ marginTop: 14 }}
          onClick={onDone}
        >
          {/* It said the work is finished. Offered, never taken: the agent does
              not get to tick your list. */}
          {done ? '✓ That’s it — done' : 'Mark it done'}
        </button>
      )}
    </div>
  )
}
