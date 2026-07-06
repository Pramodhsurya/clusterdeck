// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

package clusterdeck

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/wavetermdev/waveterm/pkg/wavebase"
)

// KubeConfigInfo is returned after an uploaded kubeconfig is stored: the path it
// was copied to inside Clusterdeck's config dir, and the contexts it defines.
// The frontend uses these to let the user pick which context(s) to open as
// cluster workspaces.
type KubeConfigInfo struct {
	KubeConfigPath string   `json:"kubeconfigpath"`
	Contexts       []string `json:"contexts"`
}

// KubeConfigDir is where uploaded kubeconfigs (and per-context minified copies)
// are stored, under Clusterdeck's config dir. Created on demand with 0700 perms
// since kubeconfigs hold cluster credentials.
func KubeConfigDir() string {
	return filepath.Join(wavebase.GetWaveConfigDir(), "kubeconfigs")
}

// AddKubeConfig copies the kubeconfig at srcPath into Clusterdeck's kubeconfig
// store (deduped by content hash) and returns the stored path plus the contexts
// it defines. The user's original file is left untouched — Clusterdeck works
// against its own copy so it never mutates the source.
func AddKubeConfig(srcPath string) (*KubeConfigInfo, error) {
	data, err := os.ReadFile(srcPath)
	if err != nil {
		return nil, fmt.Errorf("cannot read kubeconfig %q: %w", srcPath, err)
	}
	dir := KubeConfigDir()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, fmt.Errorf("cannot create kubeconfig store: %w", err)
	}
	sum := sha256.Sum256(data)
	base := sanitizeKubeName(strings.TrimSuffix(filepath.Base(srcPath), filepath.Ext(srcPath)))
	stored := filepath.Join(dir, fmt.Sprintf("%s-%s.yaml", base, hex.EncodeToString(sum[:])[:8]))
	if err := os.WriteFile(stored, data, 0o600); err != nil {
		return nil, fmt.Errorf("cannot store kubeconfig: %w", err)
	}
	contexts, err := ListKubeContexts(stored)
	if err != nil {
		return nil, err
	}
	return &KubeConfigInfo{KubeConfigPath: stored, Contexts: contexts}, nil
}

// ListKubeContexts returns the context names defined in a kubeconfig, via
// `kubectl config get-contexts -o name`.
func ListKubeContexts(kubeconfigPath string) ([]string, error) {
	kubectl, err := lookKubectl()
	if err != nil {
		return nil, err
	}
	out, err := exec.Command(kubectl, "config", "get-contexts", "-o", "name", "--kubeconfig", kubeconfigPath).Output()
	if err != nil {
		return nil, fmt.Errorf("kubectl could not read contexts from kubeconfig: %w", err)
	}
	var contexts []string
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line = strings.TrimSpace(line); line != "" {
			contexts = append(contexts, line)
		}
	}
	if len(contexts) == 0 {
		return nil, fmt.Errorf("no contexts found in kubeconfig")
	}
	return contexts, nil
}

// MinifyKubeContext writes a standalone, flattened kubeconfig containing only
// the given context (with current-context set to it) and returns its path. This
// gives each cluster workspace its own self-contained KUBECONFIG so bare
// `kubectl`/`k9s` in that workspace target the right context without any flags,
// and opening multiple contexts from the same upload stays isolated.
func MinifyKubeContext(kubeconfigPath, context string) (string, error) {
	kubectl, err := lookKubectl()
	if err != nil {
		return "", err
	}
	out, err := exec.Command(kubectl, "config", "view", "--minify", "--flatten",
		"--kubeconfig", kubeconfigPath, "--context", context).Output()
	if err != nil {
		return "", fmt.Errorf("kubectl could not extract context %q: %w", context, err)
	}
	dir := KubeConfigDir()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", fmt.Errorf("cannot create kubeconfig store: %w", err)
	}
	base := strings.TrimSuffix(filepath.Base(kubeconfigPath), filepath.Ext(kubeconfigPath))
	perCtx := filepath.Join(dir, fmt.Sprintf("%s__%s.yaml", base, sanitizeKubeName(context)))
	if err := os.WriteFile(perCtx, out, 0o600); err != nil {
		return "", fmt.Errorf("cannot write per-context kubeconfig: %w", err)
	}
	return perCtx, nil
}

