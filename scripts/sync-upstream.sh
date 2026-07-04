#!/usr/bin/env bash
# sync-upstream.sh — inspect and pull changes from Wave Terminal (upstream) into
# the Clusterdeck fork. Read-only by default; merging/cherry-picking is left to you.
#
#   scripts/sync-upstream.sh            # fetch + report what's new and the conflict surface
#   scripts/sync-upstream.sh merge      # create a sync branch and merge upstream/main
#   scripts/sync-upstream.sh pick <sha> # cherry-pick one upstream commit onto a branch
#
# `upstream` must point at wavetermdev/waveterm (push is disabled by convention).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

FORK="c99022c15bd1f17273728e728a61743e690d6423"   # recorded fork point (see CHANGES.md)
UPSTREAM_BRANCH="upstream/main"
cmd="${1:-report}"

echo "==> fetching upstream (Wave)…"
git fetch upstream --tags

new_count=$(git rev-list --count "${FORK}..${UPSTREAM_BRANCH}" 2>/dev/null || echo "?")
echo "==> upstream commits since fork point: ${new_count}"
if [ "${new_count}" = "0" ]; then
    echo "    You're current with Wave's main — nothing to merge."
fi

report() {
    echo
    echo "==> what Wave changed since the fork:"
    git --no-pager log --oneline "${FORK}..${UPSTREAM_BRANCH}" 2>/dev/null | head -40 || true
    echo
    echo "==> conflict surface (files BOTH you and Wave changed since the fork):"
    comm -12 \
        <(git diff --name-only "${FORK}" HEAD | sort) \
        <(git diff --name-only "${FORK}" "${UPSTREAM_BRANCH}" | sort) \
        | tee /dev/stderr | wc -l | xargs echo "    overlapping files:"
    echo
    echo "Next: 'scripts/sync-upstream.sh merge' for everything, or"
    echo "      'scripts/sync-upstream.sh pick <sha>' for one commit."
}

case "$cmd" in
    report) report ;;
    merge)
        branch="sync/upstream-$(date +%Y%m%d)"
        echo "==> creating ${branch} from HEAD and merging ${UPSTREAM_BRANCH}…"
        git switch -c "${branch}"
        git merge --no-ff "${UPSTREAM_BRANCH}" || {
            echo "!! conflicts — resolve, 'git add', 'git merge --continue', then build+typecheck before merging back."; exit 1; }
        echo "==> merged cleanly. Build + typecheck, then merge ${branch} into clusterdeck-integration."
        ;;
    pick)
        sha="${2:?usage: sync-upstream.sh pick <sha>}"
        branch="pick/${sha:0:8}"
        echo "==> cherry-picking ${sha} onto ${branch}…"
        git switch -c "${branch}"
        git cherry-pick "${sha}" || {
            echo "!! conflicts — resolve, 'git add', 'git cherry-pick --continue', then build+typecheck."; exit 1; }
        echo "==> picked cleanly. Build + typecheck, then merge ${branch} into clusterdeck-integration."
        ;;
    *) echo "usage: sync-upstream.sh [report|merge|pick <sha>]"; exit 2 ;;
esac
