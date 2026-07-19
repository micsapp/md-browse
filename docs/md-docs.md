# md-docs.micstec.com — Mirroring & Load-Balancing Design

**Status:** IMPLEMENTED 2026-07-18 — see §10 for the as-built record and deviations
**Date:** 2026-07-18
**Scope:** Add a second mirror of md-docs.micstec.com, keep mirrors in sync, and publish `md.micstec.com` as a load-balanced entry point. Design must scale beyond 2 mirrors.

---

## 1. Current state (as surveyed)

| Item | Value |
|---|---|
| Public hostname | `md-docs.micstec.com` |
| Origin server | `minipc2` (hostname `DESKTOP-3TQ8EET`), reached via `mics_cli` |
| Exposure | Cloudflare Tunnel `minipc2` (`~/.cloudflared/config.yml`), ingress `md-docs.micstec.com → http://localhost:80` |
| Web server | nginx site `/etc/nginx/sites-enabled/md-browse`, listens on `:80` |
| Frontend | Static Nuxt build served from `/home/mli/md-browse/frontend/.output/public` |
| Backend | Express app `/home/mli/md-browse/backend/server.js` on `127.0.0.1:3001`, proxied at `/api` |
| Data store | **Flat files** in `/home/mli/md-browse/backend/data/` — `users.json`, `metadata.json`, `versions.json`, `folders.json`, `shares.json`, `settings.json`, `agent_tokens.json`, `audit_logs.json`, `idempotency_keys.json`, plus `uploads/` (markdown docs + assets). ~2.5 MB total today |
| Data access pattern | Backend reads JSON from disk **per request** (`readJson()` on every call) — no in-memory cache. Synced files take effect immediately, no restart needed on mirrors |
| Auth | JWT signed with `JWT_SECRET` env (currently falls back to the default hard-coded value) |
| DNS | Cloudflare zone `micstec.com` (managed today via `dns-manage.sh` / `cloudflared`) |

**Candidate mirror host:** the AWS EC2 box (`ip-172-31-1-73`, currently running the `imterminal` Cloudflare Tunnel, 931 GB free). It already has `cloudflared` installed and authenticated (`~/.cloudflared/cert.pem`), making it the lowest-friction second mirror.

---

## 2. Target architecture

```
                        ┌──────────────────────────────┐
                        │        Cloudflare edge        │
                        │  md.micstec.com  (tunnel "md")│
                        └──────┬──────────────┬─────────┘
              connections load-balanced across tunnel connectors
                               │              │
                ┌──────────────▼───┐      ┌───▼──────────────┐
                │ Mirror 1 (PRIMARY)│      │ Mirror 2 (replica)│
                │ minipc2           │      │ AWS EC2           │
                │ cloudflared "md"  │      │ cloudflared "md"  │
                │ nginx :80         │      │ nginx :80         │
                │ backend :3001 RW  │◄─────┤ backend :3001 RO  │
                │ data/ (source of  │writes│ data/ (rsync copy)│
                │ truth)            │──────► (lsyncd push)     │
                └───────────────────┘ sync └───────────────────┘

  md-docs.micstec.com stays as-is (direct hostname of Mirror 1).
  Each additional mirror = replica host running the same stack +
  the shared "md" tunnel credentials + an entry in the sync target list.
```

### Key decisions

1. **Single-writer, many-reader.** The data store is flat JSON files; multi-master writes would corrupt or lose data on conflict. Mirror 1 (minipc2) is the only node whose backend performs writes. Replicas serve all static content and all read API traffic locally, and **proxy mutating API requests to the primary**.
2. **Load balancing via Cloudflare Tunnel replicas (free).** One new tunnel named `md` is created once; its credentials file is copied to every mirror, and each mirror runs a `cloudflared` connector for it. Cloudflare automatically distributes incoming connections across all live connectors of a tunnel and stops routing to a connector that disconnects — giving load distribution **and** failover with zero extra cost. Upgrade path to the paid Cloudflare Load Balancer product (health probes, weighted/geo steering) is in §8.
3. **Sync = lsyncd push from primary** (inotify + rsync over SSH) with a cron rsync as belt-and-braces. Adding a mirror is one line in the sync target list.

---

