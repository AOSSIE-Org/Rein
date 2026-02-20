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
    libpng
    zlib
  ];

  shellHook = ''
    export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath [
      pkgs.xorg.libXtst
      pkgs.xorg.libX11
      pkgs.xorg.libXext
      pkgs.xorg.libXinerama
      pkgs.libpng
      pkgs.zlib
    ]}:$LD_LIBRARY_PATH
    
    # Alias for starting the application
    alias start="npm run start:server & npm run dev"
  '';
}
