# GitHub → 飞书多维表格 同步方案设计

> Issue #68 | 2026-07-19

## 1. 架构

```
GitHub Issue / PR Event
        │
        ▼
GitHub Actions (issue_sync / pr_sync)
        │
        ├── gh issue view / gh pr view      ← 内置，无需凭证
        │
        ├── 格式化为 lark-cli JSON
        │
        └── lark-cli base +record-batch-create   ← FEISHU_APP_ID / FEISHU_APP_SECRET
                  │
                  ▼
           飞书多维表格
```

**三点说明：**

- **不经过 PI Agent**。这是纯数据管道，agent 在其中无智能价值。
- **gh CLI 内置在 Actions runner 中**，无需额外配置，自动使用 workflow 的仓库上下文。
- **lark-cli 已在项目 devDependencies 中**，Actions 执行 `npm ci` 后即可用。

## 2. 触发方式

三条 workflow，分工明确：

| workflow | 触发源 | 用途 |
|----------|--------|------|
| `sync-issue.yml` | `issues: [opened, closed, reopened, labeled, unlabeled, assigned, unassigned]` | 日常增量 |
| `sync-pr.yml` | `pull_request: [opened, closed, reopened, labeled, unlabeled, assigned, unassigned]` | 日常增量 |
| `sync-all.yml` | `workflow_dispatch` | 首次全量导入 / 修复不一致 |

**为什么不合并成一个 workflow？** Issue 和 PR 的 event payload 结构不同（`issue.number` vs `pull_request.number`），分开处理逻辑更清晰。

## 3. Bitable 表结构

双表设计：`Issues` + `Pull Requests`，分表而非合一，因为 PR 有多余字段（合并状态、源/目标分支）。

### Issues 表

| 字段名 | 类型 | 说明 | 来源 |
|--------|------|------|------|
| 标题 | 文本 | Issue 标题 | `gh issue view --json title` |
| 编号 | 数字 | `#67` | `gh issue view --json number` |
| 状态 | 单选 | open / closed | `gh issue view --json state` |
| 负责人 | 文本 | assignee login | `gh issue view --json assignees` |
| 标签 | 多选 | label names | `gh issue view --json labels` |
| 创建时间 | 日期 | ISO → `YYYY-MM-DD HH:mm:ss` | `gh issue view --json createdAt` |
| 更新时间 | 日期 | | `gh issue view --json updatedAt` |
| URL | 超链接 | 可直接点击 | `gh issue view --json url` |
| GitHub ID | 文本 | **去重键**，如 `I_kwDO...` | `gh issue view --json id` |

### Pull Requests 表

| 字段名 | 类型 | 说明 | 来源 |
|--------|------|------|------|
| 标题 | 文本 | PR 标题 | `gh pr view --json title` |
| 编号 | 数字 | `#69` | `gh pr view --json number` |
| 状态 | 单选 | open / closed / merged | `gh pr view --json state, mergedAt` |
| 作者 | 文本 | 提交者 login | `gh pr view --json author` |
| 负责人 | 文本 | assignee login | `gh pr view --json assignees` |
| 标签 | 多选 | label names | `gh pr view --json labels` |
| 源分支 | 文本 | `feature/xxx` | `gh pr view --json headRefName` |
| 目标分支 | 文本 | `main` | `gh pr view --json baseRefName` |
| 创建时间 | 日期 | | `gh pr view --json createdAt` |
| 更新时间 | 日期 | | `gh pr view --json updatedAt` |
| URL | 超链接 | | `gh pr view --json url` |
| GitHub ID | 文本 | **去重键** | `gh pr view --json id` |

## 4. 核心脚本设计

一套脚本，两种用途。核心思路：

```
拉 GitHub 数据 → 查 Bitable 现有记录 → 存在则更新，不存在则创建
```

### 同步逻辑

```bash
# 1. 拉取 GitHub 数据
gh issue view "$ISSUE_NUMBER" --json number,title,state,labels,assignees,createdAt,updatedAt,url,id

# 2. 去重检查（按 GitHub ID）
EXISTING=$(lark-cli base +record-list \
  --base-token "$BASE_TOKEN" --table-id "$TABLE_ID" \
  --filter-json "{\"logic\":\"and\",\"conditions\":[[\"GitHub ID\",\"==\",\"$GITHUB_ID\"]]}" \
  --format json)

# 3. 存在 → batch-update；不存在 → batch-create
```

### 文件结构

```
.github/
├── workflows/
│   ├── sync-issue.yml       # issue 事件触发
│   ├── sync-pr.yml          # PR 事件触发
│   └── sync-all.yml         # 手动全量同步
└── scripts/
    ├── sync-gh-to-bitable.sh   # 核心同步脚本
    └── sync-all.sh             # 全量同步脚本
```

## 5. 凭证管理

| 凭证 | 存储位置 | 变量名 |
|------|---------|--------|
| 飞书 App ID | GitHub Secrets | `FEISHU_APP_ID` |
| 飞书 App Secret | GitHub Secrets | `FEISHU_APP_SECRET` |
| Bitable App Token | GitHub Secrets | `FEISHU_BITABLE_TOKEN` |
| Issue 表 ID | GitHub Secrets | `FEISHU_ISSUE_TABLE_ID` |
| PR 表 ID | GitHub Secrets | `FEISHU_PR_TABLE_ID` |
| GitHub Token | **Actions 内置** `${{ secrets.GITHUB_TOKEN }}` | 无需手动配置 |

## 6. 飞书应用权限

需在飞书开放平台为本应用开通：

| 权限 | 用途 |
|------|------|
| `bitable:app` | 读写多维表格 |

并将应用添加到目标多维表格的协作者中。

## 7. 实现步骤

| 步骤 | 内容 | 预估工作量 |
|------|------|----------|
| 1 | 飞书开放平台确认权限，手动创建 Issues/PRs 两个表格 | 10 分钟 |
| 2 | GitHub Secrets 配置飞书凭证和表格 ID | 5 分钟 |
| 3 | 编写 `sync-gh-to-bitable.sh` 核心脚本 | 主要工作量 |
| 4 | 编写 `sync-all.sh` 全量同步脚本 | — |
| 5 | 编写 workflow 文件 | — |
| 6 | 手动触发 `sync-all` 完成首次导入 | 1 分钟 |
| 7 | 测试：创建一个 Issue 验证自动同步 | 2 分钟 |

## 8. 边界情况

| 情况 | 处理 |
|------|------|
| 首次全量同步时表格已有部分数据 | 按 GitHub ID 去重，存在跳过，不存在创建 |
| Issue 关闭后又 Reopen | 更新状态字段 |
| PR 合并（merged） | 状态字段设 `merged`，非 `closed` |
| 单次同步标签超过 200 个 | 不会发生（一个 Issue 通常 3-5 个标签） |
| lark-cli batch_create 单次最多 200 条 | 全量同步时按 200 条分批 |
| 事件触发和全量同步并发 | GitHub Actions 自动排队，不会同时跑 |

## 9. 不做什么

- **不做双向同步**（飞书改 → GitHub）：本期不需要，增加复杂度
- **不做 GitHub Webhook 实时**：Actions event 已足够快（秒级触发）
- **不做增量 diff 精细判断**：直接覆盖更新即可，Bitable 无 revision 概念
