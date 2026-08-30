package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

// version is stamped at build time: -ldflags "-X main.version=$TAG".
// A "dev" build never self-updates.
var version = "dev"

// ManifestSchema is the only manifest format this build understands. Anything
// else is ignored in full rather than partially applied.
const ManifestSchema = 1

// DefaultManifestURL is an asset on the newest GitHub release, so the URL always
// tracks the latest version and nothing has to be hosted separately.
const DefaultManifestURL = "https://github.com/phew-blue/xeebra-ctrl/releases/latest/download/manifest.json"

// Asset is a downloadable release artifact.
type Asset struct {
	URL    string `json:"url"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

// Latest advertises the newest release.
type Latest struct {
	Version string `json:"version"`
	Setup   Asset  `json:"setup"`
}

// Manifest is the published release descriptor.
type Manifest struct {
	Schema int    `json:"schema"`
	Latest Latest `json:"latest"`
}

func manifestURL() string {
	if u := os.Getenv("XEEBRA_CTRL_MANIFEST_URL"); u != "" {
		return u
	}
	return DefaultManifestURL
}

// fetchManifest always hits the network. A scheduled check must not be answered
// from a cache — that is exactly the window in which a new release appears.
func fetchManifest(url string) (*Manifest, error) {
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("manifest: HTTP %d", resp.StatusCode)
	}
	var m Manifest
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&m); err != nil {
		return nil, fmt.Errorf("manifest: %w", err)
	}
	if m.Schema != ManifestSchema {
		return nil, fmt.Errorf("manifest: unsupported schema %d", m.Schema)
	}
	return &m, nil
}

// needsUpdate reports whether latest is newer than current.
func needsUpdate(current, latest string) bool {
	if current == "dev" || current == "" || latest == "" {
		return false
	}
	return compareSemver(strings.TrimPrefix(latest, "v"), strings.TrimPrefix(current, "v")) > 0
}

// compareSemver compares major.minor.patch numerically, so v0.10.0 beats v0.9.0.
func compareSemver(a, b string) int {
	as, bs := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < 3; i++ {
		an, bn := 0, 0
		if i < len(as) {
			an, _ = strconv.Atoi(as[i])
		}
		if i < len(bs) {
			bn, _ = strconv.Atoi(bs[i])
		}
		switch {
		case an > bn:
			return 1
		case an < bn:
			return -1
		}
	}
	return 0
}

// downloadAsset fetches a to dst and verifies its sha256. An unverified
// installer is never run.
func downloadAsset(a Asset, dst string) error {
	if a.URL == "" || a.SHA256 == "" {
		return fmt.Errorf("release asset has no url or sha256")
	}
	client := &http.Client{Timeout: 10 * time.Minute}
	resp, err := client.Get(a.URL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("update: HTTP %d", resp.StatusCode)
	}
	f, err := os.Create(dst)
	if err != nil {
		return err
	}
	if _, err := io.Copy(f, resp.Body); err != nil {
		f.Close()
		os.Remove(dst)
		return err
	}
	f.Close()

	if err := verifySHA256(dst, a.SHA256); err != nil {
		os.Remove(dst)
		return err
	}
	return nil
}

func verifySHA256(path, want string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return err
	}
	got := hex.EncodeToString(h.Sum(nil))
	if !strings.EqualFold(got, want) {
		return fmt.Errorf("sha256 mismatch: got %s, want %s", got, want)
	}
	return nil
}
