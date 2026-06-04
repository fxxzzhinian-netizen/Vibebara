# skill-forge

Unified skill authoring tool for **Cursor**, **Codex** and **Windsurf**. Define your skill once, build and deploy to all platforms.

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
skill-forge build --target windsurf
skill-forge build --target all
```

Output goes to `dist-skill/<target>/`.

### Deploy to platform

```bash
skill-forge deploy --target cursor     # -> ~/.cursor/skills/
skill-forge deploy --target codex      # -> ~/.codex/skills/
skill-forge deploy --target windsurf   # -> ~/.codeium/windsurf/skills/
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
  windsurf:
    description: "Override for Windsurf"
```

## Windsurf notes

Windsurf (Cascade, Wave 8+) skills use the same `SKILL.md` folder format as Cursor
(frontmatter: `name` + `description`). Deploy directories:

- workspace/project: `{project}/.windsurf/skills/{id}/`
- global: `~/.codeium/windsurf/skills/{id}/` (note: under `~/.codeium`, not `~/.windsurf`)

`migrate --target windsurf` is also supported.

## Development

```bash
npm run build    # Compile TypeScript
npm run test     # Run tests
npm run lint     # Type check
```

## License

MIT
