//go:build !windows

package main

// systemUsesLightTheme: the tray is Windows-only, so nothing else needs to ask.
func systemUsesLightTheme() bool { return false }
