//go:build windows

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// CheckAndUpdate installs the newest release if the manifest advertises one.
// The sequence mirrors wallpaper-info's proven path: download, verify, run the
// installer silently, then exit so the installer can replace this running exe.
//
// This only works because the app installs under %LOCALAPPDATA% and can
// therefore be replaced without elevation — see notes/windows-app-layout.md.
func CheckAndUpdate(userInitiated bool) error {
	m, err := fetchManifest(manifestURL())
	if err != nil {
		return err
	}
	if !needsUpdate(version, m.Latest.Version) {
		if userInitiated {
			fmt.Fprintf(os.Stderr, "xeebra-ctrl: already up to date (%s)\n", version)
		}
		return nil
	}

	tmp := filepath.Join(os.TempDir(), "xeebra-ctrl-setup.exe")
	if err := downloadAsset(m.Latest.Setup, tmp); err != nil {
		return err
	}
	// /NORESTART because the installer's [Run] entry starts us again.
	if err := exec.Command(tmp, "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART").Start(); err != nil {
		return err
	}
	os.Exit(0)
	return nil
}
