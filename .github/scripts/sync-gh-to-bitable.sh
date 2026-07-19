#!/bin/bash
# sync-gh-to-bitable.sh — GitHub Issue/PR 同步到飞书多维表格
#
# === 两种使用方式 ===
#
# 1. CLI 直接执行（GitHub Actions 用）:
#    sync-gh-to-bitable.sh issue <number>
#    sync-gh-to-bitable.sh pr <number>
#    sync-gh-to-bitable.sh --json issue <number>     # 机器可读输出
#
# 2. 被 source 导入（agent / 其他脚本用）:
#    source sync-gh-to-bitable.sh
#    SYNC_OUTPUT=json sync_issue 68
#    sync_batch issue 67 68 69
#
# === 函数签名（source 后可独立调用） ===
#
#   sync_issue <number>         同步单个 Issue，返回 0=成功 1=失败
#   sync_pr <number>            同步单个 PR，返回 0=成功 1=失败
#   sync_batch <type> <nums...> 批量同步，逐条容错，输出汇总
#   find_by_github_id <table> <gh_id>  查询去重，返回 record_id
#
# === 环境变量 ===
#   FEISHU_APP_ID, FEISHU_APP_SECRET, FEISHU_BITABLE_TOKEN,
#   FEISHU_ISSUE_TABLE_ID, FEISHU_PR_TABLE_ID
#   SYNC_OUTPUT=text|json  (默认 text，设 json 时函数输出 JSON)

# 被 source 导入时跳过入口执行
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  set -euo pipefail
else
  set -uo pipefail  # source 模式下不用 -e，让调用方控制
fi

BASE_TOKEN="${FEISHU_BITABLE_TOKEN:-}"
ISSUE_TABLE="${FEISHU_ISSUE_TABLE_ID:-}"
PR_TABLE="${FEISHU_PR_TABLE_ID:-}"
FEISHU_APP_ID="${FEISHU_APP_ID:-}"
FEISHU_APP_SECRET="${FEISHU_APP_SECRET:-}"

# 输出模式: text（人类可读）或 json（机器可读）
SYNC_OUTPUT="${SYNC_OUTPUT:-text}"

# lark-cli 路径（本地用项目内安装的，CI 用 npm ci 后的）
LARK_CLI=".pi/npm/node_modules/@larksuite/cli/bin/lark-cli"
[ -x "$LARK_CLI" ] || LARK_CLI="./node_modules/.bin/lark-cli"

# ─── 工具函数 ─────────────────────────────────

# 日志：text 模式输出到 stderr（stdout 留给 JSON）
log() { echo "$@" >&2; }

# JSON 输出一行结果
json_result() {
  local status="$1" action="$2" number="$3" record_id="$4" error="$5"
  printf '{"status":"%s","action":"%s","number":%s,"record_id":"%s","error":"%s"}\n' \
    "$status" "$action" "$number" "$record_id" "$error"
}

# 日期格式转换: ISO 8601 → yyyy-MM-dd HH:mm:ss
fmt_date() { echo "$1" | sed 's/T/ /; s/Z$//' | cut -c1-19; }

# ─── 去重查询 ─────────────────────────────────

# 查询 Bitable 中是否已存在某条记录（按 GitHub ID 去重）
# 返回 record_id；查询失败时返回空并输出警告到 stderr
find_by_github_id() {
  local table_id="$1" github_id="$2"
  local result
  if result=$($LARK_CLI base +record-list \
    --base-token "$BASE_TOKEN" --table-id "$table_id" \
    --filter-json "{\"logic\":\"and\",\"conditions\":[[\"GitHub ID\",\"==\",\"$github_id\"]]}" \
    --format json --as bot 2>&1); then
    echo "$result" | jq -r '.data.record_id_list[0] // ""'
  else
    log "[lark-cli 查询失败，当作新记录处理]"
    echo ""
  fi
}

# ─── Issue 同步 ───────────────────────────────

