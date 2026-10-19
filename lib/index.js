// Host half of @kinocode/dsh-lcu. Mounts LCU (Codex computer use) as the MCP server `lcu`
// through DSH's own @deepseek-ai/dsh-mcp-client, but launches it behind ./adapter.mjs,
// which answers LCU's per-app approval requests (the stock MCP client cannot).
//
// Config (all optional):
//   approval  'ask' (default) | 'all' | 'deny'   -> DSH_LCU_APPROVAL for the adapter
//   prefix    LCU install prefix (default: $LCU_PREFIX or ~/.local/share/lcu)
//   toolCallTimeoutMs  per js call timeout (default 180000)
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as mcpClient from '@deepseek-ai/dsh-mcp-client'

export const name = 'dsh-lcu'

const ADAPTER = fileURLToPath(new URL('./adapter.mjs', import.meta.url))

function resolveNode(prefix) {
  try {
    const p = readFileSync(path.join(prefix, 'current', 'node-path'), 'utf8').trim()
    if (p) return p
  } catch {}
  return 'node'
}

export function apply(ctx, config = {}) {
  const prefix = config.prefix || process.env.LCU_PREFIX || path.join(homedir(), '.local/share/lcu')
  const approval = ['ask', 'all', 'deny'].includes(config.approval) ? config.approval : 'ask'
  ctx.plugin(mcpClient, {
    serverName: 'lcu',
    transport: 'stdio',
    command: resolveNode(prefix),
    args: [ADAPTER],
    env: { LCU_PREFIX: prefix, DSH_LCU_APPROVAL: approval },
    toolCallTimeoutMs: config.toolCallTimeoutMs ?? 180000,
  })
}
