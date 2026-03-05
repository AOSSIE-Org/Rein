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
    xorg.libXtst
    xorg.libX11
    xorg.libXext
  ];
in
pkgs.mkShell {
  buildInputs = [
    pkgs.nodejs_24
    pkgs.procps
    pkgs.appimage-run
  ] ++ sharedLibs;

  shellHook = ''
    export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath sharedLibs}:$LD_LIBRARY_PATH
    
    # Alias for starting the application
    alias start="npm i && npm run electron-dev"
  '';
}


