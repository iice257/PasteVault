---
name: deep-think
description: Pressure-test a design, plan or codebase from first principles before committing to it. Use when the user types /deep-think or asks to "think deeply", "first principles", "pressure-test", "what would an architect rewrite", or "find the implicit state machines / invariants"; or automatically during PLANNING for an expensive-to-reverse decision (new system, data model or schema, public API, cross-module refactor or migration, state/sync/concurrency design, a bug that survived two fix attempts). Do NOT use for executing an agreed plan, single-file edits, UI polish, copy, questions, or ops.
---

# Deep Think

Five lenses, run in order, each building on the last. The goal is a better decision, not a longer answer: every lens must change or confirm something concrete.

## Gate (check first)

Run only if one is true:
1. The user invoked it explicitly (command or trigger phrase).
2. We are in planning (nothing agreed yet) AND the decision is expensive to reverse: new system/app, data model, public API/protocol, cross-module refactor/migration, state/sync/concurrency design, or a bug that has survived two fixes.

If the automatic gate opened, say so in one line ("Running deep-think: this sets the data model") and continue; the user can say "skip". If neither is true, don't run it.

## Ground first

Read the actual code, spec or plan before theorizing. Name the 3-6 files, modules or documents that matter. Abstract thinking about code you haven't read is guessing.

## The five lenses

1. **Irreducible constraints.** Strip the problem to what *must* be true: inputs, outputs, invariants, hard limits (latency, cost, platform, data size, people). Mark each as *physics* (can't change) or *choice* (inherited and changeable). Most bad designs treat choices as physics.
2. **Rebuild from zero.** Using only the physics constraints, sketch the simplest design that satisfies them, as if nothing existed. Compare it with the current or proposed design: where do they differ, and is each difference justified?
3. **The principal architect's first rewrite.** What would a senior architect change *before* starting? Name 1-3 rewrites, each with the cost of not doing it. Usual suspects: wrong source of truth, state duplicated in two places, a boundary in the wrong spot, a missing abstraction, a premature one.
4. **The day-one breaking test.** Design the single most damaging realistic test: concrete input/sequence, expected vs. actual. Prefer races, retries, partial failure, empty/huge input, clock or ordering issues, a second user, offline/reconnect. If it can be written as a real test now, write it.
5. **The disappearing abstraction.** What higher-level concept would make this whole class of problem go away (a state machine, an event log, a declarative config, an existing library or platform feature, deleting the feature)? Say honestly whether it is worth it here or overkill.

## Audit mode: implicit state machines

When asked to "find the implicit state machines" (or invariants) in an app:
- Hunt for clusters of booleans/enums/nullable fields that together encode a state (`isLoading` + `error` + `data`, `status` strings, `step` counters, flags toggled in effects, timers, retry counters, websocket/connection status, auth/session, multi-step forms, upload/playback/queue lifecycles).
- For each: file:line, the states actually reachable, the transitions and who triggers them, and **impossible-but-representable states** (e.g. loading and error at once) plus missing transitions (cancel, retry, timeout, unmount).
- Rank by risk (bugs plausible today first). For the top ones, propose an explicit model (discriminated union, reducer, XState/statechart, DB status column with allowed transitions) and the smallest migration path.
- Use an Explore subagent to sweep large codebases; verify each finding by reading the code before reporting it.

## Output

Keep it tight. One short section per lens (bullets, not essays), then:

**Verdict:** keep / adjust / rethink, in one sentence.
**Changes to the plan:** a numbered list of concrete edits, or "none".
**Breaking test:** the one from lens 4, ready to paste.

Then return to the normal flow: in planning, fold the verdict into the plan and keep interviewing; never start building on the strength of a deep-think alone.
