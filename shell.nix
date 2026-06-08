{ pkgs ? import <nixpkgs> {} }:

let
  sharedLibs = with pkgs; [
    gtk3
    nss
    nspr
    alsa-lib
    libglvnd
    dbus
    fuse
    libxtst
    libx11
    libxext
    libxrandr
    libxcomposite
    libxdamage
    libxfixes
    git
  ];
in

pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs_24
    procps
    appimage-run
    ydotool
  ] ++ sharedLibs;

  shellHook = ''
    export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath sharedLibs}:$LD_LIBRARY_PATH
    alias g="git"

    echo ""
    echo "=== Rein NixOS Dev Shell ==="
    echo "Run 'npm install'                                          to install dependencies"
    echo "Run 'npm run dev'                                          to start the dev server"
    echo "Run 'npm run dist && appimage-run ./dist/Rein-*.AppImage'  to build and run"
    echo ""
    echo "NOTE (Wayland): Ensure ydotoold is running and your user is in the 'ydotool' group:"
    echo "  sudo usermod -aG ydotool \$USER  (then re-login)"
    echo "  sudo systemctl start ydotoold"
    echo ""
  '';
}