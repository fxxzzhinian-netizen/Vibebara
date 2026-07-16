---
name: vibebara-skill-collaboration
description: Use Vibebara CLI to inspect, merge, push, or pull a deployed Skill.
---

# Vibebara Skill Collaboration

Use the `vibebara` shell command instead of editing cloud collaboration state
directly.

1. Run `vibebara status --json` and inspect the deployment state.
2. For a conflict, run `vibebara merge <skill> --preview --json`.
3. Do not submit when `manual_conflicts` is non-empty or
   `merge_available=false` until a human has reviewed the merged draft.
4. After approval, run `vibebara --yes merge <skill> --json`.
5. Use `vibebara push <skill> --json` for local-only changes.
6. Use `vibebara pull <skill> --json` only when local changes may be replaced;
   add `--overwrite` only after explicit approval.

Interpret exit codes:

- `3`: repository/local conflict; do not retry blindly.
- `4`: manual merge review required.
- `5`: CLI authorization required.
- `6`: wrong machine, moved checkout, missing path, or local disk failure.

Never print, log, or request the full `vhk_` API key. If authorization is
missing, ask the user to choose **为 CLI 授权** in Vibebara Desktop.
