# md_cli

Command-line client for [md-browse / MarkdownHub](../). Lets you manage
documents, folders, tokens, audit logs, and admin users from any machine
that has Node.js 18+, or as a standalone binary with no Node required.

## Install

### One-line install (Linux / macOS)

```sh
curl -fsSL https://tnas_d.micsapp.com/s/md_cli/install.sh | bash
```

Installs the right binary for your OS/arch (and on Linux picks between a
portable glibc 2.17+ build and a modern build automatically). Windows users
download `md_cli-win-x64.exe` from the same URL prefix.

### From this repo (development)

```sh
cd cli
npm link              # exposes `md_cli` on your PATH
```

### From source on a client machine

The CLI has **no runtime dependencies** — it only needs Node 18+.

```sh
cd path/to/cli
npm install --omit=dev      # no-op (no deps), but creates the standard layout
npm link                    # or: npm install -g .
```

Or just run it directly:

```sh
node path/to/cli/bin/md_cli.js list
```

## Configure

The fastest way to authenticate is `md_cli login`. The CLI mints a
long-lived agent token and stores it as a **profile** under
`~/.md-browse/profiles/<name>.json` (mode 0600). The profile becomes
active by default — you can keep multiple profiles for different servers
and switch with `md_cli use <name>`.

```sh
md_cli login --url https://md.example.com
# Username: alice
# Password: ********
# logged in as alice
# saved to  ~/.md-browse/profiles/md.json
# profile:  md  (active)
# base url: https://md.example.com
# token:    agt_a1b2…  (name: md_cli@laptop 2026-05-09 14:32)
# scopes:   documents:read, documents:write, versions:read, search:read, audit:read
```

Useful flags: `--profile <name>` (custom name; default derived from
hostname), `--scopes a,b,c` (comma-separated scopes), `--save-password`
(also store credentials for admin commands that need a session JWT),
`--no-switch` (don't make this the active profile), `--force` (overwrite
an existing auto-named profile).

### Switching profiles

```sh
md_cli profiles                # list saved profiles
md_cli use staging             # switch active profile
md_cli --profile prod list     # one-shot use without switching
```

### Alternative: token via .env

If you'd rather paste a token, create a `.env` (cwd or any parent):

```
MD_BROWSE_TOKEN=agt_xxxxxxxxxxxxxxxx
MD_BROWSE_URL=https://md.example.com
# MD_BROWSE_PROFILE=md       # pick a saved profile by name
```

`md_cli whoami` prints which source the active token came from.

### Token resolution order (highest first)

1. `--token <t>` flag
2. `MD_BROWSE_TOKEN` env var
3. `.env` file (cwd or any parent)
4. `--profile NAME` flag
5. `MD_BROWSE_PROFILE` env var
6. Active profile (`~/.md-browse/current`)

## Commands

### Document operations

```text
md_cli list                      List documents
md_cli search <query>            Full-text search
md_cli get <id>                  Print raw markdown (-o file to save, --rendered for HTML)
md_cli upload <file>             Upload a .md file (--folder/--tags/--description/...)
md_cli update <id>               Update fields or content (--title, --content-file, ...)
md_cli delete <id>               Soft-delete
md_cli versions <id>             Show version history
md_cli rollback <id>             Roll back (--version <n>)
md_cli chunks <id>               Show RAG chunks for a doc (--size/--overlap)
md_cli download <id>             Download a single .md
md_cli download-batch a,b,c      Zip download
md_cli batch-delete a,b,c        Soft-delete many (-y to skip prompt)
md_cli batch-move a,b,c --folder <id|root>
                                 Move many to a folder
```

### Sharing

```text
md_cli share create <id> [--slug NAME] [--code CODE]
                                 Create a public share link. --slug picks a
                                 user-friendly URL (e.g. /share/release-notes
                                 instead of /share/ZVEvHYPtw_…).
md_cli share list [<id>]         List share links (for one doc, or all)
md_cli share delete <share-id>   Revoke a share link
md_cli share rename <share-id> <new-slug>
                                 Rename to a custom slug (--clear drops it)
md_cli share set-code <share-id> [code]
                                 Set/change the access code (--clear removes it)
md_cli share open <identifier>   Fetch a shared doc by slug OR token (no auth)
```

Slugs must match `[A-Za-z0-9_-]{1,64}` and are unique across all shares.

### Folders

```text
md_cli folders                          List folders (tree view)
md_cli folders create <name> --parent <id?>
                                         Create a folder
md_cli folders rename <id> <new-name>   Rename a folder
md_cli folders move <id> --parent <id|root>
                                         Move (reparent) a folder
md_cli folders rm <id>                   Delete a folder (docs move to parent)
```

