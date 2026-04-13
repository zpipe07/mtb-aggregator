# Workflow playbooks (on demand)

Longer **phase-based workflows** from [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) live here. They are **not** Cursor `.mdc` rules: they do not auto-attach by file path. **Invoke** them by `@`-mentioning a `SKILL.md` (or this README) when you want a structured process.

**Start here:** [`using-agent-skills/SKILL.md`](using-agent-skills/SKILL.md) — decision tree, lifecycle order, and quick-reference table.

Stack- and tool-specific skills (shadcn, TanStack Query, Neon, Storybook, etc.) stay in [`.agents/skills/`](../) beside this folder.

## Cursor native rules (automatic)

Only [`.cursor/rules/*.mdc`](../../../.cursor/rules/) participate in Cursor’s rule system (`alwaysApply` / `globs`).

| File | Mode |
|------|------|
| `documentation-sync.mdc` | Always |
| `posthog-analytics.mdc` | Always |
| `go-api.mdc` | Auto — `apps/api/**/*.go` |
| `scraper-parsers.mdc` | Auto — `apps/scraper/src/parsers/**/*.ts` |
| `component-library.mdc` | Auto — `apps/web/src/**/*.tsx` |
| `react-admin.mdc` | Auto — `apps/web/src/admin/**/*.tsx` |
| `error-reporting.mdc` | Auto — API / web / scraper globs |

Confirm labels (**Always** / **Auto**) in **Cursor Settings → Rules** if your app version differs.

## All workflow folders

| Folder | Summary |
|--------|---------|
| [`api-and-interface-design`](api-and-interface-design/SKILL.md) | Stable interfaces and contracts |
| [`browser-testing-with-devtools`](browser-testing-with-devtools/SKILL.md) | Runtime verification with DevTools |
| [`ci-cd-and-automation`](ci-cd-and-automation/SKILL.md) | Pipeline and automation |
| [`code-review-and-quality`](code-review-and-quality/SKILL.md) | Review and quality gates |
| [`code-simplification`](code-simplification/SKILL.md) | Reduce complexity deliberately |
| [`context-engineering`](context-engineering/SKILL.md) | Right context at the right time |
| [`debugging-and-error-recovery`](debugging-and-error-recovery/SKILL.md) | Reproduce → fix → guard |
| [`deprecation-and-migration`](deprecation-and-migration/SKILL.md) | Safe deprecations |
| [`documentation-and-adrs`](documentation-and-adrs/SKILL.md) | Docs and ADRs |
| [`frontend-ui-engineering`](frontend-ui-engineering/SKILL.md) | Production UI and a11y |
| [`git-workflow-and-versioning`](git-workflow-and-versioning/SKILL.md) | Commits and history |
| [`idea-refine`](idea-refine/SKILL.md) | Refine vague ideas |
| [`incremental-implementation`](incremental-implementation/SKILL.md) | Vertical slices |
| [`performance-optimization`](performance-optimization/SKILL.md) | Measure-first optimization |
| [`planning-and-task-breakdown`](planning-and-task-breakdown/SKILL.md) | Decompose work |
| [`security-and-hardening`](security-and-hardening/SKILL.md) | Security review patterns |
| [`shipping-and-launch`](shipping-and-launch/SKILL.md) | Launch checklist |
| [`source-driven-development`](source-driven-development/SKILL.md) | Verify against authoritative docs |
| [`spec-driven-development`](spec-driven-development/SKILL.md) | Spec before code |
| [`test-driven-development`](test-driven-development/SKILL.md) | TDD workflow |
| [`using-agent-skills`](using-agent-skills/SKILL.md) | Meta: which skill when |
