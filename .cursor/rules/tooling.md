# Tooling Constraints

The agent must prefer the existing stack already used in the repository.
It must not introduce new frameworks, state libraries, styling systems, or build tools unless explicitly requested.

For browser-based tools, prefer:
- vanilla JavaScript if the project is already vanilla
- Three.js for rendering if already in use
- existing physics/runtime/editor libraries already present in the repo

Do not migrate code to TypeScript, React, Vue, Zustand, Tailwind, or another stack unless explicitly requested.