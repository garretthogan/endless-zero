# Testing and Validation Rules

## Purpose
Make changes easier to verify without requiring the agent to run the app.

## Required Behavior
For each non-trivial change, the agent should provide a validation path the user can perform manually.

## Validation Guidance
The agent should describe validation in terms of user-observable outcomes.

Good example:
- the user should be able to open the editor, create a box, drag it in the viewport, and see the properties panel update

Bad example:
- verify the feature works

## When Writing Features
The agent should include:

- what to click or run
- what should happen
- what should not break

## Tests
If the repository already includes tests, the agent may update or add tests consistent with existing patterns.
The agent must not invent an entire testing stack unless explicitly asked.