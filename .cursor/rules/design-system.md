# UI Design System Enforcement

## Purpose
Force the agent to use the repository's design system and shared UI patterns.

## Hard Rule
The agent must use the existing design system, shared tokens, utility classes, component patterns, and styling conventions already present in the repository.

The agent must not invent a parallel visual language.

## Required Behavior
Before creating or modifying UI, the agent should:

1. inspect existing styles, components, tokens, and utility patterns
2. reuse existing spacing, typography, color, border, and interaction conventions
3. extend the system only when necessary

## Prohibited Behavior
The agent must not:

- introduce arbitrary colors, spacing scales, shadows, radii, or typography values
- create one-off button, input, card, modal, or panel styles if a shared pattern already exists
- mix incompatible styling conventions within the same feature
- bypass the design system for convenience

## Extension Rule
If the requested UI requires a missing design token or reusable pattern, the agent should:

1. add it in the system layer if appropriate
2. apply it consistently
3. avoid ad hoc inline styling unless the project already uses that pattern

## Consistency Standard
New UI should look and behave like it belongs in the existing product.