# Stage 7.3d — Regenerate Signing Key Without Password

- **Status:** implemented, gates green
- **Branch:** `main`
- **Commit:** `stage7(3d): regenerate signing key without password`

## Problem

The GitHub Actions release job failed at the signing step: the password stored
in `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` did not match the private key. To make
CI deterministic, the key was regenerated **without a password**.

## Changes

### New signing key

Generated in the repository root (git-ignored, never committed):

```bash
npx tauri signer generate --ci -w ./taskflow-updater.key --force
```

The CLI warns that the key has no password — that is intentional. New public
key written to `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`):

```
dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDQ5OTE4RUNERDNGQkZDMjAKUldRZy9QdlR6WTZSU2RTYnU4TENPWFpuc0Z6TTd1cGVraGxuZjNsTkxWMzBDdE1JQkJnZWQzN2sK
```

The generated `taskflow-updater.key.pub` was deleted after copying the value;
`taskflow-updater.key` stays in the repo root but is ignored by `*.key`.

### CI workflow

Removed `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` from
`.github/workflows/release.yml`. The Tauri signer only needs
`TAURI_SIGNING_PRIVATE_KEY` for a passwordless key; leaving a stale password
secret would make signing fail again.

### Documentation

`docs/RELEASE_PROCESS.md`:

- key generation command no longer uses `-p`;
- the key is explicitly documented as **passwordless**;
- only `TAURI_SIGNING_PRIVATE_KEY` is required (entire file contents);
- the password secret must be **deleted** if it exists;
- troubleshooting row for "password/decrypt error" → stale password secret.

## Human action required

1. Open `taskflow-updater.key` and copy its **entire contents** (the
   `untrusted comment:` line plus the base64 key).
2. GitHub → Settings → Secrets and variables → Actions →
   update `TAURI_SIGNING_PRIVATE_KEY` with that value.
3. **Delete** `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if present.
4. Re-run the **Release** workflow (or push a new tag).

## Gates

| Gate            | Result                                    |
| --------------- | ----------------------------------------- |
| `npm run test`  | **115 passed**                            |
| `npm run lint`  | clean                                     |
| `npm run build` | success (pre-existing chunk-size warning) |

## Files touched

```
src-tauri/tauri.conf.json           (new pubkey)
.github/workflows/release.yml       (password env removed)
docs/RELEASE_PROCESS.md             (passwordless key instructions)
docs/reports/stage7-3d-passwordless-key.md (this report)
```
