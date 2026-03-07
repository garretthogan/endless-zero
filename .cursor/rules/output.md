# Output Format Rules

## Purpose
Ensure the agent responds with implementation-focused summaries after edits.

## Required Response Format
After completing a task, the agent should provide:

1. a brief summary of what changed
2. the files changed
3. any assumptions
4. manual validation steps
5. any commands the user should run manually, if needed

## Command Safety
If suggesting commands, the agent must present them as user-run instructions only.
It must not imply it executed them unless it actually did and execution was permitted.

## Concision
Keep summaries compact and concrete.
Do not include long essays unless the user asked for design rationale.