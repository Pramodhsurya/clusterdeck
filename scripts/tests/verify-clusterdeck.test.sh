#!/usr/bin/env bash
# Clusterdeck verifier regression tests (bash 3.2 portable).
# Run from repo root: bash scripts/tests/verify-clusterdeck.test.sh

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SCRIPT="$ROOT/scripts/verify-clusterdeck.sh"
WORK=$(mktemp -d -t cdv-XXXXXX)
trap "rm -rf $WORK" EXIT

PASS=0
FAIL=0

run_test() {
    label="$1"
    expected="$2"
    actual="$3"
    if [ "$expected" = "$actual" ]; then
        PASS=$((PASS + 1))
        printf "  pass: %s\n" "$label"
    else
        FAIL=$((FAIL + 1))
        printf "  fail: %s (expected=%s actual=%s)\n" "$label" "$expected" "$actual"
    fi
}

# --- syntax check ---
if bash -n "$SCRIPT" 2>/dev/null; then
    PASS=$((PASS + 1)); printf "  pass: bash -n verifier parses\n"
else
    FAIL=$((FAIL + 1)); printf "  fail: bash -n verifier\n"
    exit 1
fi

# --- --list ---
out=$(bash "$SCRIPT" --list 2>&1)
rc=$?
run_test "--list exits 0" "0" "$rc"
echo "$out" | grep -q "^\[CD-" && { PASS=$((PASS+1)); printf "  pass: --list shows CD- IDs\n"; } || { FAIL=$((FAIL+1)); printf "  fail: --list missing CD- IDs\n"; }

# --- error cases ---
bash "$SCRIPT" --definitely-not-a-flag >/dev/null 2>&1
run_test "unknown flag exits 2" "2" "$?"

bash "$SCRIPT" --ci >/dev/null 2>&1
run_test "--ci without --base-ref exits 2" "2" "$?"

bash "$SCRIPT" --base-ref >/dev/null 2>&1
run_test "--base-ref missing value exits 2" "2" "$?"

# --- valid base ref runs (skipped: slow URL checks would dominate runtime) ---
if [ -n "$SKIP_SLOW_URL_CHECK" ]; then
    printf "  skip: --base-ref HEAD runs (SKIP_SLOW_URL_CHECK)\n"
else
    bash "$SCRIPT" --base-ref HEAD >/dev/null 2>&1
    rc=$?
    if [ "$rc" = "0" ] || [ "$rc" = "1" ]; then
        PASS=$((PASS+1)); printf "  pass: --base-ref HEAD runs (rc=%s)\n" "$rc"
    else
        FAIL=$((FAIL+1)); printf "  fail: --base-ref HEAD (rc=%s)\n" "$rc"
    fi
fi

# --- bad base ref in --ci fails (not silently passes) ---
bash "$SCRIPT" --ci --base-ref definitely-not-a-ref >/dev/null 2>&1
run_test "bad --base-ref in --ci is a check failure" "1" "$?"

# --- bad local base ref degrades ---
if [ -n "$SKIP_SLOW_URL_CHECK" ]; then
    printf "  skip: bad local --base-ref degrades (SKIP_SLOW_URL_CHECK)\n"
else
    bash "$SCRIPT" --base-ref definitely-not-a-ref >/dev/null 2>&1
    rc=$?
    if [ "$rc" = "0" ] || [ "$rc" = "1" ]; then
        PASS=$((PASS+1)); printf "  pass: bad local --base-ref degrades (rc=%s)\n" "$rc"
    else
        FAIL=$((FAIL+1)); printf "  fail: bad local --base-ref (rc=%s)\n" "$rc"
    fi
fi

# --- legacy malformed-grep regression guard (no trailing empty alternative) ---
if grep -nE 'Wave Terminal\|waveterm\|"' "$SCRIPT" >/dev/null 2>&1; then
    FAIL=$((FAIL+1)); printf "  fail: malformed branding grep still present\n"
else
    PASS=$((PASS+1)); printf "  pass: no malformed branding grep\n"
fi

# --- verifier uses curl --fail ---
if grep -q -e "--fail" "$SCRIPT"; then
    PASS=$((PASS+1)); printf "  pass: verifier uses curl --fail\n"
else
    FAIL=$((FAIL+1)); printf "  fail: verifier does not use curl --fail\n"
fi

printf "\nResults: %d passed, %d failed\n" "$PASS" "$FAIL"
test "$FAIL" = "0"
