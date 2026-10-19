#!/usr/bin/env node
// dsh-lcu adapter: LCU の MCP サーバーを DSH 向けに包む stdio MCP サーバー。
//  - elicitation 対応の MCP クライアントとして LCU に接続する (dsh-mcp-client は非対応のため)
//  - アプリ承認 (elicitation): DSH_LCU_APPROVAL=ask (既定: ダイアログで尋ねる) / all (全アプリ自動許可) / deny (常に拒否)。
//    ask: 拒否 / 今回のみ / 常に許可(Touch ID)。ダイアログ不可・即答・危険なアプリは拒否 (fail closed)
//    どのモードでも、ホストアプリ・ダイアログ用アプリ (DENY_APP) は承認しない
//  - モデルには js / js_reset だけ見せる (turn_ended など host 専用ツールは隠す)
//  - 画像 (スクリーンショット) は PNG として保存し、パスをテキストで返す
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ElicitRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';

const PREFIX = process.env.LCU_PREFIX || path.join(homedir(), '.local/share/lcu');
const LCU = path.join(PREFIX, 'current/bin/lcu');
const SHOT_DIR = process.env.DSH_LCU_SHOT_DIR || path.join(tmpdir(), 'dsh-lcu-shots');
const MODEL_TOOLS = new Set(['js', 'js_reset']);
const SESSION = `dsh-lcu-${randomUUID()}`;
const log = (...a) => process.stderr.write(`[dsh-lcu] ${a.join(' ')}\n`);


// --- 承認ダイアログ -------------------------------------------------------
// モデルが LCU 経由でこのダイアログ (osascript / System Events 等) を押して自分で承認できないよう、
// それらと、エージェントのホストアプリ自身は承認対象から外す。
const DENY_APP = /osascript|system events|systemevents|scripteditor|script editor|usernotificationcenter|coreservices\.uiagent|deepseek|terminal|iterm|ghostty|warp|wezterm|alacritty|kitty|com\.openai\.codex|claude/i;
const MIN_HUMAN_MS = 500;
const MODE = (process.env.DSH_LCU_APPROVAL || 'ask').toLowerCase();
const pending = new Map(); // app -> Promise (同じアプリの同時要求をまとめる)

function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
}

function askUser(name, bundle, risk, canAlways) {
  const key = bundle;
  if (pending.has(key)) return pending.get(key);
  const pr = new Promise((resolve) => {
    const esc = (t) => String(t).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const buttons = canAlways ? ['拒否', '今回のみ許可', '常に許可'] : ['拒否', '今回のみ許可'];
    const text =
      `AIエージェント (DSH) が「${name}」の操作を求めています。\n(${bundle})` +
      (risk && risk !== 'low' ? `\n\n⚠ リスク: ${risk}` : '') +
      (canAlways ? '\n\n「常に許可」は Touch ID が必要です。' : '');
    const script =
      `display dialog "${esc(text)}" with title "LCU 操作の承認" buttons {${buttons.map((b) => `"${b}"`).join(', ')}} ` +
      `default button "拒否" cancel button "拒否" with icon caution giving up after 120`;
    const t0 = Date.now();
    let out = '';
    const p = spawn('/usr/bin/osascript', ['-e', script], { stdio: ['ignore', 'pipe', 'ignore'] });
    p.stdout.on('data', (d) => (out += d));
    p.on('error', () => resolve('error'));
    p.on('close', (code) => {
      if (code !== 0) return resolve('denied'); // キャンセル/拒否
      if (/gave up:true/.test(out)) return resolve('timeout');
      if (Date.now() - t0 < MIN_HUMAN_MS) return resolve('too-fast'); // 人間の速さではない
      if (/button returned:今回のみ許可/.test(out)) return resolve('session');
      if (/button returned:常に許可/.test(out)) return resolve('always');
      resolve('denied');
    });
  }).finally(() => pending.delete(key));
  pending.set(key, pr);
  return pr;
}

let upstream = null;
let connecting = null;
let declined = []; // 直近に拒否したアプリ (エラー文に案内を足すため)

