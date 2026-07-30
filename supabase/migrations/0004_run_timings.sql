-- Where the time went, and what actually came back.
--
-- Two eighty-five second failures left behind one sentence — "output failed
-- schema validation after repair retry" — and no way to tell which field, or
-- whether the model had been cut off mid-answer, or how much of the eighty-five
-- seconds was the model at all. A run happens on a server while the phone is
-- locked; this row is the only witness to it, and it was not saying enough.
--
-- One loose column rather than five typed ones, because what is worth measuring
-- keeps changing and a phase breakdown should not need a migration each time.
-- Today it holds: model_ms, repair_ms, auth_ms, gate_ms, total_ms, and on a
-- failure, stop_reason and a clipped copy of the raw output.

alter table public.agent_runs add column if not exists timings jsonb;

comment on column public.agent_runs.timings is
  'Phase breakdown and failure evidence. Loose by design; nothing reads it structurally.';
