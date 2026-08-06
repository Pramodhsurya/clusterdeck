// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { TabRpcClient } from "@/app/store/wshrpcutil";
import { WaveEnv } from "@/app/waveenv/waveenv";
import { isBlank, makeConnRoute } from "@/util/util";

export type PreviewSuggestionsEnv = {
    rpc: {
        FetchSuggestionsCommand: WaveEnv["rpc"]["FetchSuggestionsCommand"];
        DisposeSuggestionsCommand: WaveEnv["rpc"]["DisposeSuggestionsCommand"];
    };
};

type FetchPreviewFileSuggestionsOpts = {
    cwd?: string;
    connection?: string;
};

export function getPreviewSuggestionCwd(file: FileInfo | null | undefined): string {
    return (file?.isdir ? file.path : file?.dir) || "~";
}

export async function fetchPreviewFileSuggestions(
    env: PreviewSuggestionsEnv,
    query: string,
    reqContext: SuggestionRequestContext,
    opts?: FetchPreviewFileSuggestionsOpts
): Promise<FetchSuggestionsResponse> {
    let route = makeConnRoute(opts?.connection);
    if (isBlank(opts?.connection)) {
        route = null;
    }
    if (reqContext?.dispose) {
        await env.rpc.DisposeSuggestionsCommand(TabRpcClient, reqContext.widgetid, { noresponse: true, route });
        return null;
    }
    return await env.rpc.FetchSuggestionsCommand(
        TabRpcClient,
        {
            suggestiontype: "file",
            "file:cwd": opts?.cwd ?? "~",
            query,
            widgetid: reqContext.widgetid,
            reqnum: reqContext.reqnum,
            "file:connection": opts?.connection,
        },
        { route }
    );
}
