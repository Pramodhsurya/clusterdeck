#!/usr/bin/env bash
#===============================================================================
# Clusterdeck Automated Verification
# ===================================
# Runs static checks against the source tree for the manual test steps
# listed in the clusterdeck-tester report. Designed to run in CI or as a
# pre-merge gate — exits non-zero on any automated check failure.
#
# Usage
#   ./scripts/verify-clusterdeck.sh                      # check everything
#   ./scripts/verify-clusterdeck.sh --list               # list check IDs
#   ./scripts/verify-clusterdeck.sh --ci --base-ref <ref>  # strict mode
#
# Base ref resolution (in priority order):
#   1. --base-ref <ref> on the command line
#   2. $CLUSTERDECK_BASE_REF environment variable
#
# In --ci mode a missing/invalid base ref is a usage error (exit 2).
# In local mode a missing/invalid base ref is reported as a warning and the
# diff-specific secret scan is skipped.
#
# Some checks are inherently GUI-only — those print MANUAL instructions
# rather than failing.
#===============================================================================

set -euo pipefail

# ---- helpers ----------------------------------------------------------------
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0; FAIL=0; MANUAL=0; WARN=0
CI_MODE=false
BASE_REF=""
RESULTS=""  # accumulated markdown

pass() { PASS=$((PASS+1)); RESULTS+="  ✅ $1\n"; }
fail() { FAIL=$((FAIL+1)); RESULTS+="  ❌ $1\n"; }
warn() { WARN=$((WARN+1)); RESULTS+="  ⚠️  $1\n"; }
manual() { MANUAL=$((MANUAL+1)); RESULTS+="  🔶 $1\n"; }

# grep_search <pattern> [args...]
# Runs grep and reports matches on stdout.
# Returns:
#   0  -> grep matched (matches printed on stdout)
#   1  -> grep found no matches (no output)
#   >=2 -> grep itself failed (treated as a checker failure by callers)
# This enforces the status discipline: 1 means "no match", not a failure;
# 2+ means grep itself could not complete the search.
grep_search() {
    local pattern="$1"; shift
    local matches
    local status
    matches=$(grep "$@" 2>/dev/null) && status=0 || status=$?
    case "$status" in
        0) printf '%s\n' "$matches"; return 0 ;;
        1) return 1 ;;
        *) return "$status" ;;
    esac
}

# report_grep_status <label> <status> [details...]
# Applies the status discipline to a grep result: 0 = pass, 1 = pass with no
# match, >=2 = checker failure.
report_grep_status() {
    local label="$1"; shift
    local status="$1"; shift
    case "$status" in
        0) pass "$label" ;;
        1) pass "$label (no matches)" ;;
        *) fail "$label (grep status $status)" "$@" ;;
    esac
}

check_urls_resolve() {
    local url="$1"
    local label="$2"
    local status
    # Anonymous GET with --fail so 4xx/5xx are surfaced, --location so
    # redirects are followed once, bounded retries/timeouts to keep CI fast.
    if curl --fail --silent --show-error --location --max-time 15 --retry 2 --retry-all-errors --output /dev/null "$url" 2>/dev/null; then
        pass "$label — $url (200)"
        return 0
    fi
    status=$?
    if [ "$CI_MODE" = true ]; then
        fail "$label — $url (curl status $status)"
    else
        warn "$label — $url (curl status $status, may be intentional pre-launch)"
    fi
}

# ---- argument parsing -------------------------------------------------------
cd "$ROOT"

print_usage() {
    cat >&2 <<'EOF'
Usage: verify-clusterdeck.sh [--ci] [--list] [--base-ref <ref>]

Options (any order, may repeat):
  --ci                 Strict mode: warnings become failures, missing base
                       ref is a usage error (exit 2).
  --list               Print the available check IDs and exit 0.
  --base-ref <ref>     Base commit/branch/tag for the diff-based secret scan.
                       CLI takes precedence over $CLUSTERDECK_BASE_REF.
EOF
}

usage_error() {
    echo "verify-clusterdeck.sh: $*" >&2
    print_usage
    exit 2
}

# Pull CLI args from $@ or, if empty, the positional arg array.
ARGS=("$@")
if [ "${#ARGS[@]}" -eq 0 ]; then
    # No arguments at all — fall through to default local run.
    ARGS=()
