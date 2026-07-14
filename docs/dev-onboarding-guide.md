# 零基础开发者入门指南

> 本文写给第一次接触"AI 编程"的开发者。
> 不需要任何编程基础——只要你会用浏览器，就能上手。

---

## 1. 欢迎：这个项目是干嘛的

这是一个 **FFXIV 高难副本首杀竞速排名网站**。

当 FFXIV 出新副本时，世界各地的顶尖队伍会争夺"世界首杀"。这个网站实时展示：

- 🏆 各队伍排名和攻略进度（打到 P 几、Boss 剩多少血）
- 🎥 队员直播链接
- 📰 赛事速报和公告
- ⏱️ 开赛计时器

网站是纯静态页面，部署在 Cloudflare Pages 上，面向全球玩家访问。

### 两种角色

项目由两类人共同维护：

```
┌─────────────────────────────────────────────┐
│                                             │
│   👩‍💻 开发者（你）        👩‍💼 运营人员            │
│   改页面代码              改比赛数据             │
│   HTML / CSS / JS         data.json           │
│   周级别                  每天多次              │
│                                             │
│         └─────── 互不干扰 ───────┘             │
│                                             │
└─────────────────────────────────────────────┘
```

运营人员通过飞书聊天，指挥 AI 助手更新数据。你负责让页面好看、好用。

> 💡 **本文只讲开发侧的事情。运营侧怎么工作，你不用管，也碰不到。**

---

## 2. 两个概念：AI 编程和 Agent

你可能听过这些词但不太明白。我们用最简单的话解释。

### 什么是 AI 编程（Vibe Coding）

**传统编程：** 你手写每一行代码，语法标点一个不能错。

**AI 编程：** 你用自然语言说"我想让这个按钮变成蓝色"，AI 帮你写成代码。

```
你说：                                    AI 生成：
"把排名表格的背景色改成深蓝"        →       background-color: #1a1a2e;
"加一个倒计时在页面顶部"            →       <LiveTimer /> 组件代码
"手机上看表格太宽了"               →       @media (max-width: 768px) { ... }
```

你就是"导演"，AI 是"摄影师"。你说要什么效果，AI 负责技术实现。你不用记住任何 CSS 属性名或 Vue 语法——AI 帮你记。

你当前正在使用的这个对话界面，就是 AI 编程的入口。

### 什么是 Agent

**Agent = 有角色设定的 AI 助手。**

普通 AI 聊天：你问什么它答什么，没有上下文。

Agent 不一样——它被预先设定了：

| Agent 知道的东西 | 具体内容 |
|-----------------|---------|
| **身份** | "我是 FFXIV 竞速网站的开发助手" |
| **权限** | "我可以改 src/ 下的代码，但不能碰 data.json" |
| **工作流** | "改代码 → 建分支 → 推送到 GitHub → 创建 PR" |
| **禁区** | "data.json 绝对不能改，改了就会被系统拦住" |

你通过聊天指挥 Agent 干活，Agent 负责在规则内执行。Agent 有自己的"记忆"（项目文档）和"手脚"（终端命令、文件编辑）。

### 本项目的 Agent

这个项目配了一个 Agent，它有两种模式：

| 模式 | 干什么 | 怎么进 |
|------|--------|--------|
| **运营模式**（默认） | 帮运营人员改 data.json | 自动进入 |
| **开发模式** | 帮你改页面代码 | 输入 `/dev` |

你现在就在和它对话。输入 `/dev` 它就变成你的开发助手。

