{
  description = "Rein — remote desktop / couch keyboard";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };

        # Native libraries Rein needs at runtime (ported from shell.nix)
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
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_24
            git
            pkg-config
            procps
            appimage-run
          ] ++ sharedLibs;

          # Set as env vars (reliable across Nix implementations, unlike shellHook)
          LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath sharedLibs;
          GST_PLUGIN_SYSTEM_PATH_1_0 =
            pkgs.lib.makeSearchPathOutput "lib" "lib/gstreamer-1.0" sharedLibs;
        };
      });
}