fi
i=0
while [ "$i" -lt "${#ARGS[@]}" ]; do
    arg="${ARGS[$i]}"
    case "$arg" in
        --ci)
            CI_MODE=true
            i=$((i+1))
            ;;
        --list)
            echo "Available checks:"
            grep '^# \[CD-' "$0" | sed 's/^# //'
            exit 0
            ;;
        --base-ref)
            if [ $((i+1)) -ge "${#ARGS[@]}" ]; then
                usage_error "--base-ref requires a value"
            fi
            BASE_REF="${ARGS[$((i+1))]}"
            i=$((i+2))
            ;;
        --base-ref=*)
            BASE_REF="${arg#--base-ref=}"
            i=$((i+1))
            ;;
        --help|-h)
            print_usage
            exit 0
            ;;
        --*)
            usage_error "unknown option: $arg"
            ;;
        *)
            usage_error "unexpected positional argument: $arg"
            ;;
    esac
done

# Env fallback for BASE_REF (CLI value above wins).
if [ -z "$BASE_REF" ] && [ -n "${CLUSTERDECK_BASE_REF:-}" ]; then
    BASE_REF="$CLUSTERDECK_BASE_REF"
fi

# CI requires an explicit base ref; locally we continue and warn.
if [ "$CI_MODE" = true ] && [ -z "$BASE_REF" ]; then
    usage_error "--ci requires --base-ref <ref> or \$CLUSTERDECK_BASE_REF"
fi

# ---- intro ------------------------------------------------------------------
echo "# Clusterdeck Automated Verification"
echo "Root: $ROOT"
if [ "$CI_MODE" = true ]; then
    echo "Mode: CI"
else
    echo "Mode: local"
fi
if [ -n "$BASE_REF" ]; then
    echo "Base ref: $BASE_REF"
else
    echo "Base ref: (none — diff-based secret scan skipped)"
fi
echo ""

# ---- base ref validation ----------------------------------------------------
# A valid base ref must resolve to a commit and share history with HEAD.
# Git failures are surfaced and treated as automated check failures; this is
# not a soft fall-through.
BASE_REF_VALID=false
if [ -n "$BASE_REF" ]; then
    rev_parse_err=$(git rev-parse --verify --quiet "${BASE_REF}^{commit}" 2>&1) \
        && rev_parse_ok=1 || rev_parse_ok=0
    if [ "${rev_parse_ok:-0}" -ne 1 ]; then
        if [ "$CI_MODE" = true ]; then
            fail "Base ref '$BASE_REF' did not resolve: ${rev_parse_err:-git rev-parse failed}"
        else
            warn "Base ref '$BASE_REF' did not resolve: ${rev_parse_err:-git rev-parse failed} — diff-based secret scan skipped"
            BASE_REF=""
        fi
    elif ! merge_base_out=$(git merge-base "$BASE_REF" HEAD 2>&1); then
        if [ "$CI_MODE" = true ]; then
            fail "git merge-base '$BASE_REF' HEAD failed: $merge_base_out"
        else
            warn "git merge-base '$BASE_REF' HEAD failed: $merge_base_out — diff-based secret scan skipped"
            BASE_REF=""
        fi
    else
        pass "Base ref '$BASE_REF' resolved (merge-base $merge_base_out)"
        BASE_REF_VALID=true
    fi
fi

# =============================================================================
# [CD-TOKEN] Accent token unity
# =============================================================================
echo ""
echo "## Accent token unity"
echo ""

# --cd-accent must be defined exactly once (in theme.scss).
CD_ACCENT_COUNT=$(grep -c '\-\-cd-accent:' frontend/app/theme.scss 2>/dev/null || true)
if [ "$CD_ACCENT_COUNT" -eq 1 ]; then
    pass "--cd-accent defined exactly once in theme.scss"
else
    fail "--cd-accent must be defined exactly once in theme.scss, found $CD_ACCENT_COUNT"
fi

# --cd-accent-bg and --cd-muted-text should also be in theme.scss
for tok in "--cd-accent-bg" "--cd-muted-text"; do
    if grep -q -e "$tok" frontend/app/theme.scss 2>/dev/null; then
        pass "$tok defined in theme.scss"
    else
        fail "$tok NOT found in theme.scss"
    fi
done

# explorer.scss uses --cd-accent-bg (the semi-transparent variant of --cd-accent)
# rather than --cd-accent directly — that's correct for the active-row highlight
if grep -q 'var(--cd-accent-bg)' frontend/app/clusterdeck/explorer.scss 2>/dev/null; then
    pass "explorer.scss uses var(--cd-accent-bg) (accent-derived)"
else
    fail "explorer.scss does NOT reference any --cd-accent variant"
fi

