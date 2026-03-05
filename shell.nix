{ pkgs ? import <nixpkgs> {} }:

let
  sharedLibs = with pkgs; [
    gtk3
    nss
    nspr
    alsa-lib
    libglvnd
    xorg.libXtst
    xorg.libX11
    xorg.libXext
  ];
in
pkgs.mkShell {
  buildInputs = [
    pkgs.nodejs_24
  ] ++ sharedLibs;

  shellHook = ''
    export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath sharedLibs}:$LD_LIBRARY_PATH
    
    # Alias for starting the application
    alias start="npm run start:server & npm run dev"
  '';
}


