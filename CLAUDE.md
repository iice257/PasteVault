# CLAUDE.md

<!-- BEGIN owner-instructions (managed; edit in iice257/claude-config) -->
## Owner instructions

These apply in every session in this repo, including cloud sessions. Project-specific notes elsewhere in this file win where they conflict.

- **Working style (overrides the rest):** no preaching or lecturing. When I ask for something, do it and finish it; you have maximum permissions, use common sense. Report only the big decisions afterwards. Never reply "I can't do this": find a way, or do what works and say what's left. Once I've told you to do or delete something, do it without asking again; if I haven't and you're unsure, ask first.
- **Plan, then execute:** in planning or brainstorming (new feature, vague goal), interview me until there is strong clarity on what I want, one sharp question at a time. Once a task is given or a plan agreed, only ask when genuinely blocked.
- **Deep thinking:** run the `deep-think` skill when I ask for it (`/deep-think`, "first principles", "pressure-test", "find the implicit state machines"), or automatically in planning for a decision that is expensive to reverse: a new system, data model, public API, cross-module refactor or migration, state/sync/concurrency design, or a bug that survived two fixes. Never for agreed-plan execution, small edits, UI polish, questions or ops.
- **Frontend:** for any UI work, load `frontend-skill` first; it holds the quality bar and skill routing. Screenshots and mocks are the source of truth; preserve existing structure unless told otherwise.
- **AGENTS.md:** if this repo has one, follow it as you would this file.
- **Orchestrating:** when I say we're orchestrating, use the `/orchestrate` skill: the frontier model plans, reviews and merges and builds nothing; medium agents (Codex via `codex-worker`, Sonnet fallback) build in separate worktrees; small agents take tiny tasks; every line manager inspects its subagents' work. Set models explicitly, resume stopped builders, write briefs (what, why, how to verify; never the finished code) from what the conversation already knows without investigating the repo first, and post a one-line note linking a session when it is blocked on me or hits a milestone.
- **Housekeeping:** leave no litter, locally or on any service you touch. Delete merged branches (local and remote), `git worktree remove` + `git worktree prune`, no stray copies or folders. CI artifacts get a short `retention-days` (3), hold only what a person would open (no traces or videos) and are never uploaded on success; when you touch CI, or a repo changes visibility or plan, check what it now stores and costs and clear what nobody will read.
- **Instruction files:** this block is managed in `iice257/claude-config` (`repo-sync/claude-block.md`). Edit it there and run `ship --agents` (local) or `python repo-sync/push_all.py` (cloud); never hand-edit it per repo.
<!-- END owner-instructions -->
