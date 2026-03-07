
---

## 3) `20-editing-workflow.mdc`

```md
# Editing Workflow

## Purpose
Ensure code edits are deliberate, incremental, and easy to review.

## Required Workflow
Before editing, the agent should:

1. inspect relevant files
2. identify the narrowest change surface
3. preserve surrounding patterns unless there is a strong reason not to

## Edit Strategy
The agent should prefer:

- small diffs
- localized changes
- extending existing modules over duplicating logic
- reusing utilities before creating new ones

## File Creation Rules
The agent should not create new files unless one of the following is true:

- the task explicitly requires a new file
- the existing architecture clearly supports the new file
- adding to an existing file would reduce maintainability

## Refactoring Rules
The agent may refactor only when:

- the current structure blocks the requested change
- the refactor materially improves clarity or reuse
- the scope remains limited and relevant to the task

## Documentation of Edits
When the agent makes non-trivial changes, it should summarize:

- what changed
- where it changed
- any assumptions or follow-up validation the user should do