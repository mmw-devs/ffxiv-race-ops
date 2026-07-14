---
name: lark-bot
description: >
  飞书 Bot 消息收发。当运营要求启动/停止飞书 Bot、查看 Bot 收到的消息、或 Bot 自动回复相关操作时触发。
  触发词：启动 Bot、停止 Bot、Bot 回复、飞书消息、lark bot。
---

# lark-bot — 飞书 Bot 消息收发（基于 @larksuite/cli）

## 架构

```
飞书用户 → 发消息 → 飞书服务器 → WebSocket 推送 → lark-cli event consume
                                                       ↓ stdout NDJSON
                                                  feishu-bot.sh 守护进程
                                                       ↓
                                                  回复消息（API）
```

无 MCP Server、无 WebSocket SDK 依赖。仅需 `@larksuite/cli` + 一个 bash 守护进程。

## 前置条件

1. `@larksuite/cli` 已安装并配置 profile（`lark-cli profile use <name>`）
2. 应用已在飞书开发者后台配置 `im.message.receive_v1` 事件
3. WSL 环境需挂代理：`HTTP_PROXY=http://172.28.176.1:7890`（Clash）

## 命令

### 启动 Bot

```bash
nohup bash .pi/scripts/feishu-bot.sh > /tmp/feishu-bot.log 2>&1 &
```

- 自动清理残留 consumer
- 启动 `event consume im.message.receive_v1`
- 对每条收到的消息自动回复 "收到: <原文>"
- 日志输出到 `/tmp/feishu-bot.log`

### 停止 Bot

```bash
pkill -f "feishu-bot.sh" && pkill -f "lark-cli.*event consume"
```

### 查看状态

```bash
lark-cli event status
```

### 手动发消息

```bash
lark-cli api POST /open-apis/im/v1/messages \
  --params '{"receive_id_type":"chat_id"}' \
  --data '{"receive_id":"<chat_id>","msg_type":"text","content":"{\"text\":\"<消息>\"}"}'
```

## 自定义回复逻辑

编辑 `.pi/scripts/feishu-bot.sh` 中 `# ── 回复逻辑 ──` 部分。
可将事件转发给 PI Agent 处理，替代简单 echo：

```bash
# 示例：转发给 PI Agent（通过 intercom）
pi-intercom send --session main --message "飞书消息: $content (chat: $chat_id)"
```

## 注意事项

- `event consume` 的总线守护进程在无 consumer 连接 30 秒后自动退出
- `feishu-bot.sh` 的 `while read` 循环会持续保持 consumer 连接
- 飞书事件投递有 10-15 秒延迟，属正常现象
