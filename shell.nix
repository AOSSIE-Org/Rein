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
    nodejs_24
    procps
    appimage-run
    kmod
  ] ++ sharedLibs;

  shellHook = ''
    export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath sharedLibs}:$LD_LIBRARY_PATH
    alias g="git"

    if command -v modprobe >/dev/null 2>&1; then
      sudo modprobe uinput || true
    fi

    if [ -e /dev/uinput ]; then
      echo "/dev/uinput is available"
      ls -l /dev/uinput
    else
      echo "/dev/uinput is not available"
    fi
  '';
}
