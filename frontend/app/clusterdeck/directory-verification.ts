// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

/** Guards remote directory verification callbacks against newer selections and unmount. */
export class DirectoryVerificationCoordinator {
    private generation = 0;

    verify<T>(
        request: (requestNumber: number) => Promise<T>,
        onVerified: (result: T) => void,
        onError: (error: unknown) => void
    ): void {
        const generation = ++this.generation;
        void request(generation)
            .then((result) => {
                if (generation === this.generation) onVerified(result);
            })
            .catch((error) => {
                if (generation === this.generation) onError(error);
            });
    }

    invalidate(): void {
        this.generation++;
    }

    dispose(): void {
        this.invalidate();
    }
}
