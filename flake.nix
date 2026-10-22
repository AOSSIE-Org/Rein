{
  description = "Rein — remote desktop / couch keyboard";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    # Rein is Linux-only (uinput, PipeWire, ALSA); restrict outputs accordingly.
    flake-utils.lib.eachSystem [ "x86_64-linux" "aarch64-linux" ] (system:
      let
        pkgs = import nixpkgs { inherit system; };

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

        rein = pkgs.buildNpmPackage {
          pname = "rein";
          version = "0.5.0";
          src = ./.;

          npmDepsHash = "sha256-kQq/gCIPiL18y0kJz3ip84nCY39vYYvlFvNUIyTjpW4=";

          nativeBuildInputs = [ pkgs.nodejs_24 pkgs.makeWrapper ];

          ELECTRON_SKIP_BINARY_DOWNLOAD = "1";
          npmFlags = [ "--ignore-scripts" ];

          installPhase = ''
            runHook preInstall

            mkdir -p $out/lib/rein
            cp -r .output $out/lib/rein/
            cp -r node_modules $out/lib/rein/
            cp package.json $out/lib/rein/

            # Default server config, resolved at runtime via ../../src/server-config.json
            mkdir -p $out/lib/rein/src
            cp src/server-config.json $out/lib/rein/src/

            mkdir -p $out/bin
            makeWrapper ${pkgs.nodejs_24}/bin/node $out/bin/rein \
              --add-flags "$out/lib/rein/.output/server/index.mjs" \
              --prefix PATH : "${pkgs.gst_all_1.gstreamer}/bin" \
              --prefix LD_LIBRARY_PATH : "${pkgs.lib.makeLibraryPath sharedLibs}" \
              --set GST_PLUGIN_SYSTEM_PATH_1_0 "${pkgs.lib.makeSearchPathOutput "lib" "lib/gstreamer-1.0" sharedLibs}"

            runHook postInstall
          '';

          meta = {
            description = "Rein — remote desktop / couch keyboard streaming server";
            homepage = "https://github.com/AOSSIE-Org/Rein";
            mainProgram = "rein";
          };
        };
      in
      {
        packages.default = rein;

        apps.default = {
          type = "app";
          program = "${rein}/bin/rein";
        };

        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_24
            git
            pkg-config
            procps
            appimage-run
          ] ++ sharedLibs;

          LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath sharedLibs;
          GST_PLUGIN_SYSTEM_PATH_1_0 =
            pkgs.lib.makeSearchPathOutput "lib" "lib/gstreamer-1.0" sharedLibs;
        };
      });
}
