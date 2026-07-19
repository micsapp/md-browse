# infra/ — mirror & load-balancing configs (as deployed 2026-07-18)

Reference copies of the config files that run the md-docs mirror fleet.
These are **copies, not the live files** — deploy targets are listed below.
Full design + as-built narrative: `docs/md-docs.md`.

## Layout / deploy targets

### `primary-minipc2/` (mirror 1, single writer)
| File | Deploys to |
|---|---|
| `lsyncd.conf.lua` | `/etc/lsyncd/lsyncd.conf.lua` — data replication to mirrors; add a mirror = add to `mirrors` list |
| `lsyncd-md.service` | `/etc/systemd/system/` (native unit; Ubuntu's packaged lsyncd SysV unit does not start the daemon) |
| `cloudflared-md.config.yml` | `/etc/cloudflared-md/config.yml` — `md` LB tunnel connector → localhost:80 |
| `cloudflared-md.service` | `/etc/systemd/system/` |
| `crontab-md-mirror.txt` | lines in `crontab -e` (user mli): 5-min rsync fallback + nightly `sync-verify.sh` |

The backend itself runs under PM2 via `ecosystem.config.js` (repo root).
Primary nginx site: `nginx/md-browse.conf` (repo) → `/etc/nginx/sites-enabled/md-browse`.

### `replica-ec2/` (mirror 2, read-only replica, 54.165.17.203)
| File | Deploys to |
|---|---|
| `nginx-md-browse-replica.conf` | `/etc/nginx/sites-available/md-browse-replica` (+ symlink in sites-enabled) — listens :8090, GETs local, writes forwarded to primary |
| `md-browse.service` | `/etc/systemd/system/` — backend :3001 (node via nvm) |
| `cloudflared-md.config.yml` | `/etc/cloudflared-md/config.yml` — `md` LB tunnel connector → localhost:8090 |
| `cloudflared-md.service` | `/etc/systemd/system/` |
| `cloudflared-md-docs2.config.yml` | `/etc/cloudflared-md-docs2/config.yml` — standalone tunnel for the direct URL `md-docs2.micstec.com` |
| `cloudflared-md-docs2.service` | `/etc/systemd/system/` |

## Not in the repo (secrets — recreate per host)
- `/etc/md-browse/env` — `JWT_SECRET=<openssl rand -hex 32>` + `PORT=3001`.
  **Must be identical on every mirror** or logins break across nodes. Mode 600, owner mli.
- `/etc/cloudflared-md/<uuid>.json`, `/etc/cloudflared-md-docs2/<uuid>.json` —
  tunnel credentials (copy from `~/.cloudflared/` where the tunnel was created).
- `~/.ssh/mdsync_ed25519` (primary) — sync key; public half goes in each mirror's
  `authorized_keys` jailed with `command="/usr/bin/rrsync /home/mli/md-browse/backend/data",restrict`.

## Tunnels
- `md` = `b7d99817-6650-428c-94ea-733dfbe64702` → `md.micstec.com` (connector on every mirror = the load balancer)
- `md-docs2` = `5771f334-868a-4391-9079-8a75e5199c89` → direct URL of mirror 2
- Gotcha: always `cloudflared tunnel route dns --overwrite-dns <UUID> <hostname>` — using the
  tunnel *name* can silently attach DNS to the default tunnel from `~/.cloudflared/config.yml`.