> 🤔 **为什么用 pi 而不是 LangGraph？**
>
> LangGraph 更重、定制化程度更高——你可以用它从零搭建任何形态的 Agent。但我们不需要那么高的自由度。
>
> pi 直接提供了 Agent 开发最必要的基础设施：Agent Loop（接收指令 → 思考 → 执行工具 → 输出结果）、API Key 接入渠道、文件编辑和 Git 操作能力。
>
> 更关键的是，pi 支持项目级的插件、提示词（Prompt）和规则配置——每个项目可以有自己的 `.pi/` 目录，Agent 进入项目目录后自动加载专属的行为设定。这让同一个 pi 在不同项目中扮演完全不同的角色，而不需要为每个项目重新搭一套 Agent。
>
> 我们在这个现成骨架上加自己的规则和 Skill，省掉了重复造轮子的精力。

### 想深入了解更多？

上面只是最简解释。如果你有兴趣理解背后的原理，这三份资料值得一看：

| 资料 | 链接 | 适合场景 |
|------|------|---------|
| **pi Agent 官方文档** | [pi.dev/docs/latest](https://pi.dev/docs/latest) | 遇到 pi 命令不懂时查阅 |
| **Vibe Coding 教程** | [Easy Vibe](https://datawhalechina.github.io/easy-vibe/zh-cn/stage-1/learning-map/) | 系统学习怎么跟 AI 配合写代码 |
| **Agent 原理解析** | [ShareAI](https://learn.shareai.run/zh/) | 想知道 Agent 内部怎么工作的 |

> 💡 不用现在就去看。日常开发中遇到困惑时，回来翻对应的链接就行。

---

## 3. 你的角色：开发者

### 你能改什么

```
✅ 可以改的
├── src/                    ← 所有页面代码
│   ├── components/         ← Vue 组件（按钮、表格、卡片……）
│   ├── layouts/            ← 页面布局
│   ├── pages/              ← 路由页面
│   └── composables/        ← 公共逻辑（计时器等）
├── schema/                 ← 数据格式定义
├── scripts/                ← 校验脚本
├── .github/workflows/      ← CI 自动检查
├── docs/                   ← 文档
└── .pi/                    ← Agent 配置
```

### 你不能改什么

```
🚫 绝对不能改的
└── public/data.json        ← 运营数据（比赛排名、新闻等）
```

> ⚠️ **这条是硬规矩。** 如果你在 feature 分支里改了 data.json，CI 会自动拦截，PR 直接失败。不是"建议"，是"系统不让你过"。

### 双轨模型

项目的代码变更走两条独立的轨道，像高速公路的两条车道：

```
开发轨（你走的）                    运营轨（运营走的）
─────────────                    ─────────────
feature/fix 分支                  content 分支
改 HTML/CSS/JS                   改 data.json
你创建 PR                         Agent 创建 PR
CI 自动检查                       CI 自动检查
开发者 review 后合并               运营确认后合并
      │                               │
      └─────── 都合入 main ───────────┘
                      │
                      ▼
              Cloudflare Pages 自动部署
```

两条轨道的分支名称不同、改的东西不同、CI 检查规则不同——但它们最终都合入同一个 main 分支，部署到同一个网站。

---

## 4. 准备工作：装好工具

本章提供两条路径。**路径 A 推荐给第一次接触命令行的新手**——全程有人帮你。路径 B 给有终端经验的人。

---

### 路径 A（新手推荐）：让 AI 帮你装

思路很简单：先装一个"容易装的 AI"，然后让它帮你搞定剩下的一切。

#### A1. 安装 Hermes Desktop

[Hermes](https://hermes-agent.nousresearch.com) 是 Nous Research 出品的桌面端 AI Agent。

> 💡 **为什么先装它？** Hermes 有图形界面，双击就能装，不需要写任何配置文件。装好后你可以像聊天一样指挥它帮你装 Node.js、Git、pi——它来敲命令，你喝茶。

**安装步骤：**

1. 打开 [hermes-agent.nousresearch.com](https://hermes-agent.nousresearch.com)
2. 下载对应你系统的版本（Windows 下 .exe，Mac 下 .dmg）
3. 双击安装，像装普通软件一样
4. 启动 Hermes，你会看到一个聊天界面

#### A2. 申请 DeepSeek API Key

不管是 Hermes 还是 pi，都需要一个大模型的"通行证"。

1. 打开 [platform.deepseek.com](https://platform.deepseek.com)
2. 注册账号（手机号或邮箱）
3. 进入「API Keys」→「创建 API Key」
4. 复制 Key（格式 `sk-xxxxxxxx`），先存到记事本里

#### A3. 把 Key 配进 Hermes

在 Hermes 聊天界面左下角找到「Settings」（设置），在 Provider 中选择添加 DeepSeek，粘贴你的 API Key。具体位置可能因版本略有不同——找不到的话，直接在 Hermes 聊天框里问：

> "怎么配置 DeepSeek 的 API Key？"

Hermes 自己会告诉你步骤。

#### A4. 让 Hermes 帮你装开发环境

在 Hermes 里依次输入以下指令（一条一条来，等它完成再发下一条）：

```
1. "帮我检查电脑上有没有装 Node.js。如果没有，请帮我安装 LTS 版本。"

2. "帮我检查有没有装 Git。如果没有，请帮我安装。"

3. "帮我安装 GitHub CLI（gh），装好后帮我登录。"

4. "帮我安装 pi-coding-agent：npm install -g @earendil-works/pi-coding-agent"

5. "帮我在 ~/.pi/agent/ 下创建两个配置文件：
   settings.json：defaultProvider 设为 deepseek，defaultModel 设为 deepseek-chat，
   providers 里 deepseek 的 baseUrl 为 https://api.deepseek.com，api 为 openai-completions。
   auth.json：deepseek 的 type 为 api_key，key 填我的 DeepSeek API Key。"
```

第 5 步把 DeepSeek Key 替换成你自己的。Hermes 会帮你创建好配置文件。

#### A5. 验证

配置完成后，打开终端，在项目目录下输入：

```bash
pi
```

如果能进入对话界面，说明一切就绪。以后你就可以用 pi 来开发了——Hermes 的使命已经完成（当然你也可以继续用它）。

> 🎯 **总结：Hermes 是"跳板"——它帮你把开发环境搭好。之后日常开发用 pi，因为 pi 加载了项目专属规则，知道哪些能改哪些不能改。**

---

### 路径 B（手动安装）：适合有终端经验的人

如果你习惯命令行，直接按以下顺序手动安装。

**① Node.js**（让电脑能运行 JavaScript）

去 [nodejs.org](https://nodejs.org) 下载 LTS 版本，一路点"下一步"安装。

装好后打开终端（Windows 搜 `cmd` 或 `PowerShell`，Mac 搜 `终端`），输入：

```bash
node --version
```

如果显示类似 `v22.x.x`，说明装好了。

**② Git**（版本管理，记录每次改了什么）

去 [git-scm.com](https://git-scm.com) 下载安装。

```bash
git --version
```

显示版本号就对了。

**③ GitHub 账号 + gh CLI**

去 [github.com](https://github.com) 注册一个账号。然后安装 GitHub CLI：

```bash
# Windows（用 PowerShell 管理员运行）
winget install --id GitHub.cli

# Mac
brew install gh
```

装好后来认证：

```bash
gh auth login
```

按提示选 `GitHub.com` → `HTTPS` → `Login with a web browser`，浏览器弹窗点确认就行。

**④ pi CLI**（Agent 的运行环境）

Agent 本身是一个叫 `pi` 的命令行工具。你需要先安装它：

```bash
npm install -g @earendil-works/pi-coding-agent
```

装好后验证：

```bash
pi --version
```

显示版本号说明装好了。

**⑤ DeepSeek API Key**（大模型的"通行证"）

Agent 之所以"聪明"，是因为背后连着一个大语言模型。你需要去模型服务商那里申请一个 API Key 作为"通行证"。

> 💡 **为什么推荐 DeepSeek？** 便宜（百万 token 几毛钱）、中文好、代码能力强。新用户注册通常送免费额度，够你开发很久。

**申请步骤：**

1. 打开 [platform.deepseek.com](https://platform.deepseek.com)
2. 注册账号（支持手机号或邮箱）
3. 进入「API Keys」页面，点击「创建 API Key」
4. 复制生成的 Key（格式类似 `sk-xxxxxxxx`）

**配置到 pi：**

创建两个配置文件（只需做一次）：

```bash
# 创建配置目录
mkdir -p ~/.pi/agent
```

第一个文件 `~/.pi/agent/settings.json`——告诉 pi 用哪家大模型：

```json
{
  "defaultProvider": "deepseek",
  "defaultModel": "deepseek-chat",
  "providers": {
    "deepseek": {
      "baseUrl": "https://api.deepseek.com",
      "api": "openai-completions"
    }
  }
}
```

第二个文件 `~/.pi/agent/auth.json`——放你的 API Key：

```json
{
  "deepseek": {
    "type": "api_key",
    "key": "sk-你的key粘贴在这里"
  }
}
```

> ⚠️ **`auth.json` 里是你的密钥，绝对不要发给任何人或提交到 Git！**

---

### 拿到项目代码（两条路径都适用）

```bash
# 克隆到本地
git clone https://github.com/mmw-dev/ffxiv-race-stats.git
cd ffxiv-race-stats

# 安装依赖（只需一次）
npm install

# 启动开发服务器 🎉
npm run dev
```

浏览器打开 `http://localhost:4321`，你应该能看到竞速网站的首页了。

此时你对代码的任何修改，保存后浏览器会自动刷新——这就是**热更新**。

### 启动 Agent

在项目目录下，**另开一个终端窗口**，输入：

```bash
pi
```

你会进入 AI 对话界面。Agent 会自动加载项目规则——它知道自己能改什么、不能改什么。

输入 `/dev` 进入开发模式，然后就可以开始用自然语言指挥它改代码了。

> 💡 **两个终端窗口：** 一个跑 `npm run dev`（预览网站），一个跑 `pi`（和 Agent 聊天）。各干各的，互不影响。

---

## 5. 项目长什么样

打开项目文件夹，看到这些东西：

```
ffxiv-race-stats/
│
├── public/
│   └── data.json              🚫 运营数据——别碰
│
├── src/                       ← 你主要在这里工作
│   ├── pages/
│   │   └── index.astro        入口页面
│   ├── layouts/
│   │   └── BaseLayout.astro   全局布局 + 颜色主题
│   ├── App.vue                根组件（加载数据、分发给子组件）
│   ├── components/            13 个 Vue 组件
│   │   ├── HeroSection.vue    页面顶部大标题区
│   │   ├── RankingTable.vue   排名表格
│   │   ├── RankingRow.vue     每一行队伍
│   │   ├── NewsTicker.vue     滚动速报
│   │   ├── LiveTimer.vue      倒计时
│   │   ├── StatusBar.vue      顶部状态栏
│   │   ├── Sidebar.vue        侧边栏
│   │   ├── BroadcastModule.vue 转播方列表
│   │   ├── StreamCover.vue    直播封面
│   │   ├── SponsorsCard.vue   赞助商
│   │   ├── NoticeCard.vue     公告卡片
│   │   └── AppFooter.vue      页脚
│   └── composables/
│       ├── useTimer.js        计时逻辑
│       └── useExpand.js       展开/收起逻辑
│
├── schema/                   数据格式定义（和运营约好的"合同"）
├── scripts/
│   └── validate-data.js      数据校验脚本
├── .github/workflows/
│   └── validate.yml          CI 自动检查
├── docs/                     项目文档
└── .pi/                      Agent 配置
```

### 数据是怎么流动的

```
public/data.json               ← 运营维护的比赛数据
        │
        ▼
    App.vue                     ← 读取数据
        │
        ├──→ RankingTable.vue   ← "这是队伍列表，给你"
        ├──→ NewsTicker.vue     ← "这是新闻，给你"
        ├──→ StatusBar.vue      ← "这是赛事状态，给你"
        └──→ ...                ← 分发给 13 个子组件
```

你改的是右边这些组件——它们的**样子和行为**。左边 data.json 里的内容（排名、血量、新闻）是运营管的。

### `.pi/` 目录里有什么

目录树中 `.pi/` 看起来只是"Agent 配置"一行，实际上它装了 5 个项目级插件：

| 插件 | 作用 |
|------|------|
| `pi-subagents` | 派发子 Agent 并行处理任务 |
| `pi-web-access` | 网页搜索与内容抓取 |
| `pi-mcp-adapter` | 连接外部 MCP 服务（如飞书文档） |
| `pi-intercom` | 多个 pi 会话之间互通消息 |
| `pi-feishu` | 飞书消息通道（运营人员交互入口） |

这些插件让 Agent 不仅仅是"改代码"——它能搜网页、读飞书文档、甚至多个会话协同工作。

其中 `pi-subagents` 值得单独说明：它可以**派发一个子 Agent** 去独立处理子任务。子 Agent 的关键特性是——**拥有独立的上下文窗口**。这意味着：

- 你可以把一个大任务拆成多个小任务，分给不同子 Agent 并行处理，互不干扰对方的"记忆"
- 主 Agent 只需要汇总结果，不用把所有细节都塞进自己的上下文
- 适合场景：同时改多个不相关的文件、并行搜索多个数据源、让一个子 Agent 校验另一个子 Agent 的输出

### 怎么知道改哪个文件

想知道页面上某个东西对应哪个文件？

输入 `/inspect true`，Agent 会给你一个链接。浏览器打开那个链接后，**鼠标悬停在页面上任何位置**，就会显示它属于哪个 `.vue` 文件。用完输入 `/inspect false` 关闭。

---

## 6. 第一次动手

我们来做一次完整的修改流程——把页面背景色换掉。

### Step 1：进入开发模式

在当前对话中输入：

```
/dev
```

Agent 会检查你的权限，然后进入开发模式。你会看到类似这样的确认：

```
✅ 已进入开发模式（/dev）。
   分支前缀：feature/*、fix/*
   可修改：除 public/data.json 外所有文件
```

### Step 2：告诉 Agent 你要改什么

用自然语言说就行。比如：

> "把整个页面的背景色从深色改成浅色"

Agent 会：
1. 找到 `BaseLayout.astro` 中的颜色定义
2. 告诉你它找到了什么
3. 问你是否确认修改

你确认后，Agent 自动改好代码。切换到浏览器看 `http://localhost:4321`，效果立即可见。

### Step 3：验证没问题

在浏览器里多看几眼——颜色顺眼吗？有没有哪里崩了？移动端也看看（Chrome 按 F12 → 点手机图标）。

### Step 4：提交你的改动

告诉 Agent：

> "没问题，提交吧"

Agent 会自动：
1. 创建一个 `feature/xxx` 分支
2. 把你的改动提交上去
3. 推送到 GitHub
4. 创建一个 PR（Pull Request，合并请求）
5. 给你 PR 的链接

另一个开发者 review 通过后，你的代码就合入 main 了，网站自动更新。

### 整个流程一张图

```
你在聊天框说
      │
      ▼
Agent 理解你要改什么
      │
      ▼
Agent 找到文件、改代码
      │
      ▼
你打开浏览器看效果
      │  不满意 → 继续改
      │  满意 ↓
      ▼
Agent 建分支 → 推送 → 开 PR
      │
      ▼
另一个开发者 Review → ✅ 通过 → 合并
      │
      ▼
网站自动部署，上线！
```

---

## 7. 日常工作流

### 动手之前：从路线图领任务

**不要自己想一个东西就改。** 项目的 GitHub Project（看板）里列出了所有待办事项，按优先级排好。先去看看有没有适合自己的。

```
GitHub 仓库页面 → 顶部 Tab 点「Projects」→ 找到当前路线图
```

路线图里每个任务（Issue）会标注：

| 标签 | 意思 |
|------|------|
| `good first issue` | 🟢 专门给新手的，简单、独立、有说明 |
| `bug` | 🐛 修 bug |
| `enhancement` | ✨ 改进现有功能 |
| `help wanted` | 🙏 急需人手的任务 |

> 💡 **选任务的经验法则：** 先挑 `good first issue`。做完一两个上手后，再挑战更复杂的。Issue 里通常会有设计稿截图或实现思路，看不懂就在 Issue 下面评论提问——维护者会回复。

挑好 Issue 后，在页面右侧把它 Assign 给自己（点「Assignees」→ 选自己）。这样别人就知道这个任务有人在做，不会撞车。然后回到 pi 聊天界面，告诉 Agent：

> "我领了 Issue #12，帮我在 feature/fix-issue-12 分支上开始做。"

Agent 会切到新分支，你就可以开始改了。

#### 路线图里没有我想做的？

如果看了一圈没找到适合自己的任务——或者你有个好想法但路线图里没有——直接找我聊。我帮你把想法整理成 Issue 写进路线图，后续 PR 处理起来效率更高，别人也能看到这个任务的存在。

#### 可以多人合作一个 Issue 吗？

可以。Issue 不是"一人独占"的。如果你想和别人一起做，在 Issue 评论区说一声"我也来"，PR 描述里注明合作者就行。

### 记住三件事

| 操作 | 怎么做 |
|------|--------|
| 开始干活 | 输入 `/dev` |
| 干完收工 | 输入 `/ops` |
| 找人 review | 告诉 Agent "提交吧" |

### 典型的一天

```
早上：
  GitHub → Projects → 领了一个 good first issue
  /dev                                    ← 进入开发模式
  "我领了 Issue #12，切换分支"              ← 准备工作
  "这个 Issue 要做的是……"                  ← 开始干活
  → Agent 改好 → 浏览器确认 → 满意
  "全部改动提交"                            ← 提交
  → Agent 建 PR
  /ops                                    ← 切回运营模式
```

### 分支命名规则

| 类型 | 格式 | 例子 |
|------|------|------|
| 新功能 | `feature/<动词>-<描述>` | `feature/add-dark-mode` |
| 修 bug | `fix/<描述>` | `fix/mobile-overflow` |

全英文、小写、用 `-` 连接。

你可以让 Agent 帮你起名，也可以自己想好告诉它。

---

## 8. 常见任务速查

### 想改颜色 / 字体 / 主题

→ 看 `src/layouts/BaseLayout.astro` 里的 `:root` 块，有 10 个左右的 CSS 变量。改几个变量就能整体换色。

把需求告诉 Agent 就行，它会帮你定位到具体变量。

### 想改某个组件的样子

→ 看 `src/components/` 下对应的 `.vue` 文件。每个文件的 `<style>` 块只影响它自己。

| 你想改的 | 文件 |
|---------|------|
| 顶部大标题 | `HeroSection.vue` |
| 排名表格整体 | `RankingTable.vue` |
| 某一行的样式 | `RankingRow.vue` |
| 侧边栏 | `Sidebar.vue` |
| 计时器 | `LiveTimer.vue` |
| 底部信息 | `AppFooter.vue` |

### 想加一个新模块

告诉 Agent "我想在页面上加一个 XXX 区域"，Agent 会：
1. 判断要不要新建 `.vue` 文件
2. 把新组件注册到 `App.vue`
3. 写好模板和样式

### 想新增一个字段（比如队伍增加"服务器"信息）

这是**数据结构的改动**，需要改 `schema/` 下的文件。但必须遵守一个规则：

> 📐 **Schema 只能加字段，不能删或改已有字段的类型。**

新增字段时，标记为**非必填**（`required` 不包含它）。这样旧的运营数据不会报错。

具体做法：告诉 Agent 你要加什么字段，它会帮你改 schema、同步改组件。

---

## 9. 禁区与红线

### 🚫 禁区一：别碰 data.json

`public/data.json` 是运营人员的领地。你改它 = 越界。

即使你"只是想本地测试一下"，也不要在 feature 分支里改它——CI 会拦住你的 PR。

本地测试时可以临时改，但**提交前一定要还原**。

### 🚫 禁区二：别直推 main

所有改动必须通过分支 + PR。永远不要直接 `git push origin main`。

这是 GitHub 上的硬规则——即使你想推，系统也不让你推。

### ⚠️ 注意一：Schema 改了要通知运营

如果你改了 `schema/`（比如新增字段），改完后告诉 Agent "通知运营侧"。Agent 会同步给运营人员，确保数据格式保持一致。

### ⚠️ 注意二：保证移动端正常

每次改完布局相关的代码，在浏览器 DevTools 里切换到手机视图看一眼（按 F12 → 点左上角手机图标 → 选 iPhone 或 Pixel）。

---

## 10. 遇到问题怎么办

### 页面白屏 / 报错

```bash
# 先看终端有没有红色报错
# 试试重启 dev server
Ctrl + C       # 停止
npm run dev    # 重启
```

### 不确定改哪个文件

```
/inspect true
```

Agent 会给你链接，打开后悬停即可看到文件名。

### CI 检查不通过

PR 创建后，GitHub 会自动运行 CI 检查。如果看到红色的 ❌：

1. 点进去看失败原因
2. 把错误信息复制给 Agent
3. Agent 帮你诊断和修复

常见 CI 失败原因：

| 错误 | 意思 | 怎么修 |
|------|------|--------|
| `data.json modified` | 你不小心改了 data.json | 还原它 |
| `schema validation failed` | 数据结构不对 | Agent 帮修 |
| `npm ci failed` | 依赖没装对 | `npm install` 重试 |

### 浏览器里看不到改动

1. 确认 `npm run dev` 还在跑
2. 确认改的是正确的文件
3. 试试硬刷新（Ctrl + Shift + R）
4. 看看终端有没有报错

### Agent 不理你 / 回错了

输入 `/ops` 再 `/dev`，重新进入一次开发模式。相当于"重启" Agent 的状态。

### 还是搞不定？

> 💬 **欢迎在飞书群里提问。** 任何问题——不管是环境配不好、CI 报错看不懂、还是不确定某个功能该怎么做——直接在飞书群里说。
>
> 在群里交流的好处：问题和解答会被记录下来。以后其他朋友遇到类似问题时，搜索就能找到答案，不用每个人重新踩一遍坑。

---

## 附录：常用命令速查

```bash
pi                    # 在项目目录下启动 Agent 对话
npm run dev           # 启动开发服务器
npm run build         # 构建生产版本
npm run preview       # 预览构建产物
node scripts/validate-data.js   # 手动校验 data.json
gh auth status        # 检查 GitHub 登录状态
```

### 配置文件位置

| 文件 | 作用 |
|------|------|
| `~/.pi/agent/settings.json` | 选哪家大模型、用什么模型 |
| `~/.pi/agent/auth.json` | API Key（密钥，勿泄露）|

---

## 接下来

你现在可以：

1. 先去 GitHub 仓库的 Projects 看板找个 `good first issue`，领下来
2. 打开终端，在项目目录下输入 `pi` 启动 Agent
3. 输入 `/dev` 进入开发模式
4. 告诉 Agent 你领了哪个 Issue，开始干活
5. 另开一个终端跑 `npm run dev`，打开 `http://localhost:4321` 看效果

不用一次读完所有内容。遇到不懂的，回来查对应章节就行。Agent 也会随时帮你。

> 🎉 **欢迎加入！你的第一次 PR 就在前方。**
