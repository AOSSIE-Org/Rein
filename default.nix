{ pkgs ? import <nixpkgs> { config.allowUnfree = true; }
, lib ? pkgs.lib
, stdenv ? pkgs.stdenv
, buildNpmPackage ? pkgs.buildNpmPackage
, makeWrapper ? pkgs.makeWrapper
, pkg-config ? pkgs.pkg-config
, nodejs ? pkgs.nodejs_22
, electron ? pkgs.electron
, gst_all_1 ? pkgs.gst_all_1
, pipewire ? pkgs.pipewire
, pulseaudio ? pkgs.pulseaudio
, gtk3 ? pkgs.gtk3
, nss ? pkgs.nss
, nspr ? pkgs.nspr
, alsa-lib ? pkgs.alsa-lib
, libglvnd ? pkgs.libglvnd
, dbus ? pkgs.dbus
, libnice ? pkgs.libnice
, xorg ? pkgs.xorg
, procps ? pkgs.procps
, which ? pkgs.which
, npmDepsHash ? "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
}:

let
  gstPlugins = with gst_all_1; [
    gstreamer
    gst-plugins-base
    gst-plugins-good
    gst-plugins-bad
    gst-plugins-ugly
    gst-plugins-rs
    gst-libav
  ] ++ lib.optional stdenv.isLinux pipewire;

  sharedLibs = [
    gtk3
    nss
    nspr
    alsa-lib
    libglvnd
    dbus
    pipewire
    libnice
  ] ++ lib.optionals stdenv.isLinux [
    xorg.libX11
    xorg.libXtst
    xorg.libXext
    xorg.libXi
    xorg.libXrandr
    xorg.libXfixes
  ];

  runtimeBinPath = [
    gst_all_1.gstreamer
    nodejs
    procps
    which
  ] ++ lib.optional stdenv.isLinux pulseaudio;

  packageJson = builtins.fromJSON (builtins.readFile ./package.json);
in
buildNpmPackage {
  pname = "rein";
  version = packageJson.version;

  src = lib.cleanSource ./.;

  inherit npmDepsHash;
  inherit nodejs;

  nativeBuildInputs = [
    makeWrapper
    pkg-config
  ];

  buildInputs = sharedLibs ++ gstPlugins;

  npmBuildScript = "build";

  # Prevent electron download attempts in the sandboxed build
  ELECTRON_SKIP_BINARY_DOWNLOAD = "1";

  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib/rein
    cp -r .output $out/lib/rein/
    cp -r electron $out/lib/rein/
    cp -r package.json $out/lib/rein/
    cp -r node_modules $out/lib/rein/

    if [ -d brand ]; then
      cp -r brand $out/lib/rein/
    fi

    if [ -f src/server-config.json ]; then
      mkdir -p $out/lib/rein/src
      cp src/server-config.json $out/lib/rein/src/
    fi

    mkdir -p $out/bin

    # Rein desktop application wrapper (Electron)
    makeWrapper ${electron}/bin/electron $out/bin/rein \
      --add-flags "$out/lib/rein/electron/main.cjs" \
      --set REIN_SERVER_PATH "$out/lib/rein/.output/server/index.mjs" \
      --prefix PATH : ${lib.makeBinPath runtimeBinPath} \
      --prefix LD_LIBRARY_PATH : ${lib.makeLibraryPath (sharedLibs ++ [ stdenv.cc.cc.lib ])} \
      --prefix GST_PLUGIN_SYSTEM_PATH_1_0 : ${lib.makeSearchPathOutput "lib" "lib/gstreamer-1.0" gstPlugins}

    # Headless streaming server wrapper (Node.js)
    makeWrapper ${nodejs}/bin/node $out/bin/rein-server \
      --add-flags "$out/lib/rein/.output/server/index.mjs" \
      --prefix PATH : ${lib.makeBinPath runtimeBinPath} \
      --prefix LD_LIBRARY_PATH : ${lib.makeLibraryPath (sharedLibs ++ [ stdenv.cc.cc.lib ])} \
      --prefix GST_PLUGIN_SYSTEM_PATH_1_0 : ${lib.makeSearchPathOutput "lib" "lib/gstreamer-1.0" gstPlugins}

    # Desktop entry & application icon
    mkdir -p $out/share/applications $out/share/icons/hicolor/512x512/apps
    if [ -f brand/Media-Assets/Icons/Icon512.png ]; then
      cp brand/Media-Assets/Icons/Icon512.png $out/share/icons/hicolor/512x512/apps/rein.png
    fi

    cat > $out/share/applications/rein.desktop <<EOF
[Desktop Entry]
Name=Rein
Comment=Remote desktop input system and screen mirror built on WebRTC
Exec=$out/bin/rein
Icon=rein
Type=Application
Categories=Network;RemoteAccess;Utility;
Terminal=false
EOF

    runHook postInstall
  '';

  meta = with lib; {
    description = "Remote desktop input system and screen mirror built on WebRTC";
    homepage = "https://github.com/AOSSIE-Org/Rein";
    license = licenses.asl20;
    maintainers = [ ];
    platforms = platforms.linux;
    mainProgram = "rein";
  };
}