sync_issue() {
  local number="$1"
  log "→ 同步 Issue #$number"

  local data
  data=$(gh issue view "$number" --json number,title,state,labels,assignees,createdAt,updatedAt,url,id 2>&1) || {
    log "  ✗ gh 拉取失败"
    [ "$SYNC_OUTPUT" = "json" ] && json_result "error" "fetch_failed" "$number" "" "gh issue view failed"
    return 1
  }

  local id title num state assignees labels created updated url existing
  id=$(echo "$data"   | jq -r '.id')
  title=$(echo "$data" | jq -r '.title')
  num=$(echo "$data"   | jq -r '.number')
  state=$(echo "$data" | jq -r '.state' | tr '[:upper:]' '[:lower:]')
  assignees=$(echo "$data" | jq -r '[.assignees[].login] | join(", ")')
  labels="null"  # TODO: 标签字段 options 为空，暂时跳过
  created=$(fmt_date "$(echo "$data" | jq -r '.createdAt')")
  updated=$(fmt_date "$(echo "$data" | jq -r '.updatedAt')")
  url=$(echo "$data"     | jq -r '.url')

  existing=$(find_by_github_id "$ISSUE_TABLE" "$id")

  if [ -n "$existing" ]; then
    log "  已存在 record_id=$existing — 更新"
    if $LARK_CLI base +record-upsert \
      --base-token "$BASE_TOKEN" --table-id "$ISSUE_TABLE" \
      --record-id "$existing" \
      --json "{\"标题\":$(echo "$title" | jq -R .),\"编号\":$num,\"状态\":$(echo "$state" | jq -R .),\"负责人\":$(echo "$assignees" | jq -R .),\"标签\":$labels,\"更新时间\":$(echo "$updated" | jq -R .),\"URL\":$(echo "$url" | jq -R .)}" \
      --as bot --format json >/dev/null 2>&1; then
      log "  ✓ 完成"
      [ "$SYNC_OUTPUT" = "json" ] && json_result "ok" "updated" "$number" "$existing" ""
      return 0
    else
      log "  ✗ 更新失败"
      [ "$SYNC_OUTPUT" = "json" ] && json_result "error" "update_failed" "$number" "$existing" "lark-cli upsert failed"
      return 1
    fi
  else
    log "  新记录 — 创建"
    if $LARK_CLI base +record-batch-create \
      --base-token "$BASE_TOKEN" --table-id "$ISSUE_TABLE" \
      --json "{\"fields\":[\"标题\",\"编号\",\"状态\",\"负责人\",\"标签\",\"创建时间\",\"更新时间\",\"URL\",\"GitHub ID\"],\"rows\":[[$(echo "$title" | jq -R .),$num,$(echo "$state" | jq -R .),$(echo "$assignees" | jq -R .),$labels,$(echo "$created" | jq -R .),$(echo "$updated" | jq -R .),$(echo "$url" | jq -R .),$(echo "$id" | jq -R .)]]}" \
      --as bot --format json >/dev/null 2>&1; then
      log "  ✓ 完成"
      [ "$SYNC_OUTPUT" = "json" ] && json_result "ok" "created" "$number" "" ""
      return 0
    else
      log "  ✗ 创建失败"
      [ "$SYNC_OUTPUT" = "json" ] && json_result "error" "create_failed" "$number" "" "lark-cli batch-create failed"
      return 1
    fi
  fi
}

# ─── PR 同步 ──────────────────────────────────

sync_pr() {
  local number="$1"
  log "→ 同步 PR #$number"

  local data
  data=$(gh pr view "$number" --json number,title,state,labels,assignees,author,headRefName,baseRefName,createdAt,updatedAt,url,id,mergedAt 2>&1) || {
    log "  ✗ gh 拉取失败"
    [ "$SYNC_OUTPUT" = "json" ] && json_result "error" "fetch_failed" "$number" "" "gh pr view failed"
    return 1
  }

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
  labels="null"  # TODO: 标签字段 options 为空，暂时跳过
  head_ref=$(echo "$data"  | jq -r '.headRefName')
  base_ref=$(echo "$data"  | jq -r '.baseRefName')
  created=$(fmt_date "$(echo "$data" | jq -r '.createdAt')")
  updated=$(fmt_date "$(echo "$data" | jq -r '.updatedAt')")
  url=$(echo "$data"       | jq -r '.url')

  existing=$(find_by_github_id "$PR_TABLE" "$id")

  if [ -n "$existing" ]; then
    log "  已存在 record_id=$existing — 更新"
    if $LARK_CLI base +record-upsert \
      --base-token "$BASE_TOKEN" --table-id "$PR_TABLE" \
      --record-id "$existing" \
      --json "{\"标题\":$(echo "$title" | jq -R .),\"编号\":$num,\"状态\":$(echo "$state" | jq -R .),\"作者\":$(echo "$author" | jq -R .),\"负责人\":$(echo "$assignees" | jq -R .),\"标签\":$labels,\"源分支\":$(echo "$head_ref" | jq -R .),\"目标分支\":$(echo "$base_ref" | jq -R .),\"更新时间\":$(echo "$updated" | jq -R .),\"URL\":$(echo "$url" | jq -R .)}" \
      --as bot --format json >/dev/null 2>&1; then
      log "  ✓ 完成"
      [ "$SYNC_OUTPUT" = "json" ] && json_result "ok" "updated" "$number" "$existing" ""
      return 0
    else
      log "  ✗ 更新失败"
      [ "$SYNC_OUTPUT" = "json" ] && json_result "error" "update_failed" "$number" "$existing" "lark-cli upsert failed"
      return 1
    fi
  else
    log "  新记录 — 创建"
    if $LARK_CLI base +record-batch-create \
      --base-token "$BASE_TOKEN" --table-id "$PR_TABLE" \
      --json "{\"fields\":[\"标题\",\"编号\",\"状态\",\"作者\",\"负责人\",\"标签\",\"源分支\",\"目标分支\",\"创建时间\",\"更新时间\",\"URL\",\"GitHub ID\"],\"rows\":[[$(echo "$title" | jq -R .),$num,$(echo "$state" | jq -R .),$(echo "$author" | jq -R .),$(echo "$assignees" | jq -R .),$labels,$(echo "$head_ref" | jq -R .),$(echo "$base_ref" | jq -R .),$(echo "$created" | jq -R .),$(echo "$updated" | jq -R .),$(echo "$url" | jq -R .),$(echo "$id" | jq -R .)]]}" \
      --as bot --format json >/dev/null 2>&1; then
      log "  ✓ 完成"
      [ "$SYNC_OUTPUT" = "json" ] && json_result "ok" "created" "$number" "" ""
      return 0
    else
      log "  ✗ 创建失败"
      [ "$SYNC_OUTPUT" = "json" ] && json_result "error" "create_failed" "$number" "" "lark-cli batch-create failed"
      return 1
    fi
  fi
}

# ─── 批量同步（agent 用） ──────────────────────

# 逐条同步，单条失败不中断。输出 JSON 汇总。
# 用法: sync_batch issue 67 68 69
#       sync_batch pr 70 71
sync_batch() {
  local type="$1"; shift
  local total=0 ok=0 fail=0
  local sync_fn

  case "$type" in
    issue) sync_fn="sync_issue" ;;
    pr)    sync_fn="sync_pr" ;;
    *)     log "用法: sync_batch issue|pr <numbers...>"; return 1 ;;
  esac

  log "═══ 批量同步 $type 开始（共 $# 条）═══"

  for num in "$@"; do
    total=$((total + 1))
    if $sync_fn "$num"; then
      ok=$((ok + 1))
    else
      fail=$((fail + 1))
    fi
  done

  log "═══ 批量同步完成: 总计 $total, 成功 $ok, 失败 $fail ═══"
  printf '{"summary":{"type":"%s","total":%d,"ok":%d,"fail":%d}}\n' "$type" "$total" "$ok" "$fail"

  [ "$fail" -eq 0 ] && return 0 || return 1
}

# ─── CLI 入口 ────────────────────────────────

# 仅直接执行时进入; source 导入时跳过
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
  return 0
fi

# 环境变量校验（仅 CLI 模式强制要求）
: "${FEISHU_BITABLE_TOKEN:?未设置 FEISHU_BITABLE_TOKEN}"
: "${FEISHU_ISSUE_TABLE_ID:?未设置 FEISHU_ISSUE_TABLE_ID}"
: "${FEISHU_PR_TABLE_ID:?未设置 FEISHU_PR_TABLE_ID}"
: "${FEISHU_APP_ID:?未设置 FEISHU_APP_ID}"
: "${FEISHU_APP_SECRET:?未设置 FEISHU_APP_SECRET}"

# 解析 --json 全局标志
if [[ "${1:-}" == "--json" ]]; then
  SYNC_OUTPUT=json
  shift
fi

case "${1:-}" in
  issue)  sync_issue "${2:?缺少 Issue 编号}" ;;
  pr)     sync_pr "${2:?缺少 PR 编号}" ;;
  batch)  shift; sync_batch "$@" ;;
  *)
    echo "用法: $0 [--json] issue <number> | pr <number> | batch issue|pr <numbers...>"
    echo ""
    echo "  被 source 导入后可直接调用函数:"
    echo "    source $0"
    echo "    SYNC_OUTPUT=json sync_issue 68"
    echo "    sync_batch issue 67 68 69"
    exit 1
    ;;
esac
