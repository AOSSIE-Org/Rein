{ pkgs ? import <nixpkgs> { config.allowUnfree = true; } }:

let
  gstPlugins = with pkgs.gst_all_1; [
    gstreamer
    gst-plugins-base
    gst-plugins-good
    gst-plugins-bad
    gst-plugins-ugly
    gst-plugins-rs
    gst-libav
  ] ++ pkgs.lib.optional pkgs.stdenv.isLinux pkgs.pipewire;

  sharedLibs = with pkgs; [
    gtk3
    nss
    nspr
    alsa-lib
    libglvnd
    dbus
    pipewire
    libnice
  ] ++ pkgs.lib.optionals pkgs.stdenv.isLinux [
    xorg.libX11
    xorg.libXtst
    xorg.libXext
    xorg.libXi
    xorg.libXrandr
    xorg.libXfixes
  ];
in
pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs_22
    electron
    procps
    pkg-config
    git
  ] ++ pkgs.lib.optional pkgs.stdenv.isLinux pulseaudio
    ++ pkgs.lib.optional pkgs.stdenv.isLinux appimage-run
    ++ sharedLibs
    ++ gstPlugins;

  shellHook = ''
    export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath (sharedLibs ++ [ pkgs.stdenv.cc.cc.lib ])}:$LD_LIBRARY_PATH
    export GST_PLUGIN_SYSTEM_PATH_1_0=${pkgs.lib.makeSearchPathOutput "lib" "lib/gstreamer-1.0" gstPlugins}:$GST_PLUGIN_SYSTEM_PATH_1_0

    echo ""
    echo "======================================================"
    echo "  🚀 Rein Development Environment"
    echo "======================================================"
    echo "  Node.js:   $(node --version 2>/dev/null || echo 'not found')"
    echo "  GStreamer: $(gst-launch-1.0 --version 2>/dev/null | head -n 1 || echo 'not found')"
    echo ""
    echo "  Commands:"
    echo "    npm install          - Install dependencies"
    echo "    npm run dev          - Start Vite dev server"
    echo "    npm run electron-dev - Run Electron app with hot reload"
    echo "    npm run build        - Build web app and Nitro server"
    echo "    npm run test         - Run Vitest tests"
    echo "    npm run check        - Run Biome lint & format check"
    echo "======================================================"
    echo ""
  '';
}
