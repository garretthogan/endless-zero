# Rule: Do Not Start Development Servers

## Purpose
Prevent the coding agent from starting development servers or running long-lived processes during development. The agent should only modify code, configuration, or scripts — not execute servers.

## Prohibited Actions
The agent must **never run commands that start development servers or watchers**, including but not limited to:

- `npm run dev`
- `npm start`
- `pnpm dev`
- `yarn dev`
- `vite`
- `next dev`
- `astro dev`
- `bun dev`
- `node server.js`
- `node index.js`
- `deno run --watch`
- `python -m http.server`
- `uvicorn`
- `docker compose up`
- `docker-compose up`
- `make dev`
- Any command that starts a **local HTTP server, websocket server, or file watcher**

## Allowed Actions
The agent **may**:

- Edit source code
- Create or modify configuration files
- Generate scripts or instructions for the user to run
- Explain how to start the server manually
- Suggest commands in text without executing them

## Required Behavior
If the task would normally require running a dev server, the agent must instead:

1. Implement the required code changes.
2. Provide instructions for the user to run locally.
3. Stop before executing any server command.

Example response:

User instructions:
