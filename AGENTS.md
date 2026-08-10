# CLAUDE.md — 运营仓库

本文件为运营仓库的 PI Agent 上下文。本仓库负责**运营全流程**：运营数据维护、运营 Agent 自动化、构建部署。

## 仓库角色

| 项 | 详情 |
|---|---|
| **唯一高频改动文件** | `public/data.json` |
| **变更通道** | `content/*` 分支 + PR + CI 校验 |
| **部署触发** | `main` 分支 push → CF Pages 自动 build → 发布 |
| **运营 Agent 配置** | `.pi/`（PI Agent 在本仓库启动时进入运营模式） |
| **运营工作流** | `.githooks/`（Agent 调 `gh cli` 的钩子） |

## 仓库结构

```
public/data.json                ← 唯一高频改动文件
public/scripts/                 ← 运行时公共脚本
public/inspect-*.html           ← Agent 调试用
dist/                           ← 由 dev CI 推送的预构建产物（不入 .gitignore）
schema/                         ← 数据契约（与 dev 同步）
scripts/                        ← 验证脚本（与 dev 同步）
.github/workflows/              ← 4 个 workflow（validate / sync-pr / sync-issue / race-ops-jit-pem）
.pi/                            ← 运营 Agent 配置
.githooks/                      ← 运营工作流
constants.js                    ← 数据校验白名单（单一真相来源）
AGENTS.md (本文件)              ← 运营语境文档
README.md                       ← 运营 README
LICENSE
```

## 相关仓库

- **dev 仓库**：`mmw-devs/ffxiv-race-stats`（应用源码 + 构建 dev CI）
  - dev main push → dev CI 构建 → 推送 `dist/` 到本仓库 main
  - 本仓库的 dist/ 来自 dev，不在本仓库构建

## 数据修改流程

```
1. 运营人员通过飞书发送指令
2. 运营 Agent (.pi/) 接收并解析
3. Agent 调用 .pi/skills/* 工具（update-team / add-news / add-broadcaster）
4. Agent 通过 gh cli 创建 content/* 分支并修改 public/data.json
5. PR 触发 .github/workflows/validate.yml 校验（schema + 文件范围 + 操作日志）
6. Review/合并 → main
7. CF Pages 自动部署
```

## 运营 Agent 模式

PI Agent 在本仓库启动时进入**运营模式**，约束：

- **唯一允许修改**：`public/data.json`
- **提交通道**：`content/*` 分支 + PR（绝不可直推 main）
- **凭证**：`race-ops-bot` GitHub App（生产 PEM）或开发者本人 PAT（开发测试）
- **凭证申请**：开发者可通过 dev 仓库的 `race-ops-jit-pem.yml` workflow 申请 1 小时 JIT token

详见 `.pi/SKILL.md`。

## 数据校验规则

CI 在 PR 时跑三阶段校验（`scripts/validate-data.js`）：

- **Schema 结构**：对照 `schema/*.json` 用 Ajv 校验类型、必填、嵌套、数组长度
- **值域交叉**：`phase` ∈ `PHASE_ORDER`、`region` ∈ `VALID_REGIONS` 等
- **业务规则**：`rank` 连续无跳号、`bossHP` ∈ [0, 100]、每队 `players[]` 恰好 8 人

## 部署机制

```
Dev Repo (push src/)
   ↓
Dev CI (npm ci && npm run build) → 产出 dist/
   ↓
Dev CI 推送 dist/ 到本仓库 main（用 OPS_PUSH_TOKEN）
   ↓
CF Pages 监听本仓库 main
   ↓
CF 跑 Build command: cp public/data.json dist/data.json
   ↓
CF publish dist/ 到 CDN
```

## 注释语言

中文。

## 命令

```bash
# 安装校验依赖
npm ci

# 校验 data.json
npm run validate

# 校验操作日志
npm run validate-op-log
```