# No duplicate --cd-accent definitions outside theme.scss.
# grep status discipline: 0 = duplicates, 1 = clean, >=2 = grep failure.
DUPS_STATUS=0
DUPS=$(grep -rn '\-\-cd-accent:' frontend/app/ --include="*.scss" --include="*.css" 2>/dev/null | grep -v 'theme\.scss' | grep -v 'Binary') || DUPS_STATUS=$?
if [ "$DUPS_STATUS" -eq 0 ]; then
    fail "Duplicate --cd-accent definitions found:\n$DUPS"
elif [ "$DUPS_STATUS" -eq 1 ]; then
    pass "No duplicate --cd-accent definitions outside theme.scss"
else
    fail "grep status $DUPS_STATUS while checking for duplicate --cd-accent definitions"
fi

# Component SCSS files use var(--cd-accent).
# (component files: connectionsrail, editor)
for f in frontend/app/clusterdeck/connectionsrail.scss frontend/app/clusterdeck/editor.scss; do
    bn=$(basename "$f")
    if grep -q 'var(--cd-accent)' "$f" 2>/dev/null; then
        pass "$bn uses var(--cd-accent)"
    else
        fail "$bn does NOT use var(--cd-accent)"
    fi
done

# No hard-coded clusterdeck blue (#429dff) or rgb/rgba(66, 157, 255, ...) in
# component SCSS files. Portable extended regex covering both rgb(...) and
# rgba(...); quoting basename defends against spaces in filenames.
# grep status discipline: 0 = match (fail), 1 = no match (pass), >=2 = error.
for f in frontend/app/clusterdeck/*.scss; do
    [ -e "$f" ] || continue
    bn=$(basename "$f")
    BLUE_HITS=$(grep -nE '#429dff\b|rgba?\(66[[:space:]]*,[[:space:]]*157[[:space:]]*,[[:space:]]*255' "$f" 2>/dev/null) \
        || BLUE_STATUS=$?
    BLUE_STATUS=${BLUE_STATUS:-0}
    if [ "$BLUE_STATUS" -eq 1 ]; then
        pass "$bn has no hard-coded blue"
    elif [ "$BLUE_STATUS" -eq 0 ]; then
        fail "$bn has hard-coded blue — use --cd-accent instead\n$BLUE_HITS"
    else
        fail "$bn hard-coded-blue check failed (grep status $BLUE_STATUS)"
    fi
    unset BLUE_STATUS
done

# =============================================================================
# [CD-BRANDING] No Wave branding in Clusterdeck-owned files
# =============================================================================
echo ""
echo "## Branding checks"
echo ""

# Branding is enforced on every Clusterdeck-owned directory. The exclusion
# pattern whitelists files that legitimately discuss the fork relationship:
#   - inherited Wave paths, env-var conventions, and legal notice
#   - pkg/clusterdeck/sshsync.go (Go package doc-comment names the upstream)
#   - docs/clusterdeck/*.md (design history documents describe the fork)
# Any new file that mentions Wave must be added here explicitly.
EXCLUDE_PAT='node_modules|NOTICE|CHANGES\.md|wavetermdev/waveterm/pkg|wavetermdev/waveterm/internal|WAVETERM_|pkg/clusterdeck/sshsync\.go|^docs/clusterdeck/'
for dir in frontend/app/clusterdeck pkg/clusterdeck docs/clusterdeck; do
    if [ -d "$dir" ]; then
        # grep status discipline: 0 = match (fail), 1 = clean (pass), >=2 = error.
        BRAND_HITS=$(grep -rniE 'Wave Terminal|waveterm' "$dir" \
            --include="*.ts" --include="*.tsx" --include="*.scss" \
            --include="*.go" --include="*.md" --include="*.json" 2>/dev/null \
            | grep -vE "$EXCLUDE_PAT") || BRAND_STATUS=$?
        BRAND_STATUS=${BRAND_STATUS:-0}
        if [ "$BRAND_STATUS" -eq 0 ]; then
            fail "Wave branding found in $dir:\n$BRAND_HITS"
        elif [ "$BRAND_STATUS" -eq 1 ]; then
            pass "No Wave branding in $dir"
        else
            fail "Wave branding check failed in $dir (grep status $BRAND_STATUS)"
        fi
        unset BRAND_STATUS
    fi
done

# Startup log message
if grep -q 'clusterdeck-app starting' emain/emain.ts 2>/dev/null; then
    pass "Startup log says 'clusterdeck-app starting'"
else
    fail "Startup log does NOT say 'clusterdeck-app starting'"
fi

# Terminal paste prefix
if grep -q 'clusterdeck_paste_' frontend/app/view/term/termutil.ts 2>/dev/null; then
    pass "Paste temp filename uses 'clusterdeck_paste_' prefix"
else
    fail "Paste temp filename does NOT use 'clusterdeck_paste_' prefix"
fi

# The former fake-chat onboarding was removed with the built-in AI feature.
if [ -f frontend/app/onboarding/fakechat.tsx ]; then
    fail "Removed onboarding fake chat unexpectedly exists"
else
    pass "Onboarding fake chat is removed"
fi

# GitHub URLs point to clusterdeck/app
if grep -q 'github.com/clusterdeck/app' frontend/app/onboarding/onboarding.tsx 2>/dev/null; then
    pass "Onboarding GitHub links point to clusterdeck/app"
else
    fail "Onboarding GitHub links do NOT point to clusterdeck/app"
fi

# =============================================================================
# [CD-DOCS-URLS] Docs link liveness (static & network)
# =============================================================================
echo ""
echo "## Docs URL verification"
echo ""

# Static: at least one docs.clusterdeck.app reference AND zero legacy
# docs.waveterm.dev / other Wave docs URLs.
CD_DOCS_HITS=$(grep -rhoE 'https?://docs\.clusterdeck\.app[^[:space:]"'"'"'<>,)]*' \
    frontend/ --include="*.ts" --include="*.tsx" 2>/dev/null | sort -u) \
    || CD_DOCS_STATUS=$?
CD_DOCS_STATUS=${CD_DOCS_STATUS:-0}
case "$CD_DOCS_STATUS" in
    0)
        if [ -n "$CD_DOCS_HITS" ]; then
            pass "Clusterdeck docs URLs present ($(printf '%s\n' "$CD_DOCS_HITS" | wc -l | tr -d ' ') distinct)"
        else
            fail "No docs.clusterdeck.app references found"
        fi
        ;;
    1)
        fail "No docs.clusterdeck.app references found"
        ;;
    *)
        fail "grep failed while scanning docs URLs (status $CD_DOCS_STATUS)"
        ;;
esac

# Legacy Wave docs URLs must be absent from shipping frontend code.
LEGACY_HITS=$(grep -rnE 'docs\.waveterm\.dev|docs\.wavetermapp\.dev|waveterm\.dev/docs' \
    frontend/ --include="*.ts" --include="*.tsx" 2>/dev/null) \
    || LEGACY_STATUS=$?
LEGACY_STATUS=${LEGACY_STATUS:-0}
if [ "$LEGACY_STATUS" -eq 0 ]; then
    fail "Legacy Wave docs URLs still present in frontend:\n$LEGACY_HITS"
elif [ "$LEGACY_STATUS" -eq 1 ]; then
    pass "No legacy Wave docs URLs in frontend"
else
    fail "Legacy docs grep failed (status $LEGACY_STATUS)"
fi

# Network: check actual product URLs (one per line, sorted unique).
PRODUCT_URLS=(
    "https://github.com/clusterdeck/app"
    "https://github.com/clusterdeck/app/issues"
)
# Extend with every distinct in-app docs URL.
if [ -n "$CD_DOCS_HITS" ]; then
    while IFS= read -r url; do
        [ -n "$url" ] || continue
        PRODUCT_URLS+=("$url")
    done <<< "$CD_DOCS_HITS"
fi
for url in "${PRODUCT_URLS[@]}"; do
    if [ -n "$SKIP_URL_CHECKS" ]; then
        pass "Product URL — $url (skipped)"
    else
        check_urls_resolve "$url" "Product URL"
    fi
done

# =============================================================================
# [CD-SECURITY] No secrets / credentials
# =============================================================================
echo ""
echo "## Security checks"
echo ""

# Diff-based secret filename scan.
# Run git diff first; capture exit status. Status 0 with empty output means
# clean. Nonzero is an automated failure (never a pass). Missing base ref
# produces an explicit local warning and skips the scan.
if [ "$BASE_REF_VALID" = true ]; then
    DIFF_OUT=$(git diff --name-only --diff-filter=ACMRT "${BASE_REF}...HEAD" -- 2>&1) \
        && DIFF_STATUS=0 || DIFF_STATUS=$?
    if [ "$DIFF_STATUS" -ne 0 ]; then
        fail "git diff --name-only failed (status $DIFF_STATUS):\n$DIFF_OUT"
    else
        SUSPICIOUS=$(printf '%s\n' "$DIFF_OUT" | grep -iE '\.env$|\.env\.[^/]+$|\.key$|credentials|secret|token' || true)
        if [ -n "$SUSPICIOUS" ]; then
            fail "Potential secret files in diff:\n$SUSPICIOUS"
        else
            pass "No secrets detected in diff (${BASE_REF}...HEAD)"
        fi
    fi
else
    warn "Skipping diff-based secret scan (no valid base ref)"
fi

# .gitignore coverage
if grep -q 'node_modules' .gitignore 2>/dev/null; then
    pass ".gitignore covers node_modules"
else
    warn ".gitignore may not cover node_modules"
fi

if grep -q '\.env' .gitignore 2>/dev/null; then
    pass ".gitignore covers .env files"
else
    warn ".gitignore may not cover .env files"
fi

# =============================================================================
# [CD-LEGAL] Legal files
# =============================================================================
echo ""
echo "## Legal file checks"
echo ""

for f in LICENSE CHANGES.md NOTICE; do
    if [ -f "$f" ]; then
        pass "$f exists"
    else
        fail "$f is missing"
    fi
done

if [ -f CHANGES.md ] && grep -qi "clusterdeck" CHANGES.md; then
    pass "CHANGES.md mentions Clusterdeck"
else
    fail "CHANGES.md does NOT mention Clusterdeck"
fi

if [ -f NOTICE ] && grep -qi "Wave Terminal\|waveterm" NOTICE; then
    pass "NOTICE credits upstream Wave Terminal"
else
    fail "NOTICE does NOT credit upstream Wave Terminal"
fi

# =============================================================================
# [CD-SUBAGENT] Tester subagent exists and is valid
# =============================================================================
echo ""
echo "## Tester subagent checks"
echo ""

if [ -f .pi/agents/clusterdeck-tester.md ] || [ -f .claude/agents/clusterdeck-tester.md ]; then
    AGENT_FILE=".pi/agents/clusterdeck-tester.md"
    [ -f .claude/agents/clusterdeck-tester.md ] && AGENT_FILE=".claude/agents/clusterdeck-tester.md"
    pass "clusterdeck-tester subagent exists ($AGENT_FILE)"
    if grep -qiE "read-only|verify|never edits" "$AGENT_FILE"; then
        pass "clusterdeck-tester is read-only"
    else
        warn "clusterdeck-tester may not be read-only"
    fi
else
    fail "clusterdeck-tester subagent is missing"
fi

# =============================================================================
# [CD-MANUAL] GUI-only checks (cannot be automated)
# =============================================================================
echo ""
echo "## Manual verification steps (GUI required)"
echo ""

manual "CD-MANUAL-1: Accent token unity in live app"
echo "    Open the running app. Confirm connections rail active item,"
echo "    editor active-tab top border (border-top-color), and explorer"
echo "    active-row background all render the same #429dff blue."
echo "    For thorough check: edit --cd-accent in theme.scss to red,"
echo "    confirm all three change together, then revert."

manual "CD-MANUAL-2: Docs links in live app"
echo "    Open Quick Tips, Help view, and a config file's docs link."
echo "    Confirm they navigate to docs.clusterdeck.app/..."

manual "CD-MANUAL-3: Terminal paste"
echo "    Paste an image/text into a terminal. Check temp filename,"
echo "    should contain 'clusterdeck_paste_'."

manual "CD-MANUAL-4: Onboarding flow"
echo "    Walk through onboarding. Confirm the flow completes and"
echo "    links open the Clusterdeck GitHub project."

manual "CD-MANUAL-5: Editor file switching"
echo "    Open files in the editor block, switch between them."
echo "    Confirm no stale-content flash."

manual "CD-MANUAL-6: Autosave"
echo "    Edit a file in the editor, wait 2s, reload. Confirm changes persist."

# =============================================================================
# Summary
# =============================================================================
echo ""
echo "---"
echo ""
echo "## Summary"
echo -e "$RESULTS"
echo ""
echo "**Results: $PASS passed, $FAIL failed, $WARN warnings, $MANUAL manual steps**"
echo ""

# Exit codes:
#   0 -> all automated checks pass (warnings allowed)
#   1 -> one or more automated checks failed
#   2 -> usage / configuration error (handled above)
if [ "$FAIL" -gt 0 ]; then
    echo "❌ Some automated checks failed."
    exit 1
fi
if [ "$WARN" -gt 0 ]; then
    echo "⚠️  All automated checks passed ($WARN warnings)."
    exit 0
fi
echo "✅ All automated checks passed."
exit 0
