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
    gst_all_1.gstreamer
    gst_all_1.gst-plugins-base
    gst_all_1.gst-plugins-good
    gst_all_1.gst-plugins-bad
    gst_all_1.gst-plugins-ugly
    gst_all_1.gst-plugins-rs
    pipewire
    libnice
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
    export GST_PLUGIN_SYSTEM_PATH_1_0=${pkgs.lib.makeSearchPathOutput "lib" "lib/gstreamer-1.0" sharedLibs}:$GST_PLUGIN_SYSTEM_PATH_1_0

    alias g="git"
    # git clone https://github.com/AOSSIE-Org/Rein .
    npm i
    npm run dist
    appimage-run ./dist/Rein-1.0.0.AppImage
    # npm run electron-dev
  '';
}

