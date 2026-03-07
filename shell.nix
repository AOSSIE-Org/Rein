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
  ];
in
pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs_24
    procps
    appimage-run
  ] ++ sharedLibs;

  shellHook = ''
    export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath sharedLibs}:$LD_LIBRARY_PATH
    
    # Alias for starting the application
    npm i
    npm run electron-dev
  '';
}


