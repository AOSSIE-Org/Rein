{
  description = "Rein - Remote desktop input system and screen mirror built on WebRTC";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };

        rein = pkgs.callPackage ./default.nix { };
      in
      {
        packages = {
          default = rein;
          rein = rein;
          server = rein;
        };

        apps = {
          default = flake-utils.lib.mkApp {
            drv = rein;
            name = "rein";
          };
          rein = flake-utils.lib.mkApp {
            drv = rein;
            name = "rein";
          };
          server = flake-utils.lib.mkApp {
            drv = rein;
            name = "rein-server";
          };
        };

        devShells.default = import ./shell.nix { inherit pkgs; };
      }
    ) // {
      nixosModules.default = { config, lib, pkgs, ... }:
        let
          cfg = config.services.rein;
        in
        {
          options.services.rein = {
            enable = lib.mkEnableOption "Rein Remote Desktop Streaming Server";

            package = lib.mkOption {
              type = lib.types.package;
              default = self.packages.${pkgs.system}.default;
              description = "The Rein package to use.";
            };

            port = lib.mkOption {
              type = lib.types.port;
              default = 3000;
              description = "Port on which the Rein HTTP & WebSocket server listens.";
            };

            openFirewall = lib.mkOption {
              type = lib.types.bool;
              default = true;
              description = "Automatically open required firewall ports (TCP 3000 and UDP 4000-4050).";
            };
          };

          config = lib.mkIf cfg.enable {
            networking.firewall = lib.mkIf cfg.openFirewall {
              allowedTCPPorts = [ cfg.port ];
              allowedUDPPortRanges = [
                { from = 4000; to = 4050; }
              ];
            };

            systemd.services.rein = {
              description = "Rein Remote Desktop Streaming Server";
              after = [ "network.target" ];
              wantedBy = [ "multi-user.target" ];
              serviceConfig = {
                ExecStart = "${cfg.package}/bin/rein-server";
                Restart = "on-failure";
                Environment = [
                  "PORT=${toString cfg.port}"
                ];
              };
            };
          };
        };
    };
}
