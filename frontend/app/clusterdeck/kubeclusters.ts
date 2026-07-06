// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

// Shared state for the k9s cluster dropdown: the list of registered clusters
// (from kubeclusters.json) that a k9s block header offers, kept in a small
// module so both the connections rail and the terminal header can use it without
// a heavy import cycle.

import { createBlock, getApi } from "@/app/store/global";
import { globalStore } from "@/app/store/jotaiStore";
import { RpcApi } from "@/app/store/wshclientapi";
import { TabRpcClient } from "@/app/store/wshrpcutil";
import { fireAndForget } from "@/util/util";
import { atom } from "jotai";

// Marker meta key set on k9s terminal blocks so the terminal header knows to
// render the cluster dropdown.
export const CdK9sMetaKey = "cdk9s";

// The registered clusters, refreshed from the backend registry.
export const kubeClustersListAtom = atom<ClusterdeckKubeClusterInfo[]>([]);

// Fetch the registry and update the atom. Cheap; safe to call on render.
export function refreshKubeClusters() {
    fireAndForget(async () => {
        const list = await RpcApi.ClusterdeckListKubeClustersCommand(TabRpcClient);
        globalStore.set(kubeClustersListAtom, list ?? []);
    });
}

// "Add Kubernetes cluster(s)…" — native multi-file picker; registers every
// context in each chosen kubeconfig into the central registry (no workspace is
// created — k9s is just an app you launch in your current workspace), then
// refreshes the shared cluster list.
export function addKubeClusters() {
    fireAndForget(async () => {
        const paths = await getApi().selectFiles("Select kubeconfig file(s)");
        if (!paths || paths.length === 0) {
            return;
        }
        for (const path of paths) {
            await RpcApi.ClusterdeckAddKubeConfigCommand(TabRpcClient, path);
        }
        refreshKubeClusters();
    });
}

// Open a NEW k9s block for the given cluster (in the current workspace),
// alongside any existing k9s. Mirrors what the picker does, but always creates a
// new pane instead of reusing the clicked block.
export function openK9sForCluster(cluster: ClusterdeckKubeClusterInfo) {
    fireAndForget(async () => {
        const meta: MetaType = {
            view: "term",
            controller: "cmd",
            cmd: "k9s",
            connection: "local",
            "cmd:shell": false,
            "cmd:login": true,
            "cmd:args": ["--kubeconfig", cluster.kubeconfigpath, "--context", cluster.context],
        };
        meta["cdk9s"] = true;
        await createBlock({ meta }, false, false);
    });
}

// Copy text (a context name) to the clipboard.
export function copyToClipboard(text: string) {
    fireAndForget(() => navigator.clipboard.writeText(text));
}

// Remove a registered cluster (by context) and refresh the shared list.
export function removeKubeCluster(context: string) {
    fireAndForget(async () => {
        await RpcApi.ClusterdeckRemoveKubeClusterCommand(TabRpcClient, context);
        refreshKubeClusters();
    });
}

// Display name (cluster name) for a context, from the registered list.
export function clusterNameForContext(clusters: ClusterdeckKubeClusterInfo[], context: string): string {
    const match = clusters.find((c) => c.context === context);
    return match?.name ?? context;
}

// Read the current --context out of a k9s block's cmd:args.
export function currentK9sContext(meta: MetaType): string {
    const args = meta?.["cmd:args"];
    if (Array.isArray(args)) {
        const i = args.indexOf("--context");
        if (i >= 0 && i + 1 < args.length) {
            return String(args[i + 1]);
        }
    }
    return "";
}

// Read the --kubeconfig (merged config) path out of a k9s block's cmd:args.
export function k9sKubeConfigPath(meta: MetaType): string {
    const args = meta?.["cmd:args"];
    if (Array.isArray(args)) {
        const i = args.indexOf("--kubeconfig");
        if (i >= 0 && i + 1 < args.length) {
            return String(args[i + 1]);
        }
    }
    return "";
}
