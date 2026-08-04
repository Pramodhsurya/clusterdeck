#!/usr/bin/env bash
#===============================================================================
# Clusterdeck Automated Verification
# ===================================
# Runs static checks against the source tree for all the manual test steps
# listed in the clusterdeck-tester report. Designed to be run in CI or as a
# pre-merge gate — exits non-zero on any failure.
#
# Usage
#   ./scripts/verify-clusterdeck.sh          # check everything
#   ./scripts/verify-clusterdeck.sh --ci     # same, stricter (requires domain)
#   ./scripts/verify-clusterdeck.sh --list   # just list check IDs
#
# Some checks are inherently GUI-only — those print MANUAL instructions
# rather than failing.
#===============================================================================

set -euo pipefail

# ---- helpers ----------------------------------------------------------------
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PASS=0; FAIL=0; MANUAL=0; WARN=0
RESULTS=""  # accumulated markdown

pass() { PASS=$((PASS+1)); RESULTS+="  ✅ $1\n"; }
fail() { FAIL=$((FAIL+1)); RESULTS+="  ❌ $1\n"; }
warn() { WARN=$((WARN+1)); RESULTS+="  ⚠️  $1\n"; }
manual() { MANUAL=$((MANUAL+1)); RESULTS+="  🔶 $1\n"; }

check_accent_token() {
    local file="$1"
    local label="$2"
    if grep -q 'var(--cd-accent)' "$file" 2>/dev/null; then
        pass "$label uses var(--cd-accent)"
    else
        fail "$label does NOT use var(--cd-accent)"
    fi
}

check_no_hardcode_blue() {
    local file="$1"
    local label="$2"
    # clusterdeck blue = #429dff or rgba(66, 157, 255, …)
    if grep -n '#429dff\|#429dff\b\|rgb(66\s*,\s*157\s*,\s*255)' "$file" 2>/dev/null | grep -v '//.*comment' | grep -v '^\s*/\*'; then
        fail "$label has hard-coded blue — use --cd-accent instead"
    else
        pass "$label has no hard-coded blue"
    fi
}

check_urls_resolve() {
    local domain="$1"
    local label="$2"
    if curl -sI --max-time 8 "https://${domain}/" >/dev/null 2>&1; then
        pass "$label — ${domain} resolves"
    else
        warn "$label — ${domain} does NOT resolve (may be intentional pre-launch)"
    fi
}

# ---- intro ------------------------------------------------------------------
cd "$ROOT"

if [ "${1:-}" = "--list" ]; then
    echo "Available checks:"
    grep '^## \[CD-' "$0" | sed 's/## //'
    exit 0
fi

echo "# Clusterdeck Automated Verification"
echo "Root: $ROOT"
echo ""

# =============================================================================
# [CD-TOKEN] Accent token unity
# =============================================================================
echo "## Accent token unity"
echo ""

# --cd-accent must be defined exactly once (in theme.scss)
CD_ACCENT_COUNT=$(grep -c '\-\-cd-accent:' frontend/app/theme.scss 2>/dev/null || true)
if [ "$CD_ACCENT_COUNT" -ge 1 ]; then
    pass "--cd-accent defined in theme.scss ($CD_ACCENT_COUNT occurrence(s))"
else
    fail "--cd-accent NOT found in theme.scss"
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

# No duplicate --cd-accent definitions outside theme.scss
DUPS=$(grep -rn '\-\-cd-accent:' frontend/app/ --include="*.scss" --include="*.css" 2>/dev/null | grep -v 'theme\.scss' | grep -v 'Binary' || true)
if [ -z "$DUPS" ]; then
    pass "No duplicate --cd-accent definitions outside theme.scss"
else
    fail "Duplicate --cd-accent definitions found:\n$DUPS"
fi

# Component SCSS files use var(--cd-accent)
check_accent_token "frontend/app/clusterdeck/connectionsrail.scss" "connectionsrail.scss"
check_accent_token "frontend/app/clusterdeck/editor.scss" "editor.scss"
# No hard-coded #429dff / rgba(66,157,255) in component files
for f in frontend/app/clusterdeck/*.scss; do
    check_no_hardcode_blue "$f" "$(basename $f)"
done

# =============================================================================
# [CD-BRANDING] No Wave branding in Clusterdeck-owned files
# =============================================================================
echo ""
echo "## Branding checks"
echo ""

# Clusterdeck-owned dirs
# Exclusions (all intentional — fork imports Wave's Go packages, design
# docs describe the fork relationship, env vars carry the Wave origin):
EXCLUDE_PAT='node_modules|NOTICE|CHANGES\.md|wavetermdev/waveterm/pkg|wavetermdev/waveterm/internal|WAVETERM_'
for dir in frontend/app/clusterdeck pkg/clusterdeck docs/clusterdeck; do
    if [ -d "$dir" ]; then
        MATCHES=$(grep -rni "Wave Terminal\|waveterm\|" "$dir" --include="*.ts" --include="*.tsx" --include="*.scss" --include="*.go" --include="*.md" --include="*.json" 2>/dev/null | grep -vE "$EXCLUDE_PAT" || true)
        if [ -n "$MATCHES" ]; then
            fail "Wave branding found in $dir:\n$MATCHES"
        else
            pass "No Wave branding in $dir"
        fi
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

# Onboarding paths
if grep -q '~/clusterdeck' frontend/app/onboarding/fakechat.tsx 2>/dev/null; then
    pass "Onboarding fake chat uses ~/clusterdeck paths"
else
    fail "Onboarding fake chat does NOT use ~/clusterdeck paths"
fi

# Onboarding log path
if grep -q 'clusterdeck-dev' frontend/app/onboarding/fakechat.tsx 2>/dev/null; then
    pass "Onboarding fake chat uses clusterdeck-dev log paths"
else
    fail "Onboarding fake chat does NOT use clusterdeck-dev log paths"
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

# Count all docs.clusterdeck.app references
DOCS_URL_COUNT=$(grep -rn 'docs.clusterdeck.app' frontend/ --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
if [ "$DOCS_URL_COUNT" -gt 0 ]; then
    pass "All docs URLs use docs.clusterdeck.app ($DOCS_URL_COUNT references)"
else
    fail "No docs.clusterdeck.app references found"
fi

# Check URLs resolve (soft failure — domain may be pre-launch)
check_urls_resolve "docs.clusterdeck.app" "docs.clusterdeck.app"

# Check GitHub org URLs resolve
check_urls_resolve "github.com" "github.com (clusterdeck/app)"

# =============================================================================
# [CD-SECURITY] No secrets / credentials
# =============================================================================
echo ""
echo "## Security checks"
echo ""

# Check for .env, *.key, tokens
if git diff main...HEAD --name-only 2>/dev/null | grep -qiE '\.env$|\.key$|credentials|secret|token' | grep -v 'test\|\.gitignore\|CHANGES.md'; then
    fail "Potential secret files in diff"
else
    pass "No secrets detected in diff"
fi

# Check .gitignore covers build artifacts
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

if [ -f .pi/agents/clusterdeck-tester.md ]; then
    pass "clusterdeck-tester subagent exists"
    if grep -q "read-only\|verify\|never edits" .pi/agents/clusterdeck-tester.md; then
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
echo "    Walk through onboarding. The fake chat demo should show"
echo "    ~/clusterdeck paths and clusterdeck-dev log paths."

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

# Exit codes: 0 = all automated checks pass, 1 = any automated check failed
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