### Token management

```text
md_cli tokens list                       List your agent tokens
md_cli tokens revoke <id|prefix|name>    Revoke a token
```

### Audit log

```text
md_cli audit                             Show recent audit entries
md_cli audit --actor-type user --action document.update
md_cli audit --page-size 50
```

### Assets

```text
md_cli assets list <doc-id>              List asset files on a doc
md_cli assets upload <doc-id> file ...   Upload one or more files
md_cli folder-assets list <folder-id>
md_cli folder-assets upload <folder-id> file ...
md_cli folder-assets rm <folder-id> <filename>
```

### Admin (requires admin role; uses session JWT)

```text
md_cli admin users list
md_cli admin users add <name> --password <pw> --role admin|editor|viewer
md_cli admin users update <name> --role editor
md_cli admin users rm <name>
md_cli admin settings get
md_cli admin settings set --registration off
```

Admin commands re-auth using your saved credentials (if you used
`--save-password` at login) or prompt you for the password. You can
also pass `--username` / `--password` directly.

### Profiles & auth

```text
md_cli login                              Log in (mints a CLI token)
md_cli logout                             Forget the active profile (--all / --profile)
md_cli whoami                             Show config, identity, and saved profiles
md_cli use <name>                         Switch the active profile
md_cli profiles                           List saved profiles
md_cli profiles rm <name>                 Delete a profile
md_cli profiles rename <old> <new>        Rename a profile
```

### Other

```text
md_cli categories                         List distinct categories
md_cli tags                               List distinct tags
md_cli health (or ping)                   Probe /api/health
md_cli help [command]                     Detailed help
md_cli version                            Print CLI version + build SHA
```

Add `--json` to most commands to get machine-readable output.

## Examples

```sh
# First-run setup
md_cli login --url https://md.example.com
md_cli whoami

# Browse and read
md_cli list --page-size 5
md_cli search "deployment"
md_cli get 5b3c… | less

# Upload + tag
md_cli upload notes.md --tags ops,runbook --description "Deploy notes"

# Update body and metadata
md_cli update 5b3c… --content-file ./new.md --change-note "edits from CLI" \
                    --tags ops,runbook,latest

# Folder workflow
md_cli folders create "Runbooks"
# created abc123  Runbooks
md_cli upload guide.md --folder abc123
md_cli folders rm abc123                  # docs move up to root automatically

# Bulk download
md_cli download-batch id1,id2,id3 -o docs.zip

# Share a doc (URL derives from MD_BROWSE_URL)
md_cli share create 5b3c…
md_cli share create 5b3c… --slug release-notes        # /share/release-notes
md_cli share create 5b3c… --code "secret" --slug staging
md_cli share rename <share-id> new-name               # change the slug
md_cli share rename <share-id> --clear                # back to token-only
md_cli share open release-notes                       # slug also works for open
md_cli share open <token> --code "secret" -o doc.md

# Manage your tokens
md_cli tokens list
md_cli tokens revoke agt_c586            # by 8-char prefix
md_cli tokens revoke "md_cli@laptop 2026-05-09 14:32"   # by display name

# Audit and admin
md_cli audit --actor-type user --page-size 20
md_cli admin users list
md_cli admin users add bob --role editor

# Multi-server
md_cli login --url https://staging.example.com --profile staging
md_cli use staging
md_cli list
md_cli use md          # back to prod
```

## Build standalone binaries

You can package `md_cli` into a single executable that runs on machines
without Node.js installed.

```sh
cd cli
npm install            # installs @yao-pkg/pkg dev dep
npm run build          # current OS/arch
npm run build:linux    # linux x64 + arm64 (glibc 2.28+)
npm run build:linux-portable  # linux x64 + arm64 (glibc 2.17+, runs on RHEL 7, Ubuntu 16.04, ...)
npm run build:mac      # macOS x64 + arm64
npm run build:win      # Windows x64
npm run build:all      # everything (7 binaries)
```

Output goes to `cli/dist/`. The portable Linux builds use Node 16 via
`pkg@5.8.1` so they run on old glibcs all the way back to 2.17. The
default `build:linux` target produces Node 20 binaries that need
glibc 2.28+ (modern distros only).

Each build embeds the current git SHA + commit date so `md_cli version`
identifies which build is running.

## Exit codes

- `0` — success
- `1` — any error (bad arguments, network failure, API error, missing token)

API errors print the server's error code, message, and `request_id` so
you can trace them in the backend logs.
