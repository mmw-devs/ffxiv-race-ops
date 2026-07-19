# GitHub → 飞书多维表格 同步方案设计

> Issue #68 | 2026-07-19

## 1. 双轨架构

```
┌─────────────────────────────────────────────────────┐
│                    主路径（自动）                      │
│                                                     │
│  GitHub Issue/PR Event                              │
│       │                                             │
│       ▼                                             │
│  GitHub Actions Workflow                            │
│       │                                             │
│       ▼                                             │
│  sync-gh-to-bitable.sh（端到端）                      │
│       │                                             │
│       ▼                                             │
│  飞书多维表格                                        │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│                  接管路径（Agent）                     │
│                                                     │
│  开发者命令 Agent                                    │
│       │                                             │
│       ▼                                             │
│  Agent source 脚本 → 调用独立函数                      │
│       │                                             │
│       ├── fetch_issue(68)     # 只拉数据              │
│       ├── 分析 / 决策 / 修改                          │
│       └── write_issue(...)    # 只写数据              │
│       │                                             │
│       ▼                                             │
│  飞书多维表格                                        │
└─────────────────────────────────────────────────────┘
```

**设计原则：**

- **主路径不依赖 Agent**。日常增量由 GitHub Actions 自动完成，Agent 离线也能跑。
- **接管路径可选**。全量同步、批量修复、数据清洗等特殊需求时，Agent 介入。
- **接管时分层调用**。Agent 不重写逻辑，而是 source 导入后调用底层函数组合。

## 2. 脚本分层

脚本按三层拆分，每层可独立调用：

```
┌──────────────────────────────────┐
│         编排层 (orchestration)     │  ← GitHub Actions 用
│  sync_issue()  sync_pr()         │    端到端：拉取 → 去重 → 写入
│  sync_batch()                    │
├──────────────────────────────────┤
│         写入层 (write)            │  ← Agent 组合用
│  write_issue()  write_pr()       │    接收结构化数据，写入 Bitable
│  find_by_github_id()             │    去重查询
├──────────────────────────────────┤
│         获取层 (fetch)            │
│  fetch_issue()  fetch_pr()       │    从 GitHub 拉取，返回 JSON
│  fmt_date()                      │
└──────────────────────────────────┘
```

| 层级 | 函数 | 职责 | 谁调用 |
|------|------|------|--------|
| 获取 | `fetch_issue` `fetch_pr` | gh CLI 拉取 → 输出 JSON | Agent / 编排层 |
| 写入 | `write_issue` `write_pr` `find_by_github_id` | 接收字段 → 写入 Bitable | Agent / 编排层 |
| 编排 | `sync_issue` `sync_pr` `sync_batch` | 串起获取+写入，加去重逻辑 | GitHub Actions |

**Agent 接管示例：**

```bash
source .github/scripts/sync-gh-to-bitable.sh

# 场景1：全量同步（批量容错）
sync_batch issue $(gh issue list --state all --json number --jq '.[].number')

# 场景2：先查后改（Agent 分析数据后决定）
data=$(SYNC_OUTPUT=json fetch_issue 68)
# Agent 检查 data，修改某个字段...
write_issue "$modified_data"

# 场景3：修复某个字段（只写不拉）
write_issue '{"title":"修正标题","number":68,...}'
```

## 3. 触发方式

| 路径 | 触发 | 用途 |
|------|------|------|
| `sync-issue.yml` | `issues` 事件 + `workflow_dispatch` | Issue 增量（自动） |
| `sync-pr.yml` | `pull_request` 事件 + `workflow_dispatch` | PR 增量（自动） |
| Agent 接管 | 开发者命令 | 全量同步、批量修复（手动） |

## 4. Bitable 表结构

双表设计：`Issues` + `Pull Requests`，分表而非合一，因为 PR 有多余字段（合并状态、源/目标分支）。

### Issues 表

| 字段名 | 类型 | 说明 |
|--------|------|------|
| 标题 | 文本 | Issue 标题 |
| 编号 | 数字 | `#67` |
| 状态 | 单选 | open / closed |
| 负责人 | 文本 | assignee login |
| 标签 | 多选 | label names |
| 创建时间 | 日期 | `YYYY-MM-DD HH:mm:ss` |
| 更新时间 | 日期 | |
| URL | 超链接 | 可直接点击 |
| GitHub ID | 文本 | **去重键**，如 `I_kwDO...` |

### Pull Requests 表

| 字段名 | 类型 | 说明 |
|--------|------|------|
| 标题 | 文本 | PR 标题 |
| 编号 | 数字 | `#69` |
| 状态 | 单选 | open / closed / merged |
| 作者 | 文本 | 提交者 login |
| 负责人 | 文本 | assignee login |
| 标签 | 多选 | label names |
| 源分支 | 文本 | `feature/xxx` |
| 目标分支 | 文本 | `main` |
| 创建时间 | 日期 | |
| 更新时间 | 日期 | |
| URL | 超链接 | |
| GitHub ID | 文本 | **去重键** |

## 5. 文件结构

```
.github/
├── workflows/
│   ├── sync-issue.yml          # issue 事件 + 手动触发
│   └── sync-pr.yml             # PR 事件 + 手动触发
└── scripts/
    └── sync-gh-to-bitable.sh   # 三层函数 + CLI 入口
```

## 6. 凭证管理

| 凭证 | 存储位置 | 变量名 |
|------|---------|--------|
| 飞书 App ID | GitHub Secrets | `FEISHU_APP_ID` |
| 飞书 App Secret | GitHub Secrets | `FEISHU_APP_SECRET` |
| Bitable App Token | GitHub Secrets | `FEISHU_BITABLE_TOKEN` |
| Issue 表 ID | GitHub Secrets | `FEISHU_ISSUE_TABLE_ID` |
| PR 表 ID | GitHub Secrets | `FEISHU_PR_TABLE_ID` |
| GitHub Token | Actions 内置 | 无需手动配置 |

## 7. 不做什么

- **不做双向同步**（飞书改 → GitHub）
- **不做 GitHub Webhook 实时**：Actions event 已足够快
- **不做增量 diff 精细判断**：直接覆盖更新即可
