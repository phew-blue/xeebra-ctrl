package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

//go:embed all:frontend/dist
var frontendFiles embed.FS

// Config mirrors xeebra-ctrl.config.json
type Config struct {
	Port   int     `json:"port"`
	Groups []Group `json:"groups"`
}

type Group struct {
	Name        string `json:"name"`
	APIServerIP string `json:"apiServerIp"`
	SSHUser     string `json:"sshUser"`
	SSHPassword string `json:"sshPassword"`
}

type server struct {
	mu     sync.RWMutex
	config Config
}

func newServer() *server {
	return &server{
		config: Config{Port: 3200},
	}
}

func (s *server) saveConfig() error {
	data, err := json.MarshalIndent(s.config, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}
	path := filepath.Join(exeDir(), "xeebra-ctrl.config.json")
	return os.WriteFile(path, data, 0644) //nolint:gosec
}

func (s *server) loadConfig() error {
	path := filepath.Join(exeDir(), "xeebra-ctrl.config.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("cannot read xeebra-ctrl.config.json: %w", err)
	}
	if err := json.Unmarshal(data, &s.config); err != nil {
		return fmt.Errorf("invalid config JSON: %w", err)
	}
	if s.config.Port == 0 {
		s.config.Port = 3200
	}
	// Apply credential defaults
	for i := range s.config.Groups {
		if s.config.Groups[i].SSHUser == "" {
			s.config.Groups[i].SSHUser = "evs"
		}
		if s.config.Groups[i].SSHPassword == "" {
			s.config.Groups[i].SSHPassword = "evs123"
		}
	}
	return nil
}

func (s *server) start() {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", s.handleHealth)
	mux.HandleFunc("GET /api/config", s.handleConfig)
	mux.HandleFunc("GET /api/proxy", s.handleProxyGet)
	mux.HandleFunc("POST /api/proxy", s.handleProxyPost)
	mux.HandleFunc("GET /api/proxy-image", s.handleProxyImage)
	mux.HandleFunc("POST /api/shutdown", s.handleShutdown)
	mux.HandleFunc("POST /api/restart", s.handleRestart)
	mux.HandleFunc("POST /api/settings/groups", s.handleCreateGroup)
	mux.HandleFunc("PUT /api/settings/groups/{index}", s.handleUpdateGroup)
	mux.HandleFunc("DELETE /api/settings/groups/{index}", s.handleDeleteGroup)

	// Serve embedded React frontend
	sub, err := fs.Sub(frontendFiles, "frontend/dist")
	if err == nil {
		mux.Handle("/", http.FileServer(http.FS(sub)))
	}

	addr := fmt.Sprintf(":%d", s.config.Port)
	fmt.Printf("xeebra-ctrl listening on http://localhost%s\n", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		fmt.Fprintf(os.Stderr, "server error: %v\n", err)
	}
}

// GET /api/health
func (s *server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write([]byte(`{"ok":true}`))
}

// GET /api/config
func (s *server) handleConfig(w http.ResponseWriter, _ *http.Request) {
	s.mu.RLock()
	cfg := s.config
	s.mu.RUnlock()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(cfg)
}

// POST /api/settings/groups  body: {name, apiServerIp, sshUser, sshPassword}
func (s *server) handleCreateGroup(w http.ResponseWriter, r *http.Request) {
	var g Group
	if err := json.NewDecoder(r.Body).Decode(&g); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if g.Name == "" || g.APIServerIP == "" {
		jsonError(w, "name and apiServerIp required", http.StatusBadRequest)
		return
	}
	if g.SSHUser == "" {
		g.SSHUser = "evs"
	}
	if g.SSHPassword == "" {
		g.SSHPassword = "evs123"
	}
	s.mu.Lock()
	s.config.Groups = append(s.config.Groups, g)
	if err := s.saveConfig(); err != nil {
		s.mu.Unlock()
		jsonError(w, "failed to save config: "+err.Error(), http.StatusInternalServerError)
		return
	}
	cfg := s.config
	s.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(cfg)
}

