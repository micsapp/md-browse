# SSH via Cloudflare Tunnel — Setup Guide

Expose your WSL SSH service (e.g. `cssh.micstec.com`) through an existing Cloudflare Tunnel so you can SSH in from anywhere using `cloudflared`.

---

## Prerequisites

| Requirement            | Where        | Notes                                      |
| ---------------------- | ------------ | ------------------------------------------ |
| `cloudflared`          | Server (WSL) | Already installed if you ran `create_tunnel.sh` |
| `cloudflared`          | Client       | Needed as an SSH proxy — no login required  |
| Running tunnel         | Server (WSL) | Tunnel **cwebt** should already be active   |
| SSH server             | Server (WSL) | OpenSSH server listening on port 22         |

---

## Server Side (WSL)

### 1. Make sure SSH is running

```bash
sudo service ssh start
# or, if systemd is available:
sudo systemctl start ssh
```

Verify it is listening:

```bash
ss -tlnp | grep :22
```

### 2. Add the SSH route to the tunnel

```bash
./add-tunnel-route.sh --hostname cssh.micstec.com --service ssh://localhost:22
```

This command will:

1. Add a `cssh.micstec.com → ssh://localhost:22` ingress rule to `.cloudflared/config.yml`
2. Create (or confirm) the DNS CNAME record in Cloudflare
3. Restart the tunnel automatically

You can verify the route was added:

```bash
./add-tunnel-route.sh --list
```

Expected output includes:

```
cssh.micstec.com                         ssh://localhost:22
```

### 3. Confirm the tunnel is running

```bash
cat .cloudflared/tunnel.pid   # should show a PID
cat .cloudflared/tunnel.log   # check for errors
```

Or start/stop manually:

```bash
./tunnel-start.sh   # start
./tunnel-stop.sh    # stop
```

---

## Client Side (Remote Machine)

### 1. Install cloudflared

**macOS:**

```bash
brew install cloudflared
```

**Linux (Debian/Ubuntu):**

```bash
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg \
  | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null

echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] \
https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list

sudo apt-get update && sudo apt-get install -y cloudflared
```

**Windows:**

```powershell
winget install Cloudflare.cloudflared
```

### 2. Connect via SSH

**Option A — One-liner:**

```bash
ssh -o ProxyCommand="cloudflared access ssh --hostname cssh.micstec.com" mli@cssh.micstec.com
```

**Option B — Persistent SSH config (recommended):**

Add the following to `~/.ssh/config`:

```
Host cssh.micstec.com
    HostName cssh.micstec.com
    User mli
    ProxyCommand cloudflared access ssh --hostname %h
```

Then simply:

```bash
ssh cssh.micstec.com
```

---

## Optional: Restrict Access with Cloudflare Access

By default, anyone with `cloudflared` can reach your SSH service. To add authentication:

1. Go to [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com)
2. Navigate to **Access → Applications → Add an application**
3. Set the application domain to `cssh.micstec.com`
4. Create a policy (e.g. allow only your email, IP range, or identity provider)

Once configured, `cloudflared access ssh` will prompt the user to authenticate via browser before the SSH session is established.

---

## Troubleshooting

| Problem                              | Fix                                                                 |
| ------------------------------------ | ------------------------------------------------------------------- |
| `connection refused` on client       | Ensure SSH is running on WSL: `sudo service ssh start`              |
| Route not working after adding       | Check tunnel logs: `cat .cloudflared/tunnel.log`                    |
| Tunnel not running                   | Restart with `./tunnel-start.sh`                                    |
| DNS not resolving `cssh.micstec.com` | Wait a minute for propagation, or verify in Cloudflare DNS dashboard |
| `cloudflared` not found on client    | Install it (see Client Side section above)                          |

---

## Quick Reference

```bash
# Add SSH route (server)
./add-tunnel-route.sh --hostname cssh.micstec.com --service ssh://localhost:22

# List all routes (server)
./add-tunnel-route.sh --list

# Remove SSH route (server)
./add-tunnel-route.sh --remove cssh.micstec.com

# Start / stop tunnel (server)
./tunnel-start.sh
./tunnel-stop.sh

# SSH in (client)
ssh -o ProxyCommand="cloudflared access ssh --hostname cssh.micstec.com" mli@cssh.micstec.com
```
