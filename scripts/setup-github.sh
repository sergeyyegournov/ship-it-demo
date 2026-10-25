#!/bin/bash
# SUPERSEDED by https://github.com/sergeyyegournov/ship-it-demo-infra (github/ root), which now owns these controls.
# Kept as a no-Terraform fallback. Apply the repo-level controls the playbook relies on. Idempotent. Usage: scripts/setup-github.sh <owner/repo>
# Needs: gh authenticated as a repo admin. Does NOT set secrets (add ANTHROPIC_API_KEY yourself) or approve anything.
set -eu
repo=${1:?owner/repo}
me=$(gh api user --jq .login); uid=$(gh api user --jq .id)
api() { gh api "$@" >/dev/null; }

echo "- repo settings: squash-only merges, delete head branches after merge"
api -X PATCH "repos/$repo" -F allow_squash_merge=true -F allow_merge_commit=false -F allow_rebase_merge=false -F delete_branch_on_merge=true

echo "- default workflow token: read-only, and Actions may NOT approve PRs"
api -X PUT "repos/$repo/actions/permissions/workflow" -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false

echo "- environment 'production': required reviewer $me, main only"
api -X PUT "repos/$repo/environments/production" --input - <<JSON
{"reviewers":[{"type":"User","id":$uid}],"prevent_self_review":false,"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
JSON
gh api "repos/$repo/environments/production/deployment-branch-policies" --jq '.branch_policies[].name' | grep -qx main \
  || api -X POST "repos/$repo/environments/production/deployment-branch-policies" -f name=main

echo "- branch protection on main: required checks, 1 code-owner approval, admins included"
api -X PUT "repos/$repo/branches/main/protection" --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["test", "agent-evals"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 1, "require_code_owner_reviews": true, "dismiss_stale_reviews": true },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

if gh secret list -R "$repo" | grep -q '^ANTHROPIC_API_KEY'; then echo "- ANTHROPIC_API_KEY: present"
else echo "! ANTHROPIC_API_KEY missing: gh secret set ANTHROPIC_API_KEY -R $repo"; fi
echo "! Install the Claude GitHub App on the repo (https://github.com/apps/claude) so claude[bot] can author PRs."
