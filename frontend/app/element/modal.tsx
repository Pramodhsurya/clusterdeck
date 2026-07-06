// Copyright 2025, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import { Button } from "@/element/button";
import React from "react";
import { createPortal } from "react-dom";

import "./modal.scss";

interface ModalProps {
    id?: string;
    children: React.ReactNode;
    onClickOut: () => void;
}

function Modal({ children, onClickOut, id = "modal", ...otherProps }: ModalProps) {
    const handleOutsideClick = (e: React.SyntheticEvent<HTMLDivElement>) => {
        if (typeof onClickOut === "function" && (e.target as Element).className === "modal-container") {
            onClickOut();
        }
    };

    // Portaled to document.body: a Modal can be opened from inside any block
    // (e.g. a narrow tile-layout pane), and those panes clip their own overflow,
    // which would otherwise crop the modal down to the pane's own bounds instead
    // of covering the whole window.
    return createPortal(
        <div className="modal-container" onClick={handleOutsideClick}>
            <dialog {...otherProps} id={id} className="modal">
                {children}
            </dialog>
        </div>,
        document.body
    );
}

interface ModalContentProps {
    children: React.ReactNode;
}

function ModalContent({ children }: ModalContentProps) {
    return <div className="modal-content">{children}</div>;
}

interface ModalHeaderProps {
    title: React.ReactNode;
    description?: string;
}

function ModalHeader({ title, description }: ModalHeaderProps) {
    return (
        <header className="modal-header">
            {typeof title === "string" ? <h3 className="modal-title">{title}</h3> : title}
            {description && <p>{description}</p>}
        </header>
    );
}

interface ModalFooterProps {
    children: React.ReactNode;
}

function ModalFooter({ children }: ModalFooterProps) {
    return <footer className="modal-footer">{children}</footer>;
}

interface WaveModalProps {
    title: string;
    description?: string;
    id?: string;
    onSubmit: () => void;
    onCancel: () => void;
    buttonLabel?: string;
    children: React.ReactNode;
}

function WaveModal({ title, description, onSubmit, onCancel, buttonLabel = "Ok", children }: WaveModalProps) {
    return (
        <Modal onClickOut={onCancel}>
            <ModalHeader title={title} description={description} />
            <ModalContent>{children}</ModalContent>
            <ModalFooter>
                <Button onClick={onSubmit}>{buttonLabel}</Button>
            </ModalFooter>
        </Modal>
    );
}

export { WaveModal };
