//go:build windows

package main

import "golang.org/x/sys/windows/registry"

// systemUsesLightTheme reports whether the taskbar is drawn light.
//
// SystemUsesLightTheme is the one that governs the taskbar and tray;
// AppsUseLightTheme governs application chrome and is a different setting a
// user can set independently. Reading the wrong one gives the right answer on
// most machines and the wrong one on anybody who mixes them.
//
// A missing key means dark: that is the Windows 11 default, and it is also what
// every machine we ship to is set to.
func systemUsesLightTheme() bool {
	k, err := registry.OpenKey(registry.CURRENT_USER,
		`SOFTWARE\Microsoft\Windows\CurrentVersion\Themes\Personalize`,
		registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer k.Close()

	v, _, err := k.GetIntegerValue("SystemUsesLightTheme")
	if err != nil {
		return false
	}
	return v == 1
}
