# Pocket TTS Rollout Steps

Follow these steps in order. Do not promote the TTS branch until the memory check in Step 1 is resolved.

This guide assumes:

- Repository: `Dhruv-Mishra/portfolioWebsite`
- Feature branch: `feature/pocket-tts-voice-output`
- Development branch: `dev/lkg`
- Staging branch: `deployed/staging`
- Production branch: `deployed/production`
- Production service: `portfolio`, port `3000`
- Staging service: `portfolio-staging`, port `3010`
- All environments use Docker images.

## 1. Resolve the VM memory blocker first

Pocket TTS runs on the CPU. GPU VRAM does not help it. On VM 3, confirm whether the 24 GB is normal system RAM or only GPU VRAM:

```bash
free -h
nproc
df -h / /var/lib/docker
sudo docker system df
```

Run the same commands on VM 1 and VM 2.

### Important result

VM 1 and VM 2 currently have 1 GB system RAM and host both production and staging. The new deployment gives each site a provisional maximum of 1536 MB. Production and staging can therefore need about 3 GB together, plus Linux, Docker, Nginx, and file cache.

**Swap is not a replacement for RAM for Pocket TTS. Do not raise the limits on a 1 GB VM merely to bypass the deployment check.** Model loading may swap heavily, become very slow, or be killed.

Choose one safe plan before continuing:

### Plan A: keep all three VMs

Resize VM 1 and VM 2 to at least 4 GB system RAM. Because each VM hosts production and staging, 6 GB or more per VM is recommended.

Use these limits on each resized smaller VM:

```text
MEMORY_HIGH_MB=1200
MEMORY_MAX_MB=1536
```

If VM 3 really has 24 GB **system RAM**, use:

```text
MEMORY_HIGH_MB=4096
MEMORY_MAX_MB=6144
```

### Plan B: keep VM 1 and VM 2 at 1 GB

Do not deploy this branch to them. Before promotion, remove VM 1 and VM 2 from both staging and production deployment matrices and drain/remove them from the matching Cloudflare origin pools. The current workflows deploy to all three VMs and will fail if the two 1 GB VMs remain in the matrix.

This is a separate reviewed workflow/topology change. Do not solve it by deleting VM secrets or allowing those jobs to fail.

### Recommended first rollout

Use Plan A if all three origins must remain active. Otherwise, use VM 3 only for the first TTS rollout, measure it, then decide whether to resize VM 1 and VM 2 or create a dedicated shared TTS service.

Stop here until one plan is complete.

## 2. Accept the Pocket TTS model terms

1. Sign in to Hugging Face with the account that will own the deployment token.
2. Open <https://huggingface.co/kyutai/pocket-tts>.
3. Accept the gated model conditions and contact-information sharing request.
4. Confirm that the voice in `portfolio/public/sounds/voice/TTSReference.mp3` is your voice, or that you have explicit lawful consent to clone it.

Pocket TTS software is MIT licensed. The model weights are CC BY 4.0 and are also subject to the gated prohibited-use terms. Do not use the cloned voice for deception or impersonation.

## 3. Create the Hugging Face token

Open <https://huggingface.co/settings/tokens/new> and create one token with these settings:

- **Name:** `portfolio-pocket-tts-deploy`
- **Token type:** `Fine-grained`
- **Required scope:** grant read access to `kyutai/pocket-tts`. If the form does not offer a single-repository selector for this public gated model, enable **Read access to contents of all public gated repositories you can access**.
- **Repository write access:** none
- **Inference/API write access:** none
- **Webhooks, billing, discussions, and collections:** none

A normal read-only user token also works, but the fine-grained token above is preferred.

The token must belong to the same Hugging Face account that accepted the `kyutai/pocket-tts` gate.

Copy the token once. Do not put it in Git, this Markdown file, a shell-history command, or a chat message.

## 4. Add the token to GitHub automatically

Run these commands in PowerShell from `C:\portfolioWebsite`.

First authenticate GitHub CLI if needed:

```powershell
gh auth status
```

If that fails:

```powershell
gh auth login --hostname github.com --git-protocol https --web
```

Add the Hugging Face token as two **repository-level** Actions secrets. The prompt is masked:

```powershell
Set-Location C:\portfolioWebsite
$hfToken = Read-Host "Paste the Hugging Face read token" -MaskInput
$hfToken | gh secret set STAGING_HF_TOKEN --repo Dhruv-Mishra/portfolioWebsite
$hfToken | gh secret set PRODUCTION_HF_TOKEN --repo Dhruv-Mishra/portfolioWebsite
Remove-Variable hfToken
```

Confirm that the names exist. GitHub will not display their values:

```powershell
gh secret list --repo Dhruv-Mishra/portfolioWebsite | Select-String 'STAGING_HF_TOKEN|PRODUCTION_HF_TOKEN'
```

Expected names:

```text
STAGING_HF_TOKEN
PRODUCTION_HF_TOKEN
```

Do not create these only as environment secrets. The workflow guard jobs read repository-level secrets before entering per-VM environments.

The deployment workflows automatically and atomically synchronize the correct token into each VM's persisted `.env.local`. Do not manually paste `HF_TOKEN` on every VM.

## 5. Back up and inspect every VM

Run the following on each VM before changing anything:

```bash
hostname
free -h
swapon --show
nproc
df -h / /var/lib/docker
sudo docker system df
sudo systemctl is-active docker nginx portfolio portfolio-staging || true
sudo test -f /etc/deploy/machine.conf && echo machine-conf-ok
sudo test -f /etc/deploy/sites/portfolio.conf && echo production-conf-ok
sudo test -f /etc/deploy/sites/portfolio-staging.conf && echo staging-conf-ok
sudo test -f /opt/portfolio/config/.env.local && echo production-env-ok
sudo test -f /opt/portfolio-staging/config/.env.local && echo staging-env-ok
```

Back up the deployment configuration:

```bash
stamp="$(date -u +%Y%m%d-%H%M%S)"
sudo cp /etc/deploy/machine.conf "/etc/deploy/machine.conf.backup-${stamp}"
sudo cp /etc/deploy/sites/portfolio.conf "/etc/deploy/sites/portfolio.conf.backup-${stamp}"
sudo cp /etc/deploy/sites/portfolio-staging.conf "/etc/deploy/sites/portfolio-staging.conf.backup-${stamp}"
sudo cp /opt/portfolio/config/.env.local "/opt/portfolio/config/.env.local.backup-${stamp}"
sudo cp /opt/portfolio-staging/config/.env.local "/opt/portfolio-staging/config/.env.local.backup-${stamp}"
```

If any required file is missing, stop and fix the existing container deployment configuration first.

## 6. Set the memory limits

`/etc/deploy/machine.conf` is shared by production and staging on a VM. The values below apply separately to both services.

### On a resized 4-6 GB VM

```bash
sudo bash -c '
set -euo pipefail
file=/etc/deploy/machine.conf
upsert() {
  key="$1"; value="$2"
  if grep -q "^${key}=" "$file"; then
    sed -i "s/^${key}=.*/${key}=${value}/" "$file"
  else
    printf "%s=%s\n" "$key" "$value" >> "$file"
  fi
}
upsert MEMORY_HIGH_MB 1200
upsert MEMORY_MAX_MB 1536
'
```

### On VM 3 with 24 GB system RAM

```bash
sudo bash -c '
set -euo pipefail
file=/etc/deploy/machine.conf
upsert() {
  key="$1"; value="$2"
  if grep -q "^${key}=" "$file"; then
    sed -i "s/^${key}=.*/${key}=${value}/" "$file"
  else
    printf "%s=%s\n" "$key" "$value" >> "$file"
  fi
}
upsert MEMORY_HIGH_MB 4096
upsert MEMORY_MAX_MB 6144
'
```

Check the result:

```bash
sudo grep -E '^(MEMORY_HIGH_MB|MEMORY_MAX_MB|NODE_HEAP_MB|CPU_QUOTA_PERCENT)=' /etc/deploy/machine.conf
```

Do not continue on a 1 GB VM with `1200/1536`; resize or remove that VM from the deployment topology first.

## 7. Prepare Pocket TTS cache directories

Run on every VM that will receive the new image:

```bash
sudo install -d -m 0775 -o 1000 -g 1000 /var/cache/portfolio/pocket-tts
sudo install -d -m 0775 -o 1000 -g 1000 /var/cache/portfolio-staging/pocket-tts
sudo ls -ld /var/cache/portfolio/pocket-tts /var/cache/portfolio-staging/pocket-tts
```

