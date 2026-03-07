# Three.js Workflow Rules

## Purpose
Ensure the agent follows sound patterns when working with Three.js and browser-based 3D tools.

## Required Behavior
When working with Three.js code, the agent must:

- inspect existing scene setup, renderer setup, camera setup, and animation loop structure before editing
- preserve the current render architecture unless the task requires a change
- keep rendering, input, simulation, and editor logic reasonably separated
- prefer incremental changes over replacing the scene pipeline

## Documentation Rule
The agent should consult project-local patterns first.
If the repository includes Three.js guidance, wrappers, or conventions, those take precedence.
If external documentation consultation is part of the workflow, prefer official Three.js documentation and examples.

## Performance Rules
The agent should be careful about:

- object allocation inside animation loops
- unnecessary geometry regeneration
- repeated material creation
- leaking event listeners
- failing to dispose of geometries, materials, or textures when replaced
- excessive raycasting or traversal per frame

## Scene Graph Discipline
The agent should:

- name important objects clearly
- avoid deeply tangled parent-child relationships without reason
- keep editor gizmos/helpers separate from user content where possible

## Interaction Rules
For editor-style tools, the agent should preserve:

- deterministic input handling
- predictable transform behavior
- clear separation between selection state and render state

## Debug Behavior
The agent may add lightweight debug helpers if useful, but should avoid leaving noisy debug artifacts in final code unless requested.