// PUT /api/settings/groups/{index}  body: {name, apiServerIp, sshUser, sshPassword}
func (s *server) handleUpdateGroup(w http.ResponseWriter, r *http.Request) {
	indexStr := r.PathValue("index")
	idx := 0
	if _, err := fmt.Sscanf(indexStr, "%d", &idx); err != nil || idx < 0 {
		jsonError(w, "invalid index", http.StatusBadRequest)
		return
	}
	var g Group
	if err := json.NewDecoder(r.Body).Decode(&g); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if g.Name == "" || g.APIServerIP == "" {
		jsonError(w, "name and apiServerIp required", http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	if idx >= len(s.config.Groups) {
		s.mu.Unlock()
		jsonError(w, "group index out of range", http.StatusNotFound)
		return
	}
	s.config.Groups[idx] = g
	if err := s.saveConfig(); err != nil {
		s.mu.Unlock()
		jsonError(w, "failed to save config: "+err.Error(), http.StatusInternalServerError)
		return
	}
	cfg := s.config
	s.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(cfg)
}

// DELETE /api/settings/groups/{index}
func (s *server) handleDeleteGroup(w http.ResponseWriter, r *http.Request) {
	indexStr := r.PathValue("index")
	idx := 0
	if _, err := fmt.Sscanf(indexStr, "%d", &idx); err != nil || idx < 0 {
		jsonError(w, "invalid index", http.StatusBadRequest)
		return
	}
	s.mu.Lock()
	if idx >= len(s.config.Groups) {
		s.mu.Unlock()
		jsonError(w, "group index out of range", http.StatusNotFound)
		return
	}
	s.config.Groups = append(s.config.Groups[:idx], s.config.Groups[idx+1:]...)
	if err := s.saveConfig(); err != nil {
		s.mu.Unlock()
		jsonError(w, "failed to save config: "+err.Error(), http.StatusInternalServerError)
		return
	}
	cfg := s.config
	s.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(cfg)
}

// GET /api/proxy?ip=ADDR&path=/api/xeebra-config/servers
func (s *server) handleProxyGet(w http.ResponseWriter, r *http.Request) {
	ip := r.URL.Query().Get("ip")
	path := r.URL.Query().Get("path")
	if ip == "" || path == "" {
		http.Error(w, "ip and path required", http.StatusBadRequest)
		return
	}
	target := fmt.Sprintf("http://%s%s", ip, path)
	proxyGet(w, target)
}

// POST /api/proxy  body: {"ip":"...","path":"...","body":{...}}
func (s *server) handleProxyPost(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IP   string          `json:"ip"`
		Path string          `json:"path"`
		Body json.RawMessage `json:"body"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.IP == "" || req.Path == "" {
		http.Error(w, "ip and path required", http.StatusBadRequest)
		return
	}
	target := fmt.Sprintf("http://%s%s", req.IP, req.Path)
	proxyPost(w, target, req.Body)
}

// GET /api/proxy-image?ip=ADDR&sdiboard=0&sdiport=0
func (s *server) handleProxyImage(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	ip := q.Get("ip")
	board := q.Get("sdiboard")
	port := q.Get("sdiport")
	if ip == "" || board == "" || port == "" {
		http.Error(w, "ip, sdiboard and sdiport required", http.StatusBadRequest)
		return
	}
	target := fmt.Sprintf("http://%s:9081/api/platform-console/metrics/sdichannelpicture?sdiboard=%s&sdiport=%s", ip, board, port)
	proxyGet(w, target)
}

// POST /api/shutdown  body: {"serverId":"...","serverIp":"...","apiServerIp":"...","credentials":{...}}
func (s *server) handleShutdown(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ServerID    string `json:"serverId"`
		ServerIP    string `json:"serverIp"`
		APIServerIP string `json:"apiServerIp"`
		Credentials struct {
			Username string `json:"username"`
			Password string `json:"password"`
		} `json:"credentials"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.ServerID == "" || req.ServerIP == "" {
		jsonError(w, "serverId and serverIp required", http.StatusBadRequest)
		return
	}
	if req.APIServerIP == "" {
		req.APIServerIP = req.ServerIP
	}

	// Step 1: check status
	cfgURL := fmt.Sprintf("http://%s/api/xeebra-config/servers/%s/configuration", req.APIServerIP, req.ServerID)
	body, err := httpGet(cfgURL, 10*time.Second)
	if err != nil {
		jsonError(w, "failed to get server configuration: "+err.Error(), http.StatusInternalServerError)
		return
	}
	var cfg struct {
		Status string `json:"status"`
	}
	_ = json.Unmarshal(body, &cfg)

	// Step 2: stop if running
	if cfg.Status == "RUNNING" {
		stopURL := fmt.Sprintf("http://%s/api/xeebra-config/servers/%s/configuration/_stop", req.APIServerIP, req.ServerID)
		if _, err := httpPost(stopURL, nil, 10*time.Second); err != nil {
			jsonError(w, "failed to stop server: "+err.Error(), http.StatusInternalServerError)
			return
		}
		time.Sleep(10 * time.Second)
	}

	// Step 3: SSH shutdown
	sshCfg := &ssh.ClientConfig{
		User:            req.Credentials.Username,
		Auth:            []ssh.AuthMethod{ssh.Password(req.Credentials.Password)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), //nolint:gosec
		Timeout:         20 * time.Second,
	}
	client, err := ssh.Dial("tcp", req.ServerIP+":22", sshCfg)
	if err != nil {
		jsonError(w, "SSH connection failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer client.Close()

	sess, err := client.NewSession()
	if err != nil {
		jsonError(w, "SSH session failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer sess.Close()
	_ = sess.Run("sudo shutdown now")

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success": true,
		"message": "Server shutdown initiated",
	})
}

// POST /api/restart  body: {"serverId":"...","serverIp":"...","apiServerIp":"...","credentials":{...}}
func (s *server) handleRestart(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ServerID    string `json:"serverId"`
		ServerIP    string `json:"serverIp"`
		APIServerIP string `json:"apiServerIp"`
		Credentials struct {
			Username string `json:"username"`
			Password string `json:"password"`
		} `json:"credentials"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.ServerID == "" || req.ServerIP == "" {
		jsonError(w, "serverId and serverIp required", http.StatusBadRequest)
		return
	}
	if req.APIServerIP == "" {
		req.APIServerIP = req.ServerIP
	}

	// Step 1: check status
	cfgURL := fmt.Sprintf("http://%s/api/xeebra-config/servers/%s/configuration", req.APIServerIP, req.ServerID)
	body, err := httpGet(cfgURL, 10*time.Second)
	if err != nil {
		jsonError(w, "failed to get server configuration: "+err.Error(), http.StatusInternalServerError)
		return
	}
	var cfg struct {
		Status string `json:"status"`
	}
	_ = json.Unmarshal(body, &cfg)

	// Step 2: stop if running
	if cfg.Status == "RUNNING" {
		stopURL := fmt.Sprintf("http://%s/api/xeebra-config/servers/%s/configuration/_stop", req.APIServerIP, req.ServerID)
		if _, err := httpPost(stopURL, nil, 10*time.Second); err != nil {
			jsonError(w, "failed to stop server: "+err.Error(), http.StatusInternalServerError)
			return
		}
		time.Sleep(10 * time.Second)
	}

	// Step 3: SSH restart
	sshCfg := &ssh.ClientConfig{
		User:            req.Credentials.Username,
		Auth:            []ssh.AuthMethod{ssh.Password(req.Credentials.Password)},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), //nolint:gosec
		Timeout:         20 * time.Second,
	}
	client, err := ssh.Dial("tcp", req.ServerIP+":22", sshCfg)
	if err != nil {
		jsonError(w, "SSH connection failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer client.Close()

	sess, err := client.NewSession()
	if err != nil {
		jsonError(w, "SSH session failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	defer sess.Close()
	_ = sess.Run("sudo reboot")

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"success": true,
		"message": "Server restart initiated",
	})
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

func proxyGet(w http.ResponseWriter, target string) {
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(target)
	if err != nil {
		http.Error(w, "upstream error: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	copyResponse(w, resp)
}

func proxyPost(w http.ResponseWriter, target string, body []byte) {
	var reader io.Reader
	if len(body) > 0 {
		reader = strings.NewReader(string(body))
	}
	req, err := http.NewRequest("POST", target, reader)
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "upstream error: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	copyResponse(w, resp)
}

func copyResponse(w http.ResponseWriter, resp *http.Response) {
	ct := resp.Header.Get("Content-Type")
	if ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

func httpGet(url string, timeout time.Duration) ([]byte, error) {
	client := &http.Client{Timeout: timeout}
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

func httpPost(url string, body []byte, timeout time.Duration) ([]byte, error) {
	var reader io.Reader
	if len(body) > 0 {
		reader = strings.NewReader(string(body))
	}
	req, err := http.NewRequest("POST", url, reader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: timeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}

func jsonError(w http.ResponseWriter, msg string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func execCommand(name string, args ...string) error {
	return exec.Command(name, args...).Start()
}