Keep the old `kitten-tts` cache directories until the rollout is stable. The deployment intentionally does not copy old provider files into the Pocket TTS cache.

Keep at least 8 GB free on each target VM for the CPU-only PyTorch image, retained rollback images, releases, and separate production/staging model caches:

```bash
df -h / /var/lib/docker
sudo docker system df
```

Do not prune current or retained rollback images immediately before deployment.

## 8. Make the runtime settings explicit

On every deployment VM, add the quantization setting to both persisted environment files. This does not add the HF token; GitHub Actions does that.

```bash
sudo bash -c '
set -euo pipefail
for file in /opt/portfolio/config/.env.local /opt/portfolio-staging/config/.env.local; do
  test -f "$file"
  if grep -q "^LOCAL_TTS_QUANTIZE=" "$file"; then
    sed -i "s/^LOCAL_TTS_QUANTIZE=.*/LOCAL_TTS_QUANTIZE=true/" "$file"
  else
    printf "LOCAL_TTS_QUANTIZE=true\n" >> "$file"
  fi
  chmod 600 "$file"
done
'
```

Pocket TTS uses one active inference per container. Keep quantization enabled for the first rollout because it reduces model memory and is normally faster with the pinned CPU-only Torch 2.10 and TorchAO runtime.

Do not enable `HF_HUB_OFFLINE=1` or `LOCAL_TTS_OFFLINE=1` before the first successful warmup.

## 9. Decide whether the voice reference may be public

The bundled file is currently public at:

```text
portfolio/public/sounds/voice/TTSReference.mp3
```

If public download is acceptable, do nothing.

If it must be private, copy it to each deployment VM before promotion. Example:

```bash
sudo install -d -m 0750 -o root -g root /opt/portfolio-secrets
sudo install -m 0640 -o root -g 1000 /path/to/TTSReference.mp3 /opt/portfolio-secrets/TTSReference.mp3
```

Then add this line to both environment files:

```bash
sudo bash -c '
set -euo pipefail
for file in /opt/portfolio/config/.env.local /opt/portfolio-staging/config/.env.local; do
  if grep -q "^LOCAL_TTS_REFERENCE_HOST_PATH=" "$file"; then
    sed -i "s|^LOCAL_TTS_REFERENCE_HOST_PATH=.*|LOCAL_TTS_REFERENCE_HOST_PATH=/opt/portfolio-secrets/TTSReference.mp3|" "$file"
  else
    printf "LOCAL_TTS_REFERENCE_HOST_PATH=/opt/portfolio-secrets/TTSReference.mp3\n" >> "$file"
  fi
  chmod 600 "$file"
done
'
```

The path must be absolute and contain only letters, digits, `_`, `.`, `/`, and `-`, with no spaces. Deployment mounts it read-only inside the container.

## 10. Run VM preflight checks

Run on every target VM:

```bash
sudo docker info >/dev/null && echo docker-ok
sudo nginx -t
sudo test -r /opt/portfolio/config/.env.local && echo production-env-readable
sudo test -r /opt/portfolio-staging/config/.env.local && echo staging-env-readable
sudo test -w /var/cache/portfolio/pocket-tts && echo production-cache-writable || true
sudo test -w /var/cache/portfolio-staging/pocket-tts && echo staging-cache-writable || true
ss -tlnp | grep -E ':(3000|3010)\b' || true
free -h
swapon --show
```

The deploy script fixes cache ownership for the container, so a root-only shell check may not exactly match UID 1000. The important checks are that the directories exist, have free disk space, and can be owned by UID/GID 1000.

## 11. Merge the feature branch into `dev/lkg`

Open the pull request:

<https://github.com/Dhruv-Mishra/portfolioWebsite/pull/new/feature/pocket-tts-voice-output>

Review and merge it into `dev/lkg` only after Steps 1-10 are complete.

You can create the PR with GitHub CLI:

```powershell
Set-Location C:\portfolioWebsite
gh pr create `
  --repo Dhruv-Mishra/portfolioWebsite `
  --base dev/lkg `
  --head feature/pocket-tts-voice-output `
  --title "Add Pocket TTS custom voice output" `
  --body "Adds device/server voice output selection, Pocket TTS streaming, compression, fallback, and image deployment health checks."