async function connect() {
  const client = new Client({ name: 'dsh-lcu', version: '0.2.0' }, { capabilities: { elicitation: { form: {} } } });
  client.setRequestHandler(ElicitRequestSchema, async (req) => {
    const meta = req.params?._meta ?? {};
    const app = meta.tool_params?.app;
    const shown = meta.tool_params_display?.find((d) => d.name === 'app')?.value ?? app;
    const msg = req.params?.message ?? '';
    const note = (r) => { declined.push(app || msg); log('approval declined:', r, '-', msg); return { action: 'decline' }; };
    if (meta.connector_id !== 'computer-use' || !app) return note('unsupported request');
    if (DENY_APP.test(`${app} ${shown}`)) return note('refused host/dialog app');
    if (MODE === 'deny') return note('approval mode = deny');
    if (MODE === 'all') { log('auto-approved:', shown); return { action: 'accept', content: {} }; }
    const canAlways = Array.isArray(meta.persist) && meta.persist.includes('always');
    const choice = await askUser(shown, app, meta.riskLevel, canAlways);
    if (choice === 'session') return { action: 'accept', content: {} };
    if (choice === 'always') {
      const ok = await run(LCU, ['apps', 'allow', app]);
      return ok ? { action: 'accept', content: {} } : note('always-allow (Touch ID) failed');
    }
    return note(`user said ${choice}`);
  });
  const transport = new StdioClientTransport({ command: LCU, args: [], stderr: 'inherit' });
  transport.onclose = () => { if (upstream === client) upstream = null; };
  await client.connect(transport);
  return client;
}

async function getUpstream() {
  if (upstream) return upstream;
  connecting ??= connect().then((c) => (upstream = c)).finally(() => { connecting = null; });
  return connecting;
}

function saveImage(block) {
  mkdirSync(SHOT_DIR, { recursive: true });
  const ext = (block.mimeType || 'image/png').split('/')[1]?.replace('jpeg', 'jpg') || 'png';
  const file = path.join(SHOT_DIR, `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`);
  writeFileSync(file, Buffer.from(block.data, 'base64'));
  return file;
}

const server = new Server(
  { name: 'lcu', version: '0.2.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const up = await getUpstream();
  const { tools } = await up.listTools();
  return { tools: tools.filter((t) => MODEL_TOOLS.has(t.name)) };
});

server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
  const { name, arguments: args } = req.params;
  if (!MODEL_TOOLS.has(name)) {
    return { isError: true, content: [{ type: 'text', text: `Tool ${name} is not available.` }] };
  }
  declined = [];
  let up;
  try {
    up = await getUpstream();
    const budget = (Number(args?.timeout_ms) || 30000) + 60000;
    const res = await up.callTool(
      { name, arguments: args ?? {}, _meta: { 'x-codex-turn-metadata': { session_id: SESSION, turn_id: `${SESSION}-main` } } },
      undefined,
      { timeout: budget, signal: extra?.signal },
    );
    const content = [];
    for (const b of res.content ?? []) {
      if (b.type === 'image' && b.data) {
        content.push({ type: 'text', text: `[screenshot saved: ${saveImage(b)} — view with read_image]` });
      } else content.push(b);
    }
    if (res.isError && declined.length) {
      const apps = [...new Set(declined)].join(', ');
      content.push({
        type: 'text',
        text: `dsh-lcu: the user did not approve computer use for: ${apps}. Do not try to approve it yourself; ask the user, then call again (a new approval dialog will appear).`,
      });
    }
    return { content, isError: !!res.isError };
  } catch (e) {
    if (up && !upstream) log('upstream lost; will reconnect on next call');
    return { isError: true, content: [{ type: 'text', text: `dsh-lcu: ${e?.message ?? e}` }] };
  }
});

async function shutdown() {
  try {
    if (upstream) {
      // turn の後始末は LCU が終了時に自分で行う (明示 turn_ended は SIGKILL になることがあるため送らない)
      await upstream.close();
    }
  } catch {}
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.stdin.on('end', shutdown);

await server.connect(new StdioServerTransport());
log('ready; lcu =', LCU, '; home =', homedir());
