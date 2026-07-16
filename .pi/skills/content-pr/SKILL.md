---
name: content-pr
description: >
  通用 content PR 提交流程。当其他运营 Skill 修改 data.json 后，调用此 Skill 完成分支创建、推送、PR 创建和合并。
  触发词：提交 PR、合并、merge。
---

# content-pr

## 概述

此 Skill 是所有运营侧 data.json 变更的统一提交通道。三个业务 Skill（update-team、add-news、add-broadcaster）修改 data.json 后，统一通过此 Skill 完成 GitHub 操作。

## 操作日志规范

**每个 content commit 必须在 commit message 中嵌入结构化 JSON 日志块**，格式如下：

```
content: t1 bossHP 15.0→12.5

```json
{
  "operator": "<飞书账号或标识符>",
  "timestamp": "<ISO 8601 UTC>",
  "action": "<操作类型>",
  "target": "<目标对象标识>",
  "changes": [
    { "field": "<JSON 路径>", "from": <旧值>, "to": <新值> }
  ]
}
```
```

**operator 取值：** 运营人员通过飞书发起操作时，使用其飞书账号或姓名拼音（如在 `constants.js` 的 `OPERATOR_WHITELIST` 中）。

**timestamp 格式：** ISO 8601 UTC，如 `2026-07-16T10:30:00Z`。

**action 取值（必须在 `VALID_ACTIONS` 白名单中）：**
- `updateTeam` — 更新队伍进度（phase、bossHP、isLive、players 等）
- `addNews` — 添加/修改速报条目
- `addBroadcaster` — 添加/修改/删除转播方
- `updateMeta` — 修改赛事元信息
- `updateNotices` — 修改赛事公告
- `updateSponsors` — 修改赞助公示
- `seasonInit` — 赛季初始化（全量数据更新）

**target 示例：**
- 队伍操作：`t1`、`t3`（队伍 ID）
- 新闻操作：`news[n1]`、`news[new]`
- 转播方操作：`broadcaster[b1]`
- 元信息：`meta`

**changes 字段路径规范：**
使用 JSON 路径格式，例如：
- 顶层属性：`teams[0].bossHP`、`news[2].text`
- 嵌套属性：`teams[0].players[3].streaming`
- `from` 和 `to` 使用 JSON 原生类型（字符串、数字、布尔值、null）

**示例——更新队伍进度：**

```
content: t1 P4→CLEAR bossHP 12.0→0

```json
{
  "operator": "weunimix",
  "timestamp": "2026-07-16T10:30:00Z",
  "action": "updateTeam",
  "target": "t1",
  "changes": [
    { "field": "teams[0].phase", "from": "P4", "to": "CLEAR" },
    { "field": "teams[0].bossHP", "from": 12.0, "to": 0 }
  ]
}
```
```

**示例——添加速报：**

```
content: 添加速报 Neverland 世界首杀

```json
{
  "operator": "weunimix",
  "timestamp": "2026-07-16T10:45:00Z",
  "action": "addNews",
  "target": "news[new]",
  "changes": [
    { "field": "news[0].id", "from": null, "to": "n6" },
    { "field": "news[0].time", "from": null, "to": "10:45:00" },
    { "field": "news[0].text", "from": null, "to": "Neverland 世界首杀！用时 38 小时" },
    { "field": "news[0].urgent", "from": null, "to": true }
  ]
}
```
```

**CI 校验规则：**
1. commit message 必须包含 JSON 日志块
2. `operator`、`timestamp`、`action`、`changes` 字段必填
3. `operator` 必须在 `OPERATOR_WHITELIST` 中
4. `action` 必须在 `VALID_ACTIONS` 中
5. 日志中的 `changes` 须与实际 `data.json` diff 一致

全部通过 → CI 绿色 → 可合并。任一失败 → CI 红色 → 阻断合并。

## 工作流

### 1. 创建 PR

1. 确认分支名：`content/<操作>-<目标>`，后缀 ≤ 20 ASCII 字符
2. 获取 App token，创建 content 分支，修改 data.json
3. 生成**结构化 JSON 日志块**，按上述格式写入 commit message
4. Commit 并 push 到 GitHub
5. `gh pr create --base main`（以 `race-ops-bot[bot]` 身份）

### 2. ⚠️ 汇报并硬停止（必须执行，不可跳过）

PR 创建后，**只允许输出以下内容**，然后**本轮工作结束**：

```
✅ PR 已创建：#N — https://github.com/mmw-devs/ffxiv-race-stats/pull/N
   预览链接：https://<净化分支名>.ffxiv-race-stats.pages.dev
   净化规则：/ → -，全小写，取前 28 字符
   CI 校验：https://github.com/mmw-devs/ffxiv-race-stats/actions

⚠️ 生产站 https://ffxiv-race-stats.pages.dev 还没有更新。
   请打开预览链接确认后，回复"合并"。
```

- 不得在用户回复"合并"前执行 merge
- 不得主动检查 CI 状态
- 不得执行任何其他操作
- 输出上述内容后立即停止

### 3. 合并循环

收到用户"合并"后进入此循环：

```
loop:
    gh pr view <N> --json state,statusCheckRollup   # 检查 CI
    if CI 通过:
        gh pr merge <N> --squash --delete-branch    # 合并
        汇报: "✅ 已合并，生产站更新中: https://ffxiv-race-stats.pages.dev"
        break                                        # 结束
    else:
        读 CI 错误日志 → 诊断 → 修复 data.json → push  # PR 自动更新
        汇报: "修复内容 + 预览链接 + 等待回复'合并'"
        硬停止，等待用户再次回复"合并"后 continue
```

## 预览链接

Cloudflare Pages 自动为每个分支生成预览。URL 格式：

```
https://<sanitized-branch>.ffxiv-race-stats.pages.dev
```

净化规则：分支名中 `/` → `-`，全小写，取前 28 字符。

## 分支命名示例

| 操作 | 分支名 |
|------|--------|
| 更新队伍 1 到 P5 | `content/update-t1-p5` |
| 添加新闻 | `content/add-news-n3` |
| 更新转播方 | `content/update-br-laochen` |
