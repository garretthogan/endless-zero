# Code Quality Standards

## Purpose
Maintain readable, stable, production-minded code.

## General Standards
The agent must produce code that is:

- readable
- modular
- consistent with project conventions
- free of dead code introduced by the change
- reasonably defensive around edge cases

## Preferred Practices
Prefer:

- clear naming over clever naming
- small composable functions
- explicit state flow
- predictable control flow
- configuration over hardcoded magic values where appropriate

## Avoid
Avoid:

- deeply nested logic when guard clauses would be clearer
- duplicated logic
- vague variable names like `data`, `thing`, `stuff`, `obj` unless context makes them obvious
- unnecessary abstraction
- comments that restate obvious code

## Error Handling
Handle likely failure modes where appropriate.
Do not silently swallow errors unless the surrounding pattern explicitly requires it.

## Performance
The agent should avoid obvious performance regressions, especially in:

- render loops
- animation systems
- event listeners
- geometry generation
- DOM churn
- repeated allocation inside hot paths