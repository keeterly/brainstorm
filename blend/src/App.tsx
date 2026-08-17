// The whole game, arranged: a sky you play in, four buttons, and the two
// cards that bracket it. The home page is the game — there is no menu to get
// through first, no splash to sit behind. It opens in the sky it left you in.
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { Board } from '@/play/Board'
import { LEVELS, levelById } from '@/game/levels'
import { apply, hue, initial, won as isWon, type Move, type State } from '@/game/rules'
import { hint as findHint, par, solve } from '@/game/solve'
import { finished, load, save, type Save } from '@/game/save'
import { tint } from '@/game/color'

export default function App() {
  const [record, setRecord] = useState<Save>(() => load())
  const [id, setId] = useState(() => Math.min(LEVELS.length, load().done + 1))
  const level = useMemo(() => levelById(id), [id])
  const [state, setState] = useState<State>(() => initial(levelById(id)))
  const [past, setPast] = useState<State[]>([])
  const [say, setSay] = useState<string | null>(null)
  const [hint, setHint] = useState<Move | null>(null)
  const [sheet, setSheet] = useState<'title' | 'levels' | 'won' | null>(
    load().greeted ? null : 'title',
  )

  const won = isWon(state)
  const parMoves = par(level)

  const start = useCallback((n: number) => {
    setId(n)
    setState(initial(levelById(n)))
    setPast([])
    setHint(null)
    setSay(null)
    setSheet(null)
  }, [])

  const move = useCallback(
    (m: Move) => {
      setPast((p) => [...p, state])
      setState((s) => apply(s, level, m))
      setHint(null)
    },
    [level, state],
  )

  const undo = useCallback(() => {
    if (!past.length) return
    setState(past[past.length - 1])
    setPast(past.slice(0, -1))
    setHint(null)
    setSay(null)
  }, [past])

  const restart = useCallback(() => {
    setState(initial(level))
    setPast([])
    setHint(null)
    setSay(null)
  }, [level])

  // Winning is quiet for a moment — the core takes its last drop, swells, and
  // only then does anything appear over the top of it.
  useEffect(() => {
    if (!won) return
    setRecord((r) => finished(r, level.id, state.moves))
    const t = window.setTimeout(() => setSheet('won'), 1150)
    return () => window.clearTimeout(t)
  }, [won, level.id, state.moves])

  // A sky with no way home says so, rather than letting you play on into a
  // wall. It is never a game over: undo is right there, and so is the way back.
  const stuck = useMemo(() => !won && solve(state, level) === null, [state, level, won])

  const askHint = () => {
    const m = findHint(state, level)
    setHint(m)
    setSay(m ? words(m) : 'nothing from here — undo a move')
    window.setTimeout(() => setSay(null), 2600)
  }

  const line = say ?? (stuck ? 'no way home from here — undo a move' : state.moves === 0 ? level.note : null)

  return (
    <div className="app" style={{ '--core': tint(hue(level.target)) } as CSSProperties}>
      <div className="sky" />
      <Board level={level} state={state} won={won} hint={hint} onMove={move} onSay={setSay} />

      <header className="bar top">
        <div className="who">
          <b>{level.name}</b>
          <span>
            {level.id} of {LEVELS.length} · no drop over {level.cap}
          </span>
        </div>
        {/* The scarce thing, and so the big number: how many more drops the
            core will take. The cap says a drop cannot be too big; this says
            there cannot be too many of them. Everything else is arithmetic
            between the two. */}
        <div className={`count${state.takes === 0 && !won ? ' spent' : ''}`}>
          <b>{state.takes}</b>
          <span>{state.takes === 1 ? 'last arrival' : 'arrivals left'}</span>
        </div>
      </header>

      <p className={`line${line ? ' show' : ''}${stuck && !say ? ' warn' : ''}`}>{line}</p>

      <nav className="bar bot">
        <button onClick={() => setSheet('levels')} aria-label="levels">
          ⠿<i>skies</i>
        </button>
        <button onClick={undo} disabled={!past.length} aria-label="undo">
          ↺<i>undo</i>
        </button>
        <button onClick={restart} aria-label="start over">
          ⟳<i>again</i>
        </button>
        <button onClick={askHint} aria-label="hint">
          ?<i>hint</i>
        </button>
      </nav>

      {sheet === 'title' && (
        <Card>
          <h1>Blend</h1>
          <p className="lede">
            A sky full of colour, and one core in the middle of it. Drag a drop into another and
            they blend — red and yellow make orange, and two reds make a bigger red. Drag a drop
            into the core when it is the core's colour.
          </p>
          <p className="lede">
            Two numbers decide everything. <b>No drop may hold more than the cap</b>, so you cannot
            pour the whole sky into one ball. <b>The core opens only so many times</b>, so you
            cannot hand it over a drop at a time either. Which two go together is the whole game.
          </p>
          <button
            className="go"
            onClick={() => {
              setRecord((r) => save({ ...r, greeted: true }))
              setSheet(null)
            }}
          >
            Begin
          </button>
        </Card>
      )}

      {sheet === 'levels' && (
        <Card onClose={() => setSheet(null)}>
          <h2>Skies</h2>
          <div className="grid">
            {LEVELS.map((l) => {
              const open = l.id <= record.done + 1
              return (
                <button key={l.id} className="cell" disabled={!open} onClick={() => start(l.id)}>
                  <b>{l.id}</b>
                  <span>{open ? l.name : 'held'}</span>
                  <i>{record.best[l.id] ? `${record.best[l.id]} moves` : open ? '—' : ''}</i>
                </button>
              )
            })}
          </div>
        </Card>
      )}

      {sheet === 'won' && (
        <Card>
          <h2>One colour.</h2>
          <p className="lede">
            {level.name} in {state.moves} {state.moves === 1 ? 'move' : 'moves'}
            {state.moves <= parMoves ? ' — par.' : `, par ${parMoves}.`}
          </p>
          <div className="row">
            {level.id < LEVELS.length ? (
              <button className="go" onClick={() => start(level.id + 1)}>
                Next sky
              </button>
            ) : (
              <button className="go" onClick={() => setSheet('levels')}>
                Every sky
              </button>
            )}
            <button className="quiet" onClick={restart}>
              Again
            </button>
          </div>
        </Card>
      )}
    </div>
  )
}

function Card({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <div className="card-wrap" onPointerDown={onClose}>
      <div className="card" onPointerDown={(e) => e.stopPropagation()}>
        {children}
        {onClose && (
          <button className="x" onClick={onClose} aria-label="close">
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

/** The hint, in the fewest words that are still an instruction. */
function words(m: Move): string {
  if (m.kind === 'merge') return 'two of these belong together — they are lit'
  if (m.kind === 'pass') return 'this one can leave its skin'
  return 'this one is the core’s colour'
}
