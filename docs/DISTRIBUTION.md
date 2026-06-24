# Distribution

Official release artifacts for **inD3X Art** are published on [GitHub Releases](https://github.com/ximaks00-hue/ind3x-art/releases).

## Linux — AppImage

AppImage is a portable single-file bundle that runs on most modern distributions without a system package install.

### Install from release

1. Download `inD3X Art_<version>_amd64.AppImage` from the latest [release](https://github.com/ximaks00-hue/ind3x-art/releases).
2. Make it executable and run:

```bash
chmod +x "inD3X Art_0.3.2_amd64.AppImage"
./"inD3X Art_0.3.2_amd64.AppImage"
```

Optional: move to `~/.local/bin` or integrate with your desktop environment (some file managers offer “Integrate and run” for AppImages).

### Build locally (Linux only)

AppImages **must** be built on Linux (Tauri does not cross-compile this format).

```bash
# Debian/Ubuntu build deps (example)
sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libgtk-3-dev

npm ci
./scripts/build-linux.sh
# → src-tauri/target/release/bundle/appimage/
```

Or: `npm run build:appimage`

### Notes

- **WebKitGTK** is bundled via the Tauri runtime; no separate browser install is required.
- **FUSE**: some minimal distros need `libfuse2` for AppImage launchers.
- **Wayland/X11**: supported through GTK/WebKit; if the window fails to open, try launching from a terminal to read stderr.

## Windows — NSIS

```powershell
.\scripts\build-windows.ps1 -Bundles nsis
# → src-tauri\target\release\bundle\nsis\inD3X Art_<version>_x64-setup.exe
```

WebView2 is installed by the NSIS bootstrapper when missing.

## CI release pipeline

Pushing a tag `v*` (e.g. `v0.3.2`) triggers [`.github/workflows/release.yml`](../.github/workflows/release.yml):

| Runner | Artifact |
|--------|----------|
| `ubuntu-22.04` | `.AppImage` |
| `windows-latest` | NSIS `.exe` installer |

Assets are attached automatically to the GitHub Release for that tag.