// --- Centralized cluster registry ---------------------------------------
//
// Clusters the user adds are recorded in kubeclusters.json (the persistent
// registry) and their contexts merged into one Clusterdeck kubeconfig
// (_clusters.yaml). k9s is always launched against that merged file with
// --context <chosen>, so its built-in `:ctx` switcher can hop between every
// registered cluster — and only registered clusters, never the user's ambient
// $KUBECONFIG.

// KubeCluster is one entry in the registry: the context, the cluster it points
// at (the display name), its own minified kubeconfig (used to rebuild the merged
// file), and the source it came from.
type KubeCluster struct {
	Name           string `json:"name"`    // display name (cluster name)
	Context        string `json:"context"` // kubeconfig context (used for --context)
	Cluster        string `json:"cluster"` // cluster name (context.cluster)
	KubeConfigPath string `json:"kubeconfigpath"`
	Source         string `json:"source"`
}

type kubeRegistry struct {
	Clusters []KubeCluster `json:"clusters"`
}

func kubeClustersFile() string {
	return filepath.Join(wavebase.GetWaveConfigDir(), "kubeclusters.json")
}

// MergedKubeConfigPath is the single kubeconfig holding every registered
// cluster; k9s runs against this so `:ctx` lists them all.
func MergedKubeConfigPath() string {
	return filepath.Join(KubeConfigDir(), "_clusters.yaml")
}

func loadKubeRegistry() (*kubeRegistry, error) {
	data, err := os.ReadFile(kubeClustersFile())
	if os.IsNotExist(err) {
		return &kubeRegistry{}, nil
	}
	if err != nil {
		return nil, err
	}
	var reg kubeRegistry
	if err := json.Unmarshal(data, &reg); err != nil {
		return nil, fmt.Errorf("kubeclusters.json is malformed: %w", err)
	}
	return &reg, nil
}