## 3. Write routing on replicas (nginx)

Replica nginx serves reads locally and forwards writes to the primary through the existing `md-docs.micstec.com` hostname (which always points at the primary's tunnel):

```nginx
# /etc/nginx/sites-available/md-browse   (replica variant — only /api differs)

map $request_method $md_api_upstream {
    default  "https://md-docs.micstec.com";   # POST/PUT/PATCH/DELETE → primary
    GET      "http://127.0.0.1:3001";
    HEAD     "http://127.0.0.1:3001";
    OPTIONS  "http://127.0.0.1:3001";
}

server {
    ...same as primary config...

    location /api {
        resolver 1.1.1.1 ipv6=off valid=300s;   # needed for variable proxy_pass
        proxy_pass $md_api_upstream;
        proxy_set_header Host md-docs.micstec.com;   # when forwarding writes
        proxy_ssl_server_name on;
        # (headers/timeouts identical to current config otherwise)
    }
}
```

Notes:

- `POST /api/auth/login` also goes to the primary — harmless, and it keeps
  idempotency keys and audit logs in one place.
- **Read-your-writes lag:** after a write, replicas serve the new data once
  lsyncd has pushed it (~1 s typical, ≤5 min worst case via the cron
  fallback). Because the backend re-reads JSON per request, no restart is
  needed. This is the accepted consistency trade-off of the design.
- **Primary-down behavior:** reads keep working on replicas; writes fail
  until the primary returns (or is promoted — see §7).

---

## 4. Data & code sync

### 4.1 What must be identical on every mirror

| Item | Sync method | Direction |
|---|---|---|
| `backend/data/` (JSON + `uploads/`) | lsyncd (live) + cron rsync (fallback) | primary → replicas |
| Frontend build `frontend/.output/public` | rsync on deploy | primary → replicas |
| Backend code + `node_modules` | rsync on deploy (`deploy.sh` extension) | primary → replicas |
| `JWT_SECRET` (must be **the same value everywhere** or logins die on failover / mixed routing) | one-time manual copy into each mirror's systemd env file | manual |
| nginx site config (primary vs replica variant) | reference copies in repo: `nginx/md-browse.conf` (primary), `infra/replica-ec2/nginx-md-browse-replica.conf`; installed per role | manual/deploy |

> ⚠️ Action item regardless of mirroring: the primary currently runs with the
> **default hard-coded JWT secret**. Generate a real secret
> (`openssl rand -hex 32`), put it in `/etc/md-browse/env` on all mirrors,
> and restart the backend once.

### 4.2 Live sync — lsyncd on the primary

```lua
-- /etc/lsyncd/lsyncd.conf.lua  (primary only)
settings { logfile = "/var/log/lsyncd.log", statusFile = "/var/log/lsyncd.status" }

-- one sync{} block per mirror; adding a mirror = add a block
mirrors = { "mirror2.sync.micstec.com" }   -- SSH aliases, see §4.4

for _, host in ipairs(mirrors) do
  sync {
    default.rsyncssh,
    source    = "/home/mli/md-browse/backend/data/",
    host      = host,
    targetdir = "/home/mli/md-browse/backend/data/",
    delay     = 1,
    rsync     = { archive = true, compress = true, _extra = { "--delete" } },
  }
end
```

- `--delete` keeps replicas exact (removed docs disappear).
- lsyncd batches inotify events; JSON files are written whole
  (`fs.writeFile`), so partial-file reads on replicas are a narrow window;
  rsync's atomic temp-file rename makes the replica-side swap atomic.

### 4.3 Fallback + integrity (cron, primary)

```cron
*/5 * * * *  rsync -az --delete /home/mli/md-browse/backend/data/ mirror2.sync.micstec.com:/home/mli/md-browse/backend/data/
7 3 * * *    /home/mli/md-browse/sync-verify.sh   # compares rsync -n checksums, alerts on drift
```

### 4.4 Sync transport

minipc2 (primary) sits behind Cloudflare Tunnel with no inbound ports, but it
only needs **outbound** SSH to replicas, which works from anywhere:

- **Replica on public cloud (EC2 case):** plain SSH from primary → replica,
  key-only auth, dedicated `mdsync` key restricted in
  `authorized_keys` (`command="rsync --server ..."` via `rrsync` to jail it
  to the data directory). SSH alias `mirror2.sync.micstec.com` defined in
  primary's `~/.ssh/config`.
- **Future replica behind its own tunnel/NAT:** reuse the existing pattern —
  expose `ssh-<host>.micstec.com` on that replica's tunnel and have the
  primary connect through `cloudflared access ssh` (ProxyCommand), exactly
  like `ssh-minipc2.micstec.com` today.

---

## 5. Load balancing — `md.micstec.com`

### 5.1 Create the shared tunnel (one-time, on primary)

```bash
cloudflared tunnel create md                       # new tunnel, new creds json
cloudflared tunnel route dns md md.micstec.com     # CNAME md → <uuid>.cfargotunnel.com
```

### 5.2 Per-mirror connector (every mirror, incl. primary)

Copy the `md` tunnel credentials JSON to each mirror, then install a second
`cloudflared` service (it must not disturb the host's existing tunnel —
minipc2's `minipc2` tunnel and EC2's `imterminal` tunnel keep running
untouched):

```yaml
# /etc/cloudflared-md/config.yml   (identical on every mirror)
tunnel: md
credentials-file: /etc/cloudflared-md/<md-tunnel-uuid>.json
ingress:
  - hostname: md.micstec.com
    service: http://localhost:80
  - service: http_status:404
```

```ini
# /etc/systemd/system/cloudflared-md.service
[Unit]
Description=Cloudflare Tunnel connector for md.micstec.com
After=network-online.target
[Service]
ExecStart=/usr/local/bin/cloudflared --config /etc/cloudflared-md/config.yml tunnel run
Restart=always
[Install]
WantedBy=multi-user.target
```

### 5.3 How balancing/failover behaves

- Each mirror's connector opens ~4 connections to Cloudflare; the edge
  spreads client traffic across all live connectors (approximately even,
  per-connection, with some geographic affinity).
- If a mirror dies, its connector drops and Cloudflare stops routing to it
  within seconds — **automatic failover, no health-check config needed**.
- This is connection-level distribution, not weighted/probing LB. If finer
  control is needed later, see §8.

`md-docs.micstec.com` remains a direct alias of the primary (unchanged), which
is also what replicas use as the write-forwarding target.

---

## 6. Implementation plan (ordered, reviewable steps)

| # | Step | Host | Risk |
|---|---|---|---|
| 1 | Set real `JWT_SECRET` in `/etc/md-browse/env`, wire into backend service, restart | primary | logins reset if tokens invalidated (7-day JWTs re-issued on login) |
| 2 | Provision mirror: rsync `md-browse/` (code + frontend build + `node_modules`), install nginx replica config, systemd unit for backend, same `JWT_SECRET` | EC2 | none (no traffic yet) |
| 3 | Seed data: initial `rsync -az backend/data/` primary → mirror; smoke-test mirror locally (`curl -H 'Host: md-docs.micstec.com' localhost/api/...`) | EC2 | none |
| 4 | Set up sync: `mdsync` SSH key + rrsync jail on mirror; install lsyncd + cron on primary; verify a test upload appears on mirror ≤ 2 s | both | low |
| 5 | Create `md` tunnel + DNS record; run connector on **primary only**; verify `md.micstec.com` end-to-end | primary | low — md-docs untouched |
| 6 | Start `cloudflared-md` connector on mirror; verify traffic hits both (tail both access logs), verify writes land on primary and replicate | EC2 | low |
| 7 | Write-path test through `md.micstec.com`: login, upload, edit, delete; confirm audit log entries land only on primary and replicas converge | — | — |
| 8 | Docs + runbook: add `MIRRORS.md` to repo with add-a-mirror checklist (§6.1) | — | — |

### 6.1 Adding mirror N (repeatable checklist)

1. Rsync code + frontend build; install backend service + replica nginx config + shared `JWT_SECRET`.
2. Seed `backend/data/` from primary.
3. Add SSH alias + key; append host to `mirrors` list in lsyncd config; `systemctl restart lsyncd`; add cron line.
4. Copy `md` tunnel credentials; enable `cloudflared-md` service.
5. Verify: sync lag test, read locally, write→primary forwarding.

No DNS or Cloudflare changes are needed for additional mirrors — that's the
main reason the shared-tunnel design scales to N.

---

## 7. Failure modes & operations

| Scenario | Behavior | Action |
|---|---|---|
| Replica down | Cloudflare stops routing to it; zero user impact | restart host/connector |
| Primary down | Reads continue via replicas; **writes fail**; sync pauses | manual promote: pick a replica, switch its nginx to primary variant, repoint `md-docs.micstec.com` DNS/tunnel ingress to it, start lsyncd there. Documented in runbook; acceptable for a docs site |
| Sync broken (SSH/key) | Replicas serve stale reads; writes fine | cron `sync-verify.sh` alerts on drift > 15 min |
| Split-brain risk | Prevented structurally: replicas never write locally (their backend is only ever hit with GET; writes are proxied away) | — |
| Cert/tunnel expiry | cloudflared manages its own certs | — |

Monitoring (minimal): a cron on each mirror curls `https://md.micstec.com/api/health` (or `/`) and its own `localhost:3001`, logs failures; `sync-verify.sh` on primary checks replica checksums nightly.

## 8. Considered alternatives (and why not now)

- **Cloudflare Load Balancer product** ($5/mo+): real health probes, weighted
  pools, geo steering, per-origin analytics. Clean upgrade later — the same
  per-mirror tunnels become LB origins. Not needed for v1.
- **Syncthing / bidirectional sync:** enables multi-master illusion but JSON
  file conflicts (two writers editing `metadata.json`) are unresolvable
  without app-level merge — rejected.
- **Move data to a real DB (SQLite→litestream, Postgres, Mongo):** the right
  long-term fix for true active-active writes, but a backend rewrite; out of
  scope for this task.
- **Self-hosted nginx LB in front:** reintroduces a single point of failure
  and a public host requirement; Cloudflare already terminates traffic.

---

## 10. As-built implementation record (2026-07-18)

Everything from §2–§5 is live. Deviations and concrete values:

| Area | As designed | As built |
|---|---|---|
| Primary backend service | systemd | **Stayed on PM2** (already used there): `pm2 start /home/mli/md-browse/ecosystem.config.js` + `pm2 save`. The ecosystem file loads env from `/etc/md-browse/env` |
| Secrets | `/etc/md-browse/env` | Done on both hosts (mode 600, owner mli); contains shared `JWT_SECRET` + `PORT=3001`. Backend restarted with it |
| Replica host | — | AWS EC2 `ip-172-31-1-73` / 54.165.17.203 |
| Replica backend | systemd | `md-browse.service` (systemd, node v25.9 via nvm), port 3001 |
| Replica nginx | :80 | **:8090** (`/etc/nginx/sites-enabled/md-browse-replica`) — port 80 on EC2 already hosts other sites. Harmless: only the local `cloudflared-md` connector talks to it |
| lsyncd | packaged service | Packaged SysV unit never launches the daemon → custom native unit **`lsyncd-md.service`**, config `/etc/lsyncd/lsyncd.conf.lua`. Required `maxProcesses = 1` (rsyncssh constraint) and `protect_args = false` (mirror's rrsync jail rejects rsync `-s`) |
| Sync SSH | rrsync jail | Key `~/.ssh/mdsync_ed25519` (primary) → EC2 `authorized_keys` entry `command="/usr/bin/rrsync /home/mli/md-browse/backend/data",restrict` |
| Fallback | cron | Primary crontab: 5-min rsync (`# md-mirror-fallback`) + nightly 03:07 `sync-verify.sh` (`# md-mirror-verify`) logging to `/var/log/md-sync-verify.log` |
| Tunnel | `md` | UUID `b7d99817-6650-428c-94ea-733dfbe64702`; creds + config under `/etc/cloudflared-md/` on both hosts; service `cloudflared-md.service` on both (primary → localhost:80, EC2 → localhost:8090) |

**Config copies in the repo (`infra/`):** every live config file above has a
reference copy committed to the md-browse repo — `infra/primary-minipc2/`
(lsyncd config + unit, `md` connector, cron lines) and `infra/replica-ec2/`
(replica nginx, backend unit, `md` + `md-docs2` connectors), with
`infra/README.md` mapping each file to its `/etc/...` deploy target per host.
Secrets are excluded (env file with `JWT_SECRET`, tunnel credential JSONs,
`mdsync` SSH key); the README documents how to recreate them. Note these are
reference copies, not config management — the hosts stay authoritative, so
re-copy into `infra/` after any live edit.

**Gotcha worth remembering:** `cloudflared tunnel route dns md md.micstec.com` on the
primary attached the CNAME to the *default* tunnel from `~/.cloudflared/config.yml`
instead of the tunnel named `md`. Fix: always use the UUID —
`cloudflared tunnel route dns --overwrite-dns b7d99817-… md.micstec.com`.
Same for `cloudflared tunnel info <uuid>`.

**Direct per-mirror URLs (added post-launch):**

- `https://md.micstec.com` — load-balanced entry (nearest live mirror)
- `https://md-docs.micstec.com` — mirror 1 (primary, minipc2) directly
- `https://md-docs2.micstec.com` — mirror 2 (EC2) directly, via standalone tunnel
  `md-docs2` (UUID `5771f334-868a-4391-9079-8a75e5199c89`), service
  `cloudflared-md-docs2.service`, config `/etc/cloudflared-md-docs2/` on EC2.
  The EC2 `imterminal` tunnel was not touched. Convention for mirror N: give it
  its own `md-docsN.micstec.com` standalone tunnel the same way.

  Port 8090 is closed to the internet: EC2 security group `common_sg`
  (`sg-0fb655a6f6fc6a66b`) had a broad `7080–17080` rule, which was split into
  `7080–8089` + `8091–17080` (adds before revoke, so nothing else blipped).
  Only local cloudflared connectors reach nginx :8090 now.

**Verification results:**
- Both connectors registered on tunnel `md` (origins 99.245.209.93 = minipc2, 54.165.17.203 = EC2).
- 12 requests from AWS us-east → all served by EC2 replica; 4 requests from minipc2's network → all served by primary. Distribution is **by connector proximity to the client's Cloudflare edge**, not round-robin — expect geographic affinity.
- Write probe (`POST /api/auth/login`) through `md.micstec.com` hit the replica's nginx, was forwarded, and appeared in the primary's access log with the primary's 401 response — single-writer routing works.
- Data sync: file created on primary appeared on replica in ≤6 s; deletion propagated too; `sync-verify.sh` reports OK.
- `https://md.micstec.com/` serves the app (200); `/api/health` 200 on both paths. (`/favicon.ico` 404s — pre-existing on the primary as well, not a mirror defect.)
- **Document-lifecycle sync test (2026-07-18):** uploaded a real doc through `md.micstec.com` (JWT-authenticated, multipart) — write forwarded to primary, file + metadata appeared on the replica in ≤8 s, and the replica served it locally via `md-docs2.micstec.com` with matching checksum. API delete (a *soft* delete by design — sets `deleted_at`, keeps the file for version history) also propagated: replica returns 404 for the doc. Full read/write/delete cycle works across mirrors.
- **Replica-outage test (2026-07-18):** stopped the EC2 mirror's `cloudflared-md` connector and backend. All `md.micstec.com` traffic (both regions) shifted to the primary within ~15 s; reads, homepage, **and writes** all kept working — a replica outage is invisible to users. Restored cleanly; tunnel back to 2 connectors.
- **Failover test (2026-07-18):** stopped the primary's `cloudflared-md` connector *and* its backend. Within ~15 s Cloudflare routed all `md.micstec.com` traffic — including requests from the primary's own network — to the EC2 replica; reads and the frontend stayed 200 throughout. Writes returned 502 for the duration (single-writer design). After restarting, the tunnel showed 2 connectors again and the write path recovered (probe 401 from primary).

## 11. Review decisions (resolved 2026-07-18)

1. Mirror 2 = **AWS EC2 (`imterminal`) box** — confirmed by owner, implemented.
2. Read-replication lag ~1 s typ. / 5 min worst — accepted (measured ≤6 s in practice).
3. Primary failover stays **manual** in v1 (runbook in §7).
4. `JWT_SECRET` rotated to a real value; existing sessions must log in again once.
