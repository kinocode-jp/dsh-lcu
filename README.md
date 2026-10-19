# @kinocode/dsh-lcu

[日本語](README.ja.md) | English

[LCU](https://github.com/amontlabs/lcu) (Codex computer use, decoupled from the Codex app) as a
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin. The agent gets
`mcp__lcu__js` / `mcp__lcu__js_reset` to read and operate native macOS apps.

DSH's stock `dsh-mcp-client` cannot answer LCU's per-app approval requests (MCP *elicitation*), so a plain
MCP mount fails with `createElicitation is unavailable`. This plugin launches LCU behind a small adapter
(`lib/adapter.mjs`) that handles approval.

## Requirements
- macOS (Apple Silicon) with the official **ChatGPT desktop app** installed
- **LCU** installed, e.g. `~/.local/share/lcu` ([installation guide](https://github.com/amontlabs/lcu/blob/main/docs/INSTALLATION.md)); `--runtime-only` is enough
- macOS permissions: Accessibility (ChatGPT Computer Use) and Screen Recording (ChatGPT)

## Install
```sh
dsh plugin --profile desktop add @kinocode/dsh-lcu
```
Restart DSH and start a new session. Other LCU location: set `prefix` (below) or `LCU_PREFIX`.

## Approval modes
Set in your profile patch:
```yaml
- id: lcu
  config:
    approval: ask      # ask (default) | all | deny
```
| `approval` | Behavior |
|---|---|
| `ask` | A macOS dialog asks you: Deny / Allow this time / Always allow (Touch ID, same as `lcu apps allow`). Closed, timed out, or answered faster than a human → denied |
| `all` | Approve every app without asking |
| `deny` | Always deny |

In every mode the adapter refuses apps the agent could use to approve itself: DSH, terminals, Claude,
`osascript` / System Events. Other config: `prefix`, `toolCallTimeoutMs`.

## What the adapter does
- Exposes only `js` and `js_reset` (host-only tools such as `turn_ended` are hidden)
- Saves screenshots as files under `$TMPDIR/dsh-lcu-shots/` and returns the path (view with `read_image`),
  because the MCP client turns images into placeholders
- Reconnects to LCU on the next call if it exits

## Safety
`all` lets the agent operate any app, including browsers and password managers. Prefer `ask`.
This is an unofficial community plugin; it is not affiliated with OpenAI or amontlabs. The ChatGPT app and
its runtime keep their own terms; this package contains neither.

## License
MIT
