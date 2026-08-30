package main

import (
	"bufio"
	_ "embed"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/getlantern/systray"
)

//go:embed assets/icon-green.ico
var iconGreen []byte

//go:embed assets/icon-amber.ico
var iconAmber []byte

//go:embed assets/icon-red.ico
var iconRed []byte

const pollInterval = 5 * time.Second

type trayApp struct {
	server     *server
	statusItem *systray.MenuItem
	openItem   *systray.MenuItem
	updateItem *systray.MenuItem
	quitItem   *systray.MenuItem
}

// updateCheckDelay is the wait after logon before the first update check —
// long enough for the network to settle on a machine that just booted.
const updateCheckDelay = 5 * time.Minute

// updateCheckInterval is the cadence after that first check.
const updateCheckInterval = 24 * time.Hour

func main() {
	// Run the update check and exit. Same code path the tray menu uses, but
	// reachable without a desktop session — handy for scripted rollouts.
	if len(os.Args) > 1 && os.Args[1] == "--check-update" {
		if err := CheckAndUpdate(true); err != nil {
			fmt.Fprintf(os.Stderr, "update check failed: %v\n", err)
			os.Exit(1)
		}
		return
	}

	// --version prints the stamped build version and exits.
	if len(os.Args) > 1 && os.Args[1] == "--version" {
		fmt.Println(version)
		return
	}

	// HEADLESS env var: run server only (for dev on non-Windows)
	if os.Getenv("HEADLESS") == "1" {
		srv := newServer()
		if err := srv.loadConfig(); err != nil {
			fmt.Fprintf(os.Stderr, "config error: %v\n", err)
			os.Exit(1)
		}
		srv.start()
		select {} // block forever
	}
	systray.Run(onReady, func() {})
}

func onReady() {
	srv := newServer()
	if err := srv.loadConfig(); err != nil {
		systray.SetIcon(iconRed)
		systray.SetTooltip("xeebra-ctrl — config error")
		item := systray.AddMenuItem("Config error: "+err.Error(), "")
		item.Disable()
		systray.AddSeparator()
		quit := systray.AddMenuItem("Quit", "")
		go func() {
			<-quit.ClickedCh
			systray.Quit()
		}()
		return
	}

	go srv.start()

	a := &trayApp{server: srv}
	a.buildMenu()
	go a.pollLoop()
	go a.updateLoop()
}

func (a *trayApp) buildMenu() {
	systray.SetIcon(iconAmber)
	systray.SetTooltip("xeebra-ctrl")

	title := systray.AddMenuItem("xeebra-ctrl", "")
	title.Disable()

	systray.AddSeparator()

	a.statusItem = systray.AddMenuItem("Server: starting...", "")
	a.statusItem.Disable()

	systray.AddSeparator()

	a.openItem = systray.AddMenuItem("Open in browser", "")

	systray.AddSeparator()

	a.updateItem = systray.AddMenuItem("Check for updates", "")

	systray.AddSeparator()

	a.quitItem = systray.AddMenuItem("Quit", "")

	go a.handleClicks()
}

func (a *trayApp) handleClicks() {
	for {
		select {
		case <-a.openItem.ClickedCh:
			openURL(fmt.Sprintf("http://localhost:%d", a.server.config.Port))
		case <-a.updateItem.ClickedCh:
			go func() {
				if err := CheckAndUpdate(true); err != nil {
					fmt.Fprintf(os.Stderr, "update check failed: %v\n", err)
				}
			}()
		case <-a.quitItem.ClickedCh:
			systray.Quit()
			return
		}
	}
}

// updateLoop keeps an unattended machine from drifting: check shortly after
// logon, then once a day. CheckAndUpdate exits the process when it installs, so
// this returns only while we are already up to date.
func (a *trayApp) updateLoop() {
	time.Sleep(updateCheckDelay)
	for {
		if err := CheckAndUpdate(false); err != nil {
			fmt.Fprintf(os.Stderr, "update check failed: %v\n", err)
		}
		time.Sleep(updateCheckInterval)
	}
}

func (a *trayApp) pollLoop() {
	for {
		a.refresh()
		time.Sleep(pollInterval)
	}
}

func (a *trayApp) refresh() {
	url := fmt.Sprintf("http://localhost:%d/api/health", a.server.config.Port)
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get(url)
	if err != nil || resp.StatusCode != 200 {
		a.statusItem.SetTitle("Server: stopped")
		systray.SetIcon(iconRed)
		return
	}
	a.statusItem.SetTitle("Server: running")
	systray.SetIcon(iconGreen)
}

func openURL(url string) {
	switch runtime.GOOS {
	case "windows":
		_ = execCommand("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		_ = execCommand("open", url)
	default:
		_ = execCommand("xdg-open", url)
	}
}

func readConfigFile(path string) map[string]string {
	out := make(map[string]string)
	f, err := os.Open(path)
	if err != nil {
		return out
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if ok {
			out[strings.TrimSpace(k)] = strings.TrimSpace(v)
		}
	}
	return out
}

func exeDir() string {
	exe, err := os.Executable()
	if err != nil {
		return "."
	}
	return filepath.Dir(exe)
}
