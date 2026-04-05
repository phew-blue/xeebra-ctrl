.PHONY: all build build-frontend build-go dev clean

all: build

# Full production build — frontend first, then Go binary (embeds frontend/dist)
build: build-frontend build-go

build-frontend:
	cd frontend && pnpm install && pnpm build

# -H windowsgui suppresses the console window on Windows
build-go:
	GOOS=windows GOARCH=amd64 go build -ldflags="-H windowsgui" -o xeebra-ctrl.exe .

# Dev mode: run Vite dev server + Go server in parallel
# Go server runs without the tray (headless) so it works on Linux/Mac
dev:
	@echo "Starting dev servers..."
	@cd frontend && pnpm dev &
	@HEADLESS=1 go run . &
	@wait

clean:
	rm -rf frontend/dist xeebra-ctrl.exe xeebra-ctrl
