# md_cli

Command-line client for [md-browse / MarkdownHub](../). Lets you list, search,
upload, update, version, and download markdown documents from any machine that
has Node.js 18+.

## Install

The CLI has **no runtime dependencies** — it only needs Node 18+.

### From this repo (development)

```sh
cd cli
npm link              # exposes `md_cli` on your PATH
```

### On a client machine (no server checkout needed)

Copy or publish the `cli/` directory by itself, then:

```sh
cd path/to/cli
npm install --omit=dev      # no-op (no deps), but creates the standard layout
npm link                    # or: npm install -g .
```

You can also just run it directly without installing:

```sh
node path/to/cli/bin/md_cli.js list
```

## Configure

Create a `.env` file in your working directory (or any parent directory — the
CLI walks up to find one). See `.env.example`:

```
MD_BROWSE_TOKEN=agt_xxxxxxxxxxxxxxxx
MD_BROWSE_URL=https://md.example.com
```

To get a token, log into your md-browse site and open the **Tokens** page
(top nav). Create a token with the scopes you need — the full secret is shown
only once. Paste it into `.env` as `MD_BROWSE_TOKEN`.

Recommended scopes for a full-feature CLI session:

- `documents:read`
- `documents:write`
- `versions:read`
- `search:read`

You can override the env file or values per-invocation:

```sh
md_cli --env-file ./prod.env list
md_cli --token agt_… --url https://md.example.com list
```

## Commands

```text
md_cli list                      List documents
md_cli search <query>            Full-text search
md_cli get <id>                  Print raw markdown (-o file to save)
md_cli upload <file>             Upload a .md file
md_cli update <id> --title …     Update fields or content
md_cli delete <id>               Soft-delete
md_cli versions <id>             Show version history
md_cli rollback <id> --version 3 Roll back to a prior version
md_cli download <id>             Download a single .md
md_cli download-batch a,b,c      Zip download
md_cli share create <id>         Create a public share link
md_cli share list <id>           List share links for a doc
md_cli share delete <share-id>   Revoke a share link
md_cli share open <token>        Fetch a shared doc (no auth needed)
md_cli whoami                    Show current config
md_cli help <command>            Detailed help
```

Add `--json` to most commands to get machine-readable output.

## Examples

```sh
# Confirm setup
md_cli whoami

# List recent docs
md_cli list --page-size 5

# Search and pipe a doc into less
md_cli search "deployment"
md_cli get 5b3c…  | less

# Upload a markdown file with tags
md_cli upload notes.md --tags ops,runbook --description "Deploy notes"

# Replace a doc's body
md_cli update 5b3c… --content-file ./new.md --change-note "edits from CLI"

# Roll back to v2
md_cli rollback 5b3c… --version 2 --note "revert botched edit"

# Bulk download as a zip
md_cli download-batch id1,id2,id3 -o docs.zip

# Create a public share link (printed URL derives from MD_BROWSE_URL)
md_cli share create 5b3c…
md_cli share create 5b3c… --code "secret"     # gated by access code
md_cli share list 5b3c…                       # see all share links
md_cli share delete <share-id>                # revoke

# Fetch shared content from any machine (no MD_BROWSE_TOKEN needed)
md_cli share open <token> --code "secret" -o doc.md
```

## Build standalone binaries

You can package `md_cli` into a single executable that runs on machines without
Node.js installed. The build uses [`@yao-pkg/pkg`](https://www.npmjs.com/package/@yao-pkg/pkg)
(a maintained fork of `vercel/pkg`) and is declared as a `devDependency` so it
isn't pulled in for normal CLI use.

First time setup:

```sh
cd cli
npm install            # installs @yao-pkg/pkg into node_modules
```

Then pick a target:

```sh
npm run build           # current OS/arch (fastest, ~40MB binary in dist/)
npm run build:linux     # Linux x64 + arm64
npm run build:mac       # macOS x64 + arm64
npm run build:win       # Windows x64
npm run build:all       # all five targets
npm run clean           # delete dist/
```

Output goes to `cli/dist/`. Single-target builds produce `dist/md_cli`
(or `md_cli.exe`); multi-target builds produce per-platform names like
`md_cli-linux-x64`, `md_cli-macos-arm64`, `md_cli-win-x64.exe`.

The first build downloads the prebuilt Node runtime for each target into
`~/.pkg-cache/`; subsequent builds are cached and fast.

Distribute the binary alongside a sample `.env` file. The binary still reads
`MD_BROWSE_TOKEN` and `MD_BROWSE_URL` from `.env` exactly the same way.

```sh
./md_cli whoami
./md_cli list --page-size 5
```

## Exit codes

- `0` — success
- `1` — any error (bad arguments, network failure, API error, missing token)

API errors print the server's error code, message, and `request_id` so you can
trace them in the backend logs.
