# VM Agent Task: Fixed-Spec Pocket TTS Topology

## Goal

Keep every existing production/staging website instance, port, domain, Cloudflare origin, Nginx route, and non-TTS behavior unchanged. Run Pocket TTS only on the 24 GB ARM VM. The two 1 GB ARM VMs must proxy only `/api/tts` to that VM over the private network and must never load Pocket TTS locally.

## Hard Stop

Before changing anything, confirm the deployed repository supports a persistent `local`/`remote` TTS node mode and configurable private TTS backend. If not, **stop and report this prerequisite**. Do not bypass memory checks or make manual Nginx edits that the next deployment will overwrite.

## On Each 1 GB / 1-vCPU / 50 GB VM

1. Preserve production on `127.0.0.1:3000`, staging on `127.0.0.1:3010`, all other hosted services, and current Cloudflare membership.
2. Configure this VM as an app-only/remote-TTS node. No local Python/Pocket TTS worker, model warmup, or TTS cache.
3. Route only production `/api/tts` to the large VM's private production TTS endpoint and only staging `/api/tts` to its private staging endpoint. Preserve `Host`, `Origin`, `X-Forwarded-*`, status codes, NDJSON streaming, `proxy_buffering off`, and `proxy_cache off`.
4. Allow outbound private-network access only to those two TTS endpoints.
5. Add 1-2 GB emergency swap or zram with low swappiness. Do not use swap as TTS capacity.

## On the 24 GB / 4-vCPU / 100 GB VM

1. Preserve every existing website and service.
2. Run isolated production and staging Pocket TTS backends with separate env files, tokens, caches, voice states, ports, and health checks. Bind them only to the private interface; never expose them publicly.
3. Firewall both backend ports so only the two small VMs and the local host can connect.
4. Keep one inference at a time per backend. Start with `MEMORY_HIGH_MB=4096` and `MEMORY_MAX_MB=6144` per portfolio site; verify other websites retain sufficient headroom.
5. Add 4-8 GB emergency swap with low swappiness.

## Required Verification

- Production and staging home pages still work on all three VMs.
- All non-`/api/tts` traffic remains local to each VM.
- `/api/tts` returns `ready`, `chunk`, and `done` through both public domains from every origin.
- The 1 GB VMs run no Pocket TTS/Python worker and show no swap thrashing or OOM events.
- The 24 GB VM uses separate production/staging caches and remains stable with its other websites.
- Re-run the normal deployment once and confirm the topology persists.

Return the VM role, private IPs/ports used, files changed, firewall rules, service status, memory/swap measurements, and verification results. Do not deploy production or change Cloudflare without explicit approval.