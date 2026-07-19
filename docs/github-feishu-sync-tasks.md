# GitHub → 飞书多维表格 任务拆分

> Issue #68

## 任务依赖图

```
T1 建表 ──→ T4 核心脚本 ──→ T5 workflow ──→ T7 测试
                │
T2 Token 确认   │
                │
T3 Secrets ────→ T6 全量同步（agent 操作）
```

## 任务清单

### T1 — 创建飞书多维表格

**产出：** Issues 表和 PRs 表各一个，含全部字段。

使用 lark-cli 在飞书创建两个表格，字段按设计文档定义（见 `docs/github-feishu-sync-design.md` 第 3 节）。建完后输出 `base_token`、`issue_table_id`、`pr_table_id`。

**预估：** 5 分钟

---

### T2 — 确认 lark-cli 飞书鉴权

**产出：** 验证 `lark-cli` 可通过 `FEISHU_APP_ID` / `FEISHU_APP_SECRET` 访问多维表格。

```
lark-cli base +table-list --base-token <token>
```

成功后确认权限链路打通。

**预估：** 2 分钟

---

### T3 — 配置 GitHub Secrets

**产出：** 5 个 Secrets 写入仓库：

| Secret | 值 |
|--------|-----|
| `FEISHU_APP_ID` | 飞书应用 App ID |
| `FEISHU_APP_SECRET` | 飞书应用 App Secret |
| `FEISHU_BITABLE_TOKEN` | T1 输出的 base_token |
| `FEISHU_ISSUE_TABLE_ID` | T1 输出的 issue_table_id |
| `FEISHU_PR_TABLE_ID` | T1 输出的 pr_table_id |

**预估：** 3 分钟

---

### T4 — 编写核心同步脚本

**产出：** `.github/scripts/sync-gh-to-bitable.sh`

| 功能 | 说明 |
|------|------|
| `sync_issue <number>` | 拉取单个 issue → 查 Bitable 去重 → 创建或更新 |
| `sync_pr <number>` | 同上，处理 PR |

全量同步不在脚本中实现，由 PI Agent 介入操作（直接循环调用单条同步）。

输入：从环境变量读取 Secrets。输出：`stdout` 日志。

**预估：** 主要工作量，30-40 分钟

---

### T5 — 编写 GitHub Actions Workflow

**产出：** 2 个 workflow 文件，均支持 event 触发 + workflow_dispatch 手动补同步。

| 文件 | 触发 |
|------|------|
| `.github/workflows/sync-issue.yml` | `issues` 事件 + `workflow_dispatch` |
| `.github/workflows/sync-pr.yml` | `pull_request` 事件 + `workflow_dispatch` |

**预估：** 15 分钟

---

### T6 — 执行全量同步

**产出：** Issues 表和 PRs 表填充历史数据。

由 agent 直接调用脚本逐条同步，无需单独 workflow。

**预估：** 5 分钟

---

### T7 — 测试事件增量同步

**产出：** 验证自动同步链路。

创建一个测试 Issue → 确认飞书表格出现新行 → 关闭 → 确认状态更新 → 删除测试 Issue。

**预估：** 5 分钟

---

## 总预估

| 阶段 | 时间 |
|------|------|
| T1-T2 环境准备 | 10 分钟 |
| T3 密钥 | 3 分钟 |
| T4 核心脚本 | 35 分钟 |
| T5 workflow | 15 分钟 |
| T6-T7 验证 | 10 分钟 |
| **合计** | ~75 分钟 |

<!-- E2E PR 同步测试 — 此注释将在测试完成后移除 -->
