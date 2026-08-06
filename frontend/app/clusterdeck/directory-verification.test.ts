// Copyright 2026, Clusterdeck Authors.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from "vitest";
import { DirectoryVerificationCoordinator } from "./directory-verification";

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => (resolve = res));
    return { promise, resolve };
}

describe("DirectoryVerificationCoordinator", () => {
    it("ignores a typed-path result after a directory suggestion invalidates it", async () => {
        const pending = deferred<string>();
        const verified = vi.fn();
        const coordinator = new DirectoryVerificationCoordinator();
        coordinator.verify(() => pending.promise, verified, vi.fn());
        coordinator.invalidate();
        pending.resolve("stale-typed-path");
        await pending.promise;
        await Promise.resolve();
        expect(verified).not.toHaveBeenCalled();
    });

    it("prevents success and error callbacks after modal disposal", async () => {
        const success = deferred<string>();
        const verified = vi.fn();
        const failed = vi.fn();
        const coordinator = new DirectoryVerificationCoordinator();
        coordinator.verify(() => success.promise, verified, failed);
        coordinator.dispose();
        success.resolve("stale");
        await success.promise;
        await Promise.resolve();
        expect(verified).not.toHaveBeenCalled();
        expect(failed).not.toHaveBeenCalled();
    });

    it("assigns increasing request numbers and lets the latest verification win", async () => {
        const first = deferred<string>();
        const second = deferred<string>();
        const requestNumbers: number[] = [];
        const verified = vi.fn();
        const coordinator = new DirectoryVerificationCoordinator();
        coordinator.verify(
            (number) => {
                requestNumbers.push(number);
                return first.promise;
            },
            verified,
            vi.fn()
        );
        coordinator.verify(
            (number) => {
                requestNumbers.push(number);
                return second.promise;
            },
            verified,
            vi.fn()
        );
        second.resolve("latest");
        await second.promise;
        first.resolve("stale");
        await first.promise;
        await Promise.resolve();
        expect(requestNumbers).toEqual([1, 2]);
        expect(verified).toHaveBeenCalledOnce();
        expect(verified).toHaveBeenCalledWith("latest");
    });
});
