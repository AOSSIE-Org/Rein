{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs_24
    python3
    gnumake
    gcc
    pkg-config
    xorg.libXtst
    xorg.libX11
    xorg.libXext
    xorg.libXinerama
    xorg.libXdamage
    xorg.libXrandr
    xorg.libXcomposite
    xorg.libXfixes
    xorg.libxcb
    xorg.libXcursor
    xorg.libXi
    xorg.libXrender
    libpng
    zlib
    gtk3
    glib
    nss
    nspr
    atk
    alsa-lib
    cups
    dbus
    pango
    cairo
    expat
    libuuid
    at-spi2-atk
    at-spi2-core
    mesa
  ];

  shellHook = ''
    export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath [
      pkgs.xorg.libXtst
      pkgs.xorg.libX11
      pkgs.xorg.libXext
      pkgs.xorg.libXinerama
      pkgs.libpng
      pkgs.zlib
      pkgs.gtk3
      pkgs.glib
      pkgs.nss
      pkgs.nspr
      pkgs.atk
      pkgs.alsa-lib
      pkgs.cups
      pkgs.dbus
      pkgs.xorg.libXdamage
      pkgs.xorg.libXrandr
      pkgs.xorg.libXcomposite
      pkgs.xorg.libXfixes
      pkgs.xorg.libxcb
      pkgs.xorg.libXcursor
      pkgs.xorg.libXi
      pkgs.xorg.libXrender
      pkgs.pango
      pkgs.cairo
      pkgs.expat
      pkgs.libuuid
      pkgs.at-spi2-atk
      pkgs.at-spi2-core
      pkgs.mesa
    ]}:$LD_LIBRARY_PATH
    
    # Alias for starting the application
    alias start="npm run start:server & npm run dev"
  '';
}
