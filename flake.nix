{
  description = "A development environment for Go, JS (React/Svelte), and Arduino projects.";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };
  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            # --- Go Backend Dependencies ---
            go # The Go compiler and toolchain
            gopls # The official Go language server for IDE integration

            # --- Frontend Dependencies ---
            nodejs_24 # A recent LTS version of Node.js
            corepack_24 # To manage package managers like pnpm and yarn

            # --- Arduino Dependencies ---
            arduino-cli # The command-line interface for Arduino

            # --- General C/C++ Build Tools (often needed for Arduino) ---
            gcc # The GNU Compiler Collection (for C/C++)
            gnumake # The 'make' utility
          ];

          shellHook = ''
            # Set up Go environment
            export GOROOT="$(go env GOROOT)"
            export GOPATH="$HOME/go"
            export GOPROXY="https://proxy.golang.org,direct"
            export GOSUMDB="sum.golang.org"
            export PATH="$GOPATH/bin:$GOROOT/bin:$PATH"
            
            # Create GOPATH directories if they don't exist
            mkdir -p "$GOPATH"/{bin,src,pkg}
            
            echo "--------------------------------------------------"
            echo "  Entering multi-project development environment  "
            echo "--------------------------------------------------"
            echo "Available tools:"
            echo "- Go: $(go version)"
            echo "- Node.js: $(node --version)"
            echo "- Arduino CLI: $(arduino-cli version)"
            echo "--------------------------------------------------"
            echo "To get started with Arduino:"
            echo "1. Update the local index: arduino-cli core update-index"
            echo "2. List connected boards: arduino-cli board list"
            echo "3. Compile a sketch: arduino-cli compile --fqbn <board> <sketch_folder>"
            echo "4. Upload a sketch: arduino-cli upload -p <port> --fqbn <board> <sketch_folder>"
            echo "--------------------------------------------------"
          '';
        };
      }
    );
}
