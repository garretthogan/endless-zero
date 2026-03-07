# Project Architecture Rules

## Purpose
Keep the codebase coherent as features are added.

## Architectural Principles
The agent should preserve separation of concerns:

- rendering logic should be separate from state management where practical
- UI code should be separate from domain logic
- configuration should be centralized when reused
- utilities should remain generic and focused

## Reuse Rules
Before adding new helpers, the agent should check whether:

- a utility already exists
- a pattern already exists elsewhere in the project
- the feature can extend an existing module cleanly

## State Management
The agent should:

- keep state shape predictable
- avoid hidden mutation unless the project pattern explicitly allows it
- minimize cross-module coupling
- avoid scattering feature state across unrelated files

## Public API Discipline
If modifying reusable modules, the agent should avoid breaking public interfaces unless required by the task.
If a public interface changes, update all obvious call sites.