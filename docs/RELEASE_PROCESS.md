# TaskFlow Release Process

TaskFlow ships through two update channels:

- **Online** — GitHub Releases + Tauri updater (`latest.json`, signed artifacts).
- **Offline** — a manual installer dropped into `{workspace}/updates/`.

---

## One-time setup

### Repository visibility (critical)

**The repository must be PUBLIC.** The in-app updater downloads
`.../releases/latest/download/latest.json` anonymously; GitHub requires
authentication for release assets of **private** repositories, so online updates
would fail with 404/401.

Make it public under **Settings → General → Danger Zone → Change repository
visibility → Public**. (If the code must stay private, host the signed
installers + `latest.json` on a public static host and change the endpoint.)

### Signing keys

The updater verifies release signatures with the public key stored in
`src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).

The matching **private key must never be committed** (`*.key` is git-ignored).
Generate a **passwordless** keypair with:

```bash
npx tauri signer generate --ci -w ./taskflow-updater.key --force
```

> The key intentionally has **no password** (`--ci` skips the prompt; press
> Enter if you run it interactively). This keeps CI simple: there is no password
> to mismatch.

Add this repository secret (Settings → Secrets and variables → Actions):

| Secret                      | Value                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY` | entire contents of `taskflow-updater.key` (the `untrusted comment:` line + base64 key) |

