#!/bin/bash
# sync-gh-to-bitable.sh — GitHub Issue/PR 同步到飞书多维表格
#
# 用法:
#   sync-gh-to-bitable.sh issue <number>    同步单个 Issue
#   sync-gh-to-bitable.sh pr <number>       同步单个 PR
#   sync-gh-to-bitable.sh all-issues        全量同步所有 Issue
#   sync-gh-to-bitable.sh all-prs           全量同步所有 PR
#
# 环境变量（由 GitHub Actions Secrets 注入）:
#   FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_BITABLE_TOKEN,
#   FEISHU_ISSUE_TABLE_ID, FEISHU_PR_TABLE_ID

set -euo pipefail

BASE_TOKEN="${FEISHU_BITABLE_TOKEN:?}"
ISSUE_TABLE="${FEISHU_ISSUE_TABLE_ID:?}"
PR_TABLE="${FEISHU_PR_TABLE_ID:?}"

# lark-cli 路径
LARK_CLI="npx lark-cli"
export FEISHU_APP_ID="${FEISHU_APP_ID:?}"
export FEISHU_APP_SECRET="${FEISHU_APP_SECRET:?}"

# 日期格式转换: ISO 8601 → yyyy-MM-dd HH:mm:ss
fmt_date() { echo "$1" | sed 's/T/ /; s/Z$//' | cut -c1-19; }

# 查询 Bitable 中是否已存在某条记录（按 GitHub ID 去重）
# 返回 record_id 或空
find_by_github_id() {
  local table_id="$1" github_id="$2"
  $LARK_CLI base +record-list \
    --base-token "$BASE_TOKEN" --table-id "$table_id" \
    --filter-json "{\"logic\":\"and\",\"conditions\":[[\"GitHub ID\",\"==\",\"$github_id\"]]}" \
    --format json --as bot 2>/dev/null | jq -r '.data.items[0].record_id // ""'
}

# --- Issue 同步 ---
sync_issue() {
  local number="$1"
  echo "→ 同步 Issue #$number"

  local data
  data=$(gh issue view "$number" --json number,title,state,labels,assignees,createdAt,updatedAt,url,id 2>&1)
  local id title num state assignees labels created updated url existing

  id=$(echo "$data"   | jq -r '.id')
  title=$(echo "$data" | jq -r '.title')
  num=$(echo "$data"   | jq -r '.number')
  state=$(echo "$data" | jq -r '.state' | tr '[:upper:]' '[:lower:]')
  assignees=$(echo "$data" | jq -r '[.assignees[].login] | join(", ")')
  labels=$(echo "$data"   | jq -c '[.labels[].name]')
  created=$(fmt_date "$(echo "$data" | jq -r '.createdAt')")
  updated=$(fmt_date "$(echo "$data" | jq -r '.updatedAt')")
  url=$(echo "$data"     | jq -r '.url')

  existing=$(find_by_github_id "$ISSUE_TABLE" "$id")

  if [ -n "$existing" ]; then
    echo "  已存在 record_id=$existing — 更新"
    $LARK_CLI base +record-upsert \
      --base-token "$BASE_TOKEN" --table-id "$ISSUE_TABLE" \
      --record-id "$existing" \
      --json "{\"标题\":$(echo "$title" | jq -R .),\"编号\":$num,\"状态\":$(echo "$state" | jq -R .),\"负责人\":$(echo "$assignees" | jq -R .),\"标签\":$labels,\"更新时间\":$(echo "$updated" | jq -R .),\"URL\":$(echo "$url" | jq -R .)}" \
      --as bot --format json >/dev/null
  else
    echo "  新记录 — 创建"
    $LARK_CLI base +record-batch-create \
      --base-token "$BASE_TOKEN" --table-id "$ISSUE_TABLE" \
      --json "{\"fields\":[\"标题\",\"编号\",\"状态\",\"负责人\",\"标签\",\"创建时间\",\"更新时间\",\"URL\",\"GitHub ID\"],\"rows\":[[$(echo "$title" | jq -R .),$num,$(echo "$state" | jq -R .),$(echo "$assignees" | jq -R .),$labels,$(echo "$created" | jq -R .),$(echo "$updated" | jq -R .),$(echo "$url" | jq -R .),$(echo "$id" | jq -R .)]]}" \
      --as bot --format json >/dev/null
  fi
  echo "  ✓ 完成"
}

