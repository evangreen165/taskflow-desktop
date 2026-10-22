# TaskFlow Release Process

TaskFlow ships through two update channels:

- **Online** — GitHub Releases + Tauri updater (`latest.json`, signed artifacts).
- **Offline** — a manual installer dropped into `{workspace}/updates/`.

---

## One-time setup

### Signing keys

The updater verifies release signatures with the public key stored in
`src-tauri/tauri.conf.json` (`plugins.updater.pubkey`).

The matching **private key must never be committed** (`*.key` is git-ignored).
Generate a keypair with:

```bash
npx tauri signer generate --ci -p "<password>" -w taskflow-updater.key -f
```

Add these repository secrets (Settings → Secrets and variables → Actions):

| Secret                               | Value                              |
| ------------------------------------ | ---------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | contents of `taskflow-updater.key` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | the password used above            |

If the key is ever regenerated, update `plugins.updater.pubkey` in
`tauri.conf.json` **and** the secrets together; otherwise every update will fail
signature verification.

### Updater endpoint

`tauri.conf.json` points at:

```
https://github.com/evangreen165/taskflow-desktop/releases/latest/download/latest.json
```

This URL resolves to the `latest.json` asset of the newest non-prerelease
GitHub Release. No server is required.

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

| Symptom                                       | Likely cause                                                                        |
| --------------------------------------------- | ----------------------------------------------------------------------------------- |
| "signature verification failed"               | Private key/password in CI does not match `plugins.updater.pubkey`                  |
| Online check returns 404                      | `latest.json` not published, or the release is a draft/prerelease                   |
| Offline update not detected                   | Wrong folder (`updates/` must be in the workspace root), or `version` is not higher |
| "installer must be inside the updates folder" | `path` points outside `{workspace}/updates/`                                        |
| Changes from another PC appear late           | SMB watcher dropped events; wait for the 30 s poll (or fix SMB change-notify)       |
