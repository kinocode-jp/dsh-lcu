# @kinocode/dsh-lcu

日本語 | [English](README.md)

[LCU](https://github.com/amontlabs/lcu)（Codex の computer use を Codex アプリから切り離したもの）を
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) で使うプラグインです。
`mcp__lcu__js` / `mcp__lcu__js_reset` で macOS のネイティブアプリを読み取り・操作できます。

DSH 標準の `dsh-mcp-client` は LCU のアプリごとの承認要求（MCP の elicitation）に答えられず、
そのまま繋ぐと `createElicitation is unavailable` で失敗します。このプラグインは小さなアダプター
（`lib/adapter.mjs`）経由で LCU を起動し、承認を処理します。

## 必要なもの
- macOS（Apple Silicon）と、公式の **ChatGPT デスクトップアプリ**
- **LCU**（例: `~/.local/share/lcu`、[導入手順](https://github.com/amontlabs/lcu/blob/main/docs/INSTALLATION.md)。`--runtime-only` で十分）
- macOS の権限: アクセシビリティ（ChatGPT Computer Use）と画面収録（ChatGPT）

## インストール
```sh
dsh plugin --profile desktop add @kinocode/dsh-lcu
```
DSH を再起動して新しいセッションを開きます。LCU の場所が違うときは `prefix` か `LCU_PREFIX` を設定します。

## 承認モード
プロファイルのパッチで設定します。
```yaml
- id: lcu
  config:
    approval: ask      # ask（既定） | all | deny
```
| `approval` | 動き |
|---|---|
| `ask` | macOS のダイアログで確認: 拒否 / 今回のみ許可 / 常に許可（Touch ID、`lcu apps allow` と同じ）。閉じる・時間切れ・人間では不可能な速さの応答は拒否 |
| `all` | 確認なしで全アプリを許可 |
| `deny` | 常に拒否 |

どのモードでも、エージェントが自己承認に使えるアプリ（DSH 本体、ターミナル、Claude、`osascript` / System Events）は許可しません。
そのほかの設定: `prefix`、`toolCallTimeoutMs`。

## アダプターがすること
- `js` と `js_reset` だけを公開（`turn_ended` など host 専用ツールは隠す）
- MCP クライアントは画像をプレースホルダーにしてしまうため、スクリーンショットは `$TMPDIR/dsh-lcu-shots/` に保存してパスを返す（`read_image` で見る）
- LCU が終了しても、次の呼び出しで再接続

## 安全性
`all` ではブラウザやパスワード管理アプリを含む全アプリを操作できます。`ask` を推奨します。
非公式のコミュニティプラグインで、OpenAI・amontlabs とは無関係です。ChatGPT アプリとそのランタイムは
それぞれの規約に従い、このパッケージには含まれません。

## ライセンス
MIT
