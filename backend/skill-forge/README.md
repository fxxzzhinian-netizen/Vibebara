# skill-forge

Unified skill authoring tool for **Cursor** and **Codex**. Define your skill once, build and deploy to both platforms.

## Install

```bash
npm install
npm run build
```

## Usage

### Initialize a new skill

```bash
skill-forge init my-skill
```

This creates a `my-skill/` directory with a `skill.config.yaml` template.

### Validate config

```bash
cd my-skill
skill-forge validate
```

### Build for a target platform

```bash
skill-forge build --target cursor
skill-forge build --target codex
skill-forge build --target all
```

Output goes to `dist-skill/<target>/`.

### Deploy to platform

```bash
skill-forge deploy --target cursor   # -> ~/.cursor/skills/
skill-forge deploy --target codex    # -> ~/.codex/skills/
```

### Import an existing skill

```bash
skill-forge import --from cursor --path /path/to/cursor-skill
skill-forge import --from codex --path /path/to/codex-skill
```

## Unified Config Format

`skill.config.yaml` is the single source of truth:

```yaml
name: my-skill
displayName: "My Skill"
description: "Full description"
shortDescription: "Short desc"
version: "1.0.0"

instructions: |
  # My Skill
  Your instructions here.

triggers:
  disableModelInvocation: true   # Cursor
  allowImplicitInvocation: true  # Codex

ui:
  brandColor: "#3B82F6"

resources:
  scripts: [scripts/]
  references: [references/]
  assets: [assets/]

targets:
  cursor:
    description: "Override for Cursor"
  codex:
    description: "Override for Codex"
```

## Development

```bash
npm run build    # Compile TypeScript
npm run test     # Run tests
npm run lint     # Type check
```

## License

MIT