**Do not add `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.** The workflow does not use
it. If it already exists from an older setup, **delete it** — a stale password
makes the signer fail even though the new key has none.

If the key is ever regenerated, update `plugins.updater.pubkey` in
`tauri.conf.json` **and** the `TAURI_SIGNING_PRIVATE_KEY` secret together;
otherwise every update will fail signature verification.

### Updater endpoint

`tauri.conf.json` points at:

```
https://github.com/evangreen165/taskflow-desktop/releases/latest/download/latest.json
```

This URL resolves to the `latest.json` asset of the newest non-prerelease
GitHub Release. No server is required.

Verify the owner/repository segment matches the real repo
(`evangreen165/taskflow-desktop`); a typo makes every update check return 404.

---

## Cutting a release

1. **Bump the version** (keep them in sync):
   - `package.json` → `"version"`
   - `package-lock.json` → root `version` fields
   - `src-tauri/tauri.conf.json` → `"version"`
   - `npm run version:check` must print `version OK`.
2. **Update `CHANGELOG.md`**: rename `[Unreleased]` to `[X.Y.Z] - YYYY-MM-DD`
   and list the changes.
3. **Commit** the release docs:
   ```bash
   git commit -am "docs: release X.Y.Z (<stage name>)"
   ```
4. **Tag and push**:
   ```bash
   git tag -a vX.Y.Z -m "Release X.Y.Z: <summary>"
   git push origin main
   git push origin --tags
   ```
5. **GitHub Actions** (`.github/workflows/release.yml`) triggers on the `v*`
   tag and, on `windows-latest`:
   - installs Node/Rust dependencies (`npm ci`, Rust cache);
   - runs the Tauri build (through `tauri-action`, equivalent to
     `npm run tauri build`);
   - signs updater artifacts with the secrets above;
   - creates the GitHub Release and uploads the `.msi`, NSIS `.exe`, their
     `.sig` files and `latest.json`.

No manual artifact upload is needed.

---

## Manual workflow trigger

If pushing the tag did not start a build (for example the workflow was added
after the tag was created, or Actions was disabled), run it manually:

1. Open the repository on GitHub → **Actions**.
2. Select **Release** in the left sidebar.
3. Click **Run workflow**.
4. Choose the branch (usually `main`) and enter the **existing** tag
   (e.g. `v0.6.0`) in the **Tag to build and publish** field.
5. Click **Run workflow**.

The workflow creates/updates the GitHub Release for that tag and attaches the
MSI, NSIS EXE, `.sig` files and `latest.json`.

> Create and push the tag first (`git tag -a vX.Y.Z && git push origin --tags`).
> The manual trigger builds the release for the tag you type, not for a branch.

---

## Manual release fallback (Actions unavailable)

If GitHub Actions cannot run, publish the release by hand:

1. Build locally on Windows:
   ```bash
   npm ci
   npm run tauri build
   ```
   With `createUpdaterArtifacts: true`, Tauri writes the installers and `.sig`
   files under `src-tauri/target/release/bundle/`:
   - `msi/TaskFlow_<version>_x64_en-US.msi` (+ `.sig`)
   - `nsis/TaskFlow_<version>_x64-setup.exe` (+ `.sig`)
2. Create `latest.json` (the updater reads it from the **latest** release):
   ```json
   {
     "version": "<version>",
     "notes": "<release notes>",
     "pub_date": "<YYYY-MM-DDTHH:MM:SSZ>",
     "platforms": {
       "windows-x86_64": {
         "signature": "<contents of the .exe.sig file>",
         "url": "https://github.com/evangreen165/taskflow-desktop/releases/download/v<version>/TaskFlow_<version>_x64-setup.exe"
       }
     }
   }
   ```
   Use the NSIS `.exe` and its `.sig` for `windows-x86_64`.
3. On GitHub → **Releases** → **Draft a new release**, select the existing tag,
   and attach:
   - the `.msi`;
   - the NSIS `.exe`;
   - both `.sig` files;
   - `latest.json`.
4. Publish the release (not a draft, not a prerelease). The URL
   `.../releases/latest/download/latest.json` only resolves for the latest
   published non-prerelease release.

---

## How users receive updates

### Online

`/app/settings` → **О программе** → **Обновления** → **Проверить обновления**:

- checks the GitHub `latest.json`;
- shows the new version and release notes;
- **Скачать и установить** downloads, verifies the signature and installs the
  update (restart the app if the platform does not do it automatically).

### Offline (SMB / air-gapped)

1. Put the installer and a manifest into the workspace:

   ```
   {workspace}/updates/update.json
   {workspace}/updates/TaskFlow_0.7.0_x64-setup.exe
   ```

   `update.json`:

   ```json
   {
     "version": "0.7.0",
     "notes": "Stage 7 polish",
     "path": "updates/TaskFlow_0.7.0_x64-setup.exe"
   }
   ```

2. The app detects it on **Проверить обновления** (the offline check runs first)
   and shows **Установить и перезапустить**.
3. The backend validates the path (must be inside `updates/`, `.exe`/`.msi`
   only), launches the installer and exits immediately so files are not locked.

The version comparison is `major.minor.patch`; `v` prefixes and
`-prerelease`/`+build` suffixes are accepted.

---

## Multi-user sync notes

- The Rust watcher covers the whole workspace recursively and emits
  `workspace://fs-event`; the UI reacts to task and notification changes
  immediately.
- If an SMB server drops change events, the fallback polls refresh tasks and
  the dashboard every 30 s, and notifications every 30 s.

---

## Troubleshooting

| Symptom                                       | Likely cause                                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Actions workflow did not run                  | Tag not pushed, Actions disabled, or workflow added after the tag; use **Actions → Release → Run workflow** |
| "signature verification failed"               | `TAURI_SIGNING_PRIVATE_KEY` does not match `plugins.updater.pubkey`                                         |
| Signing fails with a password/decrypt error   | Stale `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secret; the key is passwordless — delete it                      |
| Online check returns 404                      | Repo is private, `latest.json` is missing, or the release is a draft/prerelease                             |
| `latest.json` signature mismatch              | `.sig` content does not belong to the uploaded installer / wrong signing key                                |
| Offline update not detected                   | Wrong folder (`updates/` must be in the workspace root), or `version` is not higher                         |
| "installer must be inside the updates folder" | `path` points outside `{workspace}/updates/`                                                                |
| Changes from another PC appear late           | SMB watcher dropped events; wait for the 30 s poll (or fix SMB change-notify)                               |