```

If a PR already exists, `gh pr create` will report it; use the existing PR.

## 12. Promote to staging

The current `promote-staging.yml` still dispatches the deploy workflow with the old `deploy_mode` input, while the TTS deployment workflow is now image-only. Until that promotion workflow is corrected, use a direct human push so the `push` trigger starts staging deployment without obsolete inputs.

From PowerShell:

```powershell
Set-Location C:\portfolioWebsite
git fetch origin
git merge-base --is-ancestor origin/deployed/staging origin/dev/lkg
if ($LASTEXITCODE -ne 0) { throw 'deployed/staging is not an ancestor of dev/lkg; stop and reconcile branches' }
git push origin origin/dev/lkg:refs/heads/deployed/staging
```

Do not use force push.

Open the staging workflow:

```powershell
gh run list --repo Dhruv-Mishra/portfolioWebsite --workflow deploy-staging.yml --branch deployed/staging --limit 3
```

Or open:

<https://github.com/Dhruv-Mishra/portfolioWebsite/actions/workflows/deploy-staging.yml>

The first deployment can take several minutes because each target VM downloads the gated model, quantizes it, derives `custom-dhruv.safetensors`, and performs a real synthesis health check. A failed synthesis causes deployment rollback.

## 13. Verify staging on every deployed VM

On each staging VM, run:

```bash
sudo systemctl is-active portfolio-staging
sudo docker ps --format '{{.Names}}' | grep -qx portfolio-staging
curl -fsS http://127.0.0.1:3010/ >/dev/null && echo homepage-ok
curl -fsS \
  -H 'Origin: https://staging.whoisdhruv.com' \
  -H 'Sec-Fetch-Site: same-origin' \
  http://127.0.0.1:3010/api/tts
```

Run one synthesis probe without printing base64 audio:

```bash
rm -f /tmp/staging-tts-probe.ndjson
code="$(curl -sS --max-time 300 \
  -o /tmp/staging-tts-probe.ndjson \
  -w '%{http_code}' \
  -H 'Origin: https://staging.whoisdhruv.com' \
  -H 'Sec-Fetch-Site: same-origin' \
  -H 'Accept: application/x-ndjson' \
  -H 'X-TTS-Accept-Compression: gzip' \
  -H 'Content-Type: application/json' \
  --data '{"text":"Staging Pocket TTS verification.","stream":true}' \
  http://127.0.0.1:3010/api/tts)"
test "$code" = "200"
grep -q '"type":"ready"' /tmp/staging-tts-probe.ndjson
grep -q '"type":"chunk"' /tmp/staging-tts-probe.ndjson
grep -q '"type":"done"' /tmp/staging-tts-probe.ndjson
echo staging-tts-ok
rm -f /tmp/staging-tts-probe.ndjson
```

Check memory and swap after model warmup:

```bash
free -h
swapon --show
sudo docker stats --no-stream portfolio-staging portfolio
sudo systemctl show portfolio-staging -p MemoryCurrent -p MemoryPeak --no-pager || true
sudo journalctl -u portfolio-staging --since '-20 minutes' --no-pager | grep -Ei 'pocket|tts|oom|killed|memory|error' || true
sudo dmesg --ctime | grep -Ei 'out of memory|oom|killed process' | tail -20 || true
```

Staging is a **no-go** if any target VM shows:

- OOM kill or container restart
- sustained heavy swap use
- failed TTS health check
- no `ready`, `chunk`, or `done` frame
- unacceptable first-use or repeat latency
- production service instability while staging is warm

Also test in a browser:

1. Open <https://staging.whoisdhruv.com/settings>.
2. Confirm Voice output defaults to **Device TTS**.
3. Select **Server custom**.
4. Open chat, get a response, and use its speak control.
5. Confirm it uses the custom voice.
6. Temporarily stop or block the staging TTS request and confirm playback falls back to device speech.
7. Test a second playback of the same response to confirm browser caching is fast.

## 14. Optional offline mode after every cache is warm

Only after staging synthesis succeeds on a VM may you enable offline mode there.

For staging:

```bash
sudo bash -c '
file=/opt/portfolio-staging/config/.env.local
if grep -q "^LOCAL_TTS_OFFLINE=" "$file"; then
  sed -i "s/^LOCAL_TTS_OFFLINE=.*/LOCAL_TTS_OFFLINE=1/" "$file"
else
  printf "LOCAL_TTS_OFFLINE=1\n" >> "$file"
