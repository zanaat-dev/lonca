<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

<!-- baron:begin — managed by `baron init`; edit outside these markers -->

## Work tracking — route through Baron

Track work through **Baron**, not raw provider writes: it normalizes issues and source control across
providers behind one contract, so speak its abstract vocabulary, never a vendor's native states.

- **Roles, not native states.** Move work by role: `backlog → ready → in_progress → in_review → done`.
  Say "move it to in_progress", never "set the state to Active" — Baron maps the role to the provider.
- **Blocking is orthogonal, not a role.** `baron_issue_move { op: "block", id, reason }` and
  `{ op: "unblock", id }` set and clear a flag; the item keeps the role it is blocked in, so
  unblocking returns it to where the work actually was. A reason is required — an item blocked for no
  recorded reason is one nobody can unblock.
- **Type roles this policy maps:** `initiative`, `epic`, `story`, `task`, `bug`, `subtask`.
  Asking for one it does not map is an error, not a degrade — that list is what `issue.create`
  accepts here.
- **Tools:** every write takes an `op`. `baron_issue_read` (get / query / iterations / classify),
  `baron_issue_write` (create / update / comment / assign / link / set_iteration),
  `baron_issue_move` (transition / reconcile / block / unblock), `baron_scm_read` and
  `baron_scm_write` (branch_create / pr_create / pr_thread / pr_ready / pr_merge),
  `baron_recipe_list` + `baron_recipe_run`, and `baron_memory_append` / `baron_memory_query`
  for durable decisions and follow-ups. Call `baron_recipe_list` if you are unsure what exists —
  do not guess a tool name.
- **Daily loop — prefer the skills:** `/baron:task-new` (create), `/baron:task-start <id>` (cut the
  canonical branch, move to in_progress, assign you), `/baron:task-finish` (draft PR),
  `/baron:task-land` (undraft + merge — never `gh`/`az`), `/baron:task-move`,
  `/baron:task-list`, `/baron:task-sync`. Each item's canonical branch is Baron-derived — use it
  verbatim, never invent one.
- Reading/exploring a provider natively is fine, but make every work-item **change** through Baron so the
  role mapping, gap policy, and knowledge loop apply.

**On this project (provider: `github`):** roles ride labels (Baron provisions `in-progress` / `in-review` / `done`); sprints are NOT available — sprint queries degrade to empty. That empty is expected here, not a bug;
parent/child is emulated via a `parent:<id>` label. Where a capability is missing Baron negotiates it (error / emulate /
degrade) and logs it — an empty or emulated result from a degraded capability is expected behavior,
not a silent failure to report as a bug.
<!-- baron:end -->
