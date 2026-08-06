// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

import { makeIconClass } from "@/util/util";
import clsx from "clsx";

export type ClusterdeckFileTabVariant = "editor" | "open-editor";

export function ClusterdeckFileTab({
    variant,
    path,
    label,
    icon,
    iconColor,
    active,
    controls,
    onSelect,
    onClose,
    onContextMenu,
}: {
    variant: ClusterdeckFileTabVariant;
    path: string;
    label: string;
    icon: string;
    iconColor: string;
    active: boolean;
    controls?: string;
    onSelect: () => void;
    onClose: () => void;
    onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
}) {
    const editor = variant === "editor";
    return (
        <div
            className={clsx(editor ? "cd-editor-tab" : "cd-open-editor", { active })}
            onContextMenu={onContextMenu}
            title={path}
        >
            <button
                type="button"
                className={editor ? "cd-editor-tab-selectable" : "cd-open-editor-selectable"}
                role="tab"
                aria-label={label}
                aria-selected={active}
                aria-controls={controls}
                tabIndex={active ? 0 : -1}
                onClick={onSelect}
            >
                <i className={makeIconClass(icon, true)} style={{ color: iconColor }} aria-hidden="true" />
                <span className={editor ? "cd-editor-tab-name" : "cd-open-editor-name"}>{label}</span>
            </button>
            <button
                type="button"
                className={editor ? "cd-editor-tab-close" : "cd-open-editor-close"}
                aria-label={`Close ${label}`}
                tabIndex={active ? 0 : -1}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                    event.stopPropagation();
                    onClose();
                }}
            >
                <i className={makeIconClass("xmark", true)} aria-hidden="true" />
            </button>
        </div>
    );
}
