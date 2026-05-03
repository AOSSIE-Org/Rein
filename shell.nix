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
    git
  ];
in
pkgs.mkShell {
  buildInputs = with pkgs; [
    bun
    procps
    appimage-run
  ] ++ sharedLibs;

  shellHook = ''
    export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath sharedLibs}:$LD_LIBRARY_PATH
    alias g="git"
    # git clone https://github.com/AOSSIE-Org/Rein .
    bun install
    bun run dist
    appimage-run ./dist/Rein-1.0.0.AppImage
    # bun run electron-dev
  '';
}
