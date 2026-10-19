# リリース手順

`@kinocode/dsh-lcu` は GitHub の組織 **kinocode-jp** の `kinocode-jp/dsh-lcu` から、GitHub Actions
「Publish to npm」（`.github/workflows/publish.yml`）で公開する（npm Trusted Publishing / OIDC）。
個人の npm アカウントから `npm publish` しない。コミット作者は `kinocode <noreply@kinocode.jp>`。

1. `package.json` の `version` を上げ、CHANGELOG を追記してコミット。
2. `npm test` と `npm pack --dry-run` で確認。
3. `git tag v<version> && git push origin v<version>`（タグと version が違えば止まる）。
4. `npm view @kinocode/dsh-lcu@<version> _npmUser` が GitHub Actions になっていること。

## 最初に一度だけ（組織オーナーがブラウザで）
npmjs.com の `@kinocode/dsh-lcu` → Settings → Trusted Publisher → GitHub Actions:
Organization `kinocode-jp` / Repository `dsh-lcu` / Workflow `publish.yml`。
その後 Publishing access で「Require two-factor authentication and disallow tokens」。