# --- PR 同步 ---
sync_pr() {
  local number="$1"
  echo "→ 同步 PR #$number"

  local data
  data=$(gh pr view "$number" --json number,title,state,labels,assignees,author,headRefName,baseRefName,createdAt,updatedAt,url,id,mergedAt 2>&1)
  local id title num state author assignees labels head_ref base_ref created updated url existing merged

  id=$(echo "$data"       | jq -r '.id')
  title=$(echo "$data"     | jq -r '.title')
  num=$(echo "$data"       | jq -r '.number')
  merged=$(echo "$data"    | jq -r '.mergedAt // empty')
  if [ -n "$merged" ]; then
    state="merged"
  else
    state=$(echo "$data"   | jq -r '.state' | tr '[:upper:]' '[:lower:]')
  fi
  author=$(echo "$data"    | jq -r '.author.login')
  assignees=$(echo "$data" | jq -r '[.assignees[].login] | join(", ")')
  labels=$(echo "$data"    | jq -c '[.labels[].name]')
  head_ref=$(echo "$data"  | jq -r '.headRefName')
  base_ref=$(echo "$data"  | jq -r '.baseRefName')
  created=$(fmt_date "$(echo "$data" | jq -r '.createdAt')")
  updated=$(fmt_date "$(echo "$data" | jq -r '.updatedAt')")
  url=$(echo "$data"       | jq -r '.url')

  existing=$(find_by_github_id "$PR_TABLE" "$id")

  if [ -n "$existing" ]; then
    echo "  已存在 record_id=$existing — 更新"
    $LARK_CLI base +record-upsert \
      --base-token "$BASE_TOKEN" --table-id "$PR_TABLE" \
      --record-id "$existing" \
      --json "{\"标题\":$(echo "$title" | jq -R .),\"编号\":$num,\"状态\":$(echo "$state" | jq -R .),\"作者\":$(echo "$author" | jq -R .),\"负责人\":$(echo "$assignees" | jq -R .),\"标签\":$labels,\"源分支\":$(echo "$head_ref" | jq -R .),\"目标分支\":$(echo "$base_ref" | jq -R .),\"更新时间\":$(echo "$updated" | jq -R .),\"URL\":$(echo "$url" | jq -R .)}" \
      --as bot --format json >/dev/null
  else
    echo "  新记录 — 创建"
    $LARK_CLI base +record-batch-create \
      --base-token "$BASE_TOKEN" --table-id "$PR_TABLE" \
      --json "{\"fields\":[\"标题\",\"编号\",\"状态\",\"作者\",\"负责人\",\"标签\",\"源分支\",\"目标分支\",\"创建时间\",\"更新时间\",\"URL\",\"GitHub ID\"],\"rows\":[[$(echo "$title" | jq -R .),$num,$(echo "$state" | jq -R .),$(echo "$author" | jq -R .),$(echo "$assignees" | jq -R .),$labels,$(echo "$head_ref" | jq -R .),$(echo "$base_ref" | jq -R .),$(echo "$created" | jq -R .),$(echo "$updated" | jq -R .),$(echo "$url" | jq -R .),$(echo "$id" | jq -R .)]]}" \
      --as bot --format json >/dev/null
  fi
  echo "  ✓ 完成"
}

# --- 全量同步 ---
sync_all_issues() {
  echo "→ 全量同步 Issues ..."
  local issues
  issues=$(gh issue list --state all --limit 1000 --json number --jq '.[].number')
  local count=0
  for num in $issues; do
    sync_issue "$num"
    count=$((count + 1))
  done
  echo "✓ 共处理 $count 个 Issue"
}

sync_all_prs() {
  echo "→ 全量同步 PRs ..."
  local prs
  prs=$(gh pr list --state all --limit 1000 --json number --jq '.[].number')
  local count=0
  for num in $prs; do
    sync_pr "$num"
    count=$((count + 1))
  done
  echo "✓ 共处理 $count 个 PR"
}

# --- 入口 ---
case "${1:-}" in
  issue)       sync_issue "${2:?缺少 Issue 编号}" ;;
  pr)          sync_pr "${2:?缺少 PR 编号}" ;;
  all-issues)  sync_all_issues ;;
  all-prs)     sync_all_prs ;;
  *)
    echo "用法: $0 issue <number> | pr <number> | all-issues | all-prs"
    exit 1
    ;;
esac
