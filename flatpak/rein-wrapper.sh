#!/bin/bash
# Wrapper script to launch Rein inside the Flatpak sandbox.
# Extracts the bundled AppImage (--appimage-extract-and-run) so it runs
# without FUSE, which is unavailable inside the Flatpak sandbox.
exec /app/lib/rein/rein.AppImage --no-sandbox "$@"