fi
chmod 600 "$file"
'
```

Do not enable production offline mode until production has completed its own successful model warmup. Production and staging use separate cache directories.

## 15. Promote staging to production

Do this only after all staging checks pass and the memory plan is safe on every production target.

The current `promote-production.yml` also passes the obsolete `deploy_mode` input. Until it is corrected, promote with a direct human push:

```powershell
Set-Location C:\portfolioWebsite
git fetch origin
git merge-base --is-ancestor origin/deployed/production origin/deployed/staging
if ($LASTEXITCODE -ne 0) { throw 'deployed/production is not an ancestor of deployed/staging; stop and reconcile branches' }
git push origin origin/deployed/staging:refs/heads/deployed/production
```

Do not force push.

Open the production deployment workflow and approve the production environment gate:

<https://github.com/Dhruv-Mishra/portfolioWebsite/actions/workflows/deploy.yml>

The production workflow deploys serially. Do not manually stop production first. Deployment runs a real TTS synthesis before marking each VM healthy and rolls back a failed VM.

## 16. Verify production

On every production VM:

```bash
sudo systemctl is-active portfolio
sudo docker ps --format '{{.Names}}' | grep -qx portfolio
curl -fsS http://127.0.0.1:3000/ >/dev/null && echo homepage-ok
curl -fsS \
  -H 'Origin: https://whoisdhruv.com' \
  -H 'Sec-Fetch-Site: same-origin' \
  http://127.0.0.1:3000/api/tts
free -h
swapon --show
sudo docker stats --no-stream portfolio portfolio-staging
sudo journalctl -u portfolio --since '-20 minutes' --no-pager | grep -Ei 'pocket|tts|oom|killed|memory|error' || true
```

Run the same synthesis probe from Step 13 with these substitutions:

- port `3010` -> `3000`
- origin `https://staging.whoisdhruv.com` -> `https://whoisdhruv.com`

Then test <https://whoisdhruv.com/settings> and chat in a normal browser.

## 17. Roll back if needed

The deploy script automatically rolls back a VM when startup, TTS synthesis, or required health checks fail.

For a manual production rollback, run:

```powershell
gh workflow run rollback-production.yml `
  --repo Dhruv-Mishra/portfolioWebsite `
  --ref deployed/production `
  -f site=portfolio
```

Watch it here:

<https://github.com/Dhruv-Mishra/portfolioWebsite/actions/workflows/rollback-production.yml>

To roll back to a specific retained SHA:

```powershell
gh workflow run rollback-production.yml `
  --repo Dhruv-Mishra/portfolioWebsite `
  --ref deployed/production `
  -f site=portfolio `
  -f rollback_to_sha=PUT_RETAINED_SHA_HERE
```

Do not delete Pocket TTS caches during rollback. Old images and the old `kitten-tts` cache may be needed while diagnosing or restoring a previous release.

## 18. Final cleanup after several stable days

Only after production and staging are stable on every active VM:

1. Record actual peak memory and repeat-request latency.
2. Decide whether `1200/1536` remains sufficient or should be raised.
3. Remove old, unused images with the existing deployment retention process.
4. Remove old `kitten-tts` caches only after confirming no retained rollback image needs them.
5. Enable offline mode only on environments whose Pocket TTS cache has successfully warmed.
6. If VM 1 and VM 2 remain 1 GB, keep them excluded from TTS-enabled deployments and Cloudflare origin traffic until they are resized or TTS is moved to a dedicated service.

## Short checklist

- [ ] HF model gate accepted by the token owner
- [ ] Fine-grained gated-repository read token created
- [ ] `STAGING_HF_TOKEN` repository secret added
- [ ] `PRODUCTION_HF_TOKEN` repository secret added
- [ ] Voice ownership/consent confirmed
- [ ] VM 1 and VM 2 resized or removed from deployment/origin matrices
- [ ] VM 3 confirmed to have sufficient **system RAM**, not only GPU VRAM
- [ ] Machine memory limits updated
- [ ] Production and staging Pocket caches created
- [ ] Quantization explicitly enabled
- [ ] Voice public/private decision completed
- [ ] Feature PR merged to `dev/lkg`
- [ ] Staging deployed and browser-tested
- [ ] Memory, swap, OOM, and latency checked on every staging target
- [ ] Production deployed serially and verified
- [ ] Rollback workflow ready