func saveKubeRegistry(reg *kubeRegistry) error {
	if err := os.MkdirAll(wavebase.GetWaveConfigDir(), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(reg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(kubeClustersFile(), append(data, '\n'), 0o600)
}

// RegisterKubeConfig stores an uploaded kubeconfig, registers every context it
// defines (deduped by context name — re-adding updates in place), and rebuilds
// the merged kubeconfig. Returns the clusters that came from this file (so the
// UI can offer to open one), not the whole registry.
func RegisterKubeConfig(srcPath string) ([]KubeCluster, error) {
	info, err := AddKubeConfig(srcPath)
	if err != nil {
		return nil, err
	}
	reg, err := loadKubeRegistry()
	if err != nil {
		return nil, err
	}
	added := make([]KubeCluster, 0, len(info.Contexts))
	for _, kubeContext := range info.Contexts {
		perCtx, err := MinifyKubeContext(info.KubeConfigPath, kubeContext)
		if err != nil {
			return nil, err
		}
		// Display the cluster name (context.cluster), falling back to the
		// context name if it can't be read.
		cluster := kubeClusterName(perCtx)
		if cluster == "" {
			cluster = kubeContext
		}
		entry := KubeCluster{Name: cluster, Context: kubeContext, Cluster: cluster, KubeConfigPath: perCtx, Source: info.KubeConfigPath}
		added = append(added, entry)
		replaced := false
		for i := range reg.Clusters {
			if reg.Clusters[i].Context == kubeContext {
				reg.Clusters[i] = entry
				replaced = true
				break
			}
		}
		if !replaced {
			reg.Clusters = append(reg.Clusters, entry)
		}
	}
	if err := saveKubeRegistry(reg); err != nil {
		return nil, err
	}
	if err := rebuildMergedKubeConfig(reg); err != nil {
		return nil, err
	}
	return added, nil
}

// ListRegisteredClusters returns the registry contents, backfilling the cluster
// name (display name) for any entry registered before it was tracked. The
// backfill runs once — after it saves, subsequent calls do no kubectl work.
func ListRegisteredClusters() ([]KubeCluster, error) {
	reg, err := loadKubeRegistry()
	if err != nil {
		return nil, err
	}
	changed := false
	for i := range reg.Clusters {
		if reg.Clusters[i].Cluster == "" {
			cluster := kubeClusterName(reg.Clusters[i].KubeConfigPath)
			if cluster == "" {
				cluster = reg.Clusters[i].Context
			}
			reg.Clusters[i].Cluster = cluster
			reg.Clusters[i].Name = cluster
			changed = true
		}
	}
	if changed {
		saveKubeRegistry(reg)
	}
	return reg.Clusters, nil
}

// RemoveKubeCluster removes the registered cluster with the given context from
// the registry, deletes its per-context kubeconfig (and the stored source file
// if no other registered cluster still uses it), and rebuilds the merged
// kubeconfig. A no-op if the context isn't registered.
func RemoveKubeCluster(kubeContext string) error {
	reg, err := loadKubeRegistry()
	if err != nil {
		return err
	}
	var removed *KubeCluster
	kept := make([]KubeCluster, 0, len(reg.Clusters))
	for _, c := range reg.Clusters {
		if c.Context == kubeContext {
			c := c
			removed = &c
			continue
		}
		kept = append(kept, c)
	}
	if removed == nil {
		return nil
	}
	reg.Clusters = kept
	os.Remove(removed.KubeConfigPath)
	sourceStillUsed := false
	for _, c := range reg.Clusters {
		if c.Source == removed.Source {
			sourceStillUsed = true
			break
		}
	}
	if !sourceStillUsed && removed.Source != "" {
		os.Remove(removed.Source)
	}
	if err := saveKubeRegistry(reg); err != nil {
		return err
	}
	return rebuildMergedKubeConfig(reg)
}

// kubeClusterName returns the cluster name a minified (single-context)
// kubeconfig points at, or "" if it can't be read.
func kubeClusterName(kubeconfigPath string) string {
	kubectl, err := lookKubectl()
	if err != nil {
		return ""
	}
	out, err := exec.Command(kubectl, "config", "view", "--kubeconfig", kubeconfigPath,
		"-o", "jsonpath={.clusters[0].name}").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// rebuildMergedKubeConfig flattens every registered cluster's per-context
// kubeconfig into MergedKubeConfigPath. Because each entry is minified to a
// single, uniquely named context, the merged file contains exactly the
// registered clusters with no collisions.
func rebuildMergedKubeConfig(reg *kubeRegistry) error {
	if len(reg.Clusters) == 0 {
		os.Remove(MergedKubeConfigPath())
		return nil
	}
	kubectl, err := lookKubectl()
	if err != nil {
		return err
	}
	paths := make([]string, 0, len(reg.Clusters))
	for _, c := range reg.Clusters {
		paths = append(paths, c.KubeConfigPath)
	}
	cmd := exec.Command(kubectl, "config", "view", "--flatten")
	// Set KUBECONFIG to exactly the registered per-context files (drop any
	// inherited KUBECONFIG so the user's ambient work clusters never leak in).
	env := make([]string, 0, len(os.Environ())+1)
	for _, e := range os.Environ() {
		if !strings.HasPrefix(e, "KUBECONFIG=") {
			env = append(env, e)
		}
	}
	cmd.Env = append(env, "KUBECONFIG="+strings.Join(paths, ":"))
	out, err := cmd.Output()
	if err != nil {
		return fmt.Errorf("kubectl could not merge kubeconfigs: %w", err)
	}
	if err := os.MkdirAll(KubeConfigDir(), 0o700); err != nil {
		return err
	}
	return os.WriteFile(MergedKubeConfigPath(), out, 0o600)
}

// lookKubectl finds kubectl on PATH, falling back to the common Homebrew /
// /usr/local locations — a GUI app launched from Finder inherits a minimal PATH
// that usually omits /opt/homebrew/bin.
func lookKubectl() (string, error) {
	if p, err := exec.LookPath("kubectl"); err == nil {
		return p, nil
	}
	for _, p := range []string{"/opt/homebrew/bin/kubectl", "/usr/local/bin/kubectl", "/usr/bin/kubectl"} {
		if fi, err := os.Stat(p); err == nil && !fi.IsDir() {
			return p, nil
		}
	}
	return "", fmt.Errorf("kubectl not found; install kubectl (e.g. `brew install kubectl`) to use Kubernetes clusters")
}

// sanitizeKubeName reduces an arbitrary name to a safe filename fragment.
func sanitizeKubeName(name string) string {
	if name == "" || name == "config" {
		name = "kubeconfig"
	}
	var b strings.Builder
	for _, r := range name {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			b.WriteRune(r)
		default:
			b.WriteRune('-')
		}
	}
	return b.String()
}
