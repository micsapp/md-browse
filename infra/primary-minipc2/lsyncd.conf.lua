-- lsyncd config for md-docs mirror replication (primary → replicas).
-- lsyncd runs as root; each mirror is addressed as user@host with the mdsync
-- key. Add a mirror = add an entry to `mirrors`.
settings {
    logfile    = "/var/log/lsyncd/lsyncd.log",
    statusFile = "/var/log/lsyncd/lsyncd.status",
    maxProcesses = 1,   -- required by default.rsyncssh
    insist = true,   -- keep retrying if a mirror is down at startup
}

local mirrors = {
    "mli@54.165.17.203",   -- md-mirror2 (AWS EC2)
}

for _, host in ipairs(mirrors) do
    sync {
        default.rsyncssh,
        source     = "/home/mli/md-browse/backend/data",
        host       = host,
        targetdir  = "/",   -- rrsync jail on the mirror maps this to backend/data
        delay      = 1,
        rsync = {
            archive  = true,
            compress = true,
            -- rrsync on mirrors rejects rsync's -s (protect-args); paths here
            -- contain no spaces, so it is safe to turn off
            protect_args = false,
            _extra   = { "--delete" },
        },
        ssh = {
            identityFile = "/home/mli/.ssh/mdsync_ed25519",
            options = { StrictHostKeyChecking = "accept-new" },
        },
    }
end
