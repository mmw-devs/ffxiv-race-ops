#!/usr/bin/env node

/**
 * 操作日志校验脚本 — CI 在 content/* PR 时运行。
 *
 * 校验 commit message 中的结构化操作日志块：
 *   1. 日志存在 — 每个 commit 必须包含 JSON 日志块
 *   2. JSON 格式正确 — 可解析，必填字段完整
 *   3. 修改一致性 — diff 中 data.json 的实际变更与日志中 changes 一致
 *   4. 操作人权限 — operator 在 OPERATOR_WHITELIST 白名单中
 *
 * 全部通过 → 退出 0。任一失败 → 退出 1。
 */

const { execSync } = require("child_process");
const { OPERATOR_WHITELIST, VALID_ACTIONS } = require("../constants.js");

// ══════════════════════════════════════════════════════════════
// 工具
// ══════════════════════════════════════════════════════════════

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

let errors = 0;
let warnings = 0;

function fail(msg) {
  console.error(`${RED}  ✗ ${msg}${RESET}`);
  errors++;
}

function warn(msg) {
  console.warn(`${YELLOW}  ⚠ ${msg}${RESET}`);
  warnings++;
}

function ok(msg) {
  console.log(`${GREEN}  ✓ ${msg}${RESET}`);
}

// ══════════════════════════════════════════════════════════════
// 纯函数（从 constants.js 直接 require）
// ══════════════════════════════════════════════════════════════

/**
 * 从 commit message 中提取 JSON 操作日志块。
 * 格式：```json ... ``` 或 ``` ... ```
 */
function extractLogFromMessage(message) {
  // 匹配 markdown 代码块（有或没有 json 语言标记）
  const fenceRegex = /```(?:json)?\s*\n([\s\S]*?)\n```/g;
  const blocks = [];
  let match;
  while ((match = fenceRegex.exec(message)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      // 检查是否像操作日志（有 operator 或 action 字段）
      if (parsed.operator || parsed.action) {
        blocks.push(parsed);
      }
    } catch (e) {
      // 不是有效 JSON，跳过
    }
  }
  return blocks;
}

/**
 * 校验单个操作日志对象的字段完整性。
 * 返回 true/false，通过全局 fail()/warn() 报告问题。
 */
function validateLogFields(log, index) {
  const prefix = `commit #${index + 1}`;
  let valid = true;

  if (!log.operator || typeof log.operator !== "string") {
    fail(`${prefix} 缺少必填字段 operator`);
    valid = false;
  }
  if (!log.timestamp || typeof log.timestamp !== "string") {
    fail(`${prefix} 缺少必填字段 timestamp`);
    valid = false;
  }
  if (!log.action || typeof log.action !== "string") {
    fail(`${prefix} 缺少必填字段 action`);
    valid = false;
  }
  if (!Array.isArray(log.changes)) {
    fail(`${prefix} 缺少必填字段 changes（应为数组）`);
    valid = false;
  } else if (log.changes.length === 0) {
    warn(`${prefix} changes 数组为空——本次操作无数据变更？`);
  }

  return valid;
}

/**
 * 递归解析 JSON 对象的所有叶子路径。
 * 返回 { "path.to.key": value } 的扁平映射。
 */
function flattenObject(obj, prefix = "") {
  const result = {};
  if (obj === null || typeof obj !== "object") {
    result[prefix] = obj;
  } else if (Array.isArray(obj)) {
    // 对于数组，按索引展开
    for (let i = 0; i < obj.length; i++) {
      Object.assign(result, flattenObject(obj[i], `${prefix}[${i}]`));
    }
  } else {
    for (const [key, val] of Object.entries(obj)) {
      const newPrefix = prefix ? `${prefix}.${key}` : key;
      Object.assign(result, flattenObject(val, newPrefix));
    }
  }
  return result;
}

/**
 * 比较两个扁平对象，生成变更列表。
 * 返回 { field, from, to }[]
 */
function diffFlatObjects(oldFlat, newFlat) {
  const changes = [];
  const allKeys = new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)]);

  for (const key of allKeys) {
    const oldVal = oldFlat[key];
    const newVal = newFlat[key];

    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({
        field: key,
        from: oldVal,
        to: newVal,
      });
    }
  }

  return changes;
}

// ══════════════════════════════════════════════════════════════
// 主逻辑（仅直接执行时运行）
// ══════════════════════════════════════════════════════════════

function main() {

console.log(`${BOLD}── 1. 加载 constants.js ──${RESET}`);
ok("constants.js 加载成功 (require)");

console.log(`\n${BOLD}── 2. 提取操作日志 ──${RESET}`);

// 获取 PR 中所有非 merge commit 的 message
let commitsOutput;
try {
  const baseRef = process.env.GITHUB_BASE_REF || "main";
  const headRef = process.env.GITHUB_HEAD_REF;
  if (!headRef) {
    fail("无法获取 GITHUB_HEAD_REF 环境变量");
    process.exit(1);
  }

  // 用 git merge-base 找到分叉点，然后列出其后的所有 commit
  const mergeBase = execSync(
    `git merge-base origin/${baseRef} HEAD`,
    { encoding: "utf-8" }
  ).trim();
  commitsOutput = execSync(
    `git log ${mergeBase}..HEAD --format="%H%n%B%n---LOG-END---"`,
    { encoding: "utf-8" }
  );
  ok(`获取 PR 的 commit 列表成功`);
} catch (e) {
  fail(`获取 commit 消息失败: ${e.message}`);
  process.exit(1);
}

// 解析每个 commit
const commitBlocks = commitsOutput.split("---LOG-END---").filter((b) => b.trim());
const allLogs = [];

if (commitBlocks.length === 0) {
  fail("PR 中没有找到任何 commit");
  process.exit(1);
}

ok(`PR 共 ${commitBlocks.length} 个 commit`);

for (let i = 0; i < commitBlocks.length; i++) {
  const block = commitBlocks[i].trim();
  const lines = block.split("\n");
  const hash = lines[0];
  const message = lines.slice(1).join("\n").trim();
  const shortHash = hash.substring(0, 7);

  console.log(`\n  [${shortHash}]`);

  const logs = extractLogFromMessage(message);

  if (logs.length === 0) {
    fail(`commit ${shortHash} commit message 中未找到结构化操作日志块`);
    console.log(`  提示：请在 commit message 中添加 JSON 日志块，格式见 .pi/skills/content-pr/SKILL.md`);
    continue;
  }

  for (let j = 0; j < logs.length; j++) {
    const log = logs[j];
    console.log(`  └─ 日志 #${j + 1}: operator="${log.operator}", action="${log.action}", changes=${log.changes?.length || 0} 条`);

    if (validateLogFields(log, allLogs.length)) {
      ok(`[${shortHash}] 日志 #${j + 1} 字段完整`);
    }

    allLogs.push({ hash: shortHash, log });
  }
}

// ══════════════════════════════════════════════════════════════
// 阶段 3：操作人权限校验
// ══════════════════════════════════════════════════════════════

console.log(`\n${BOLD}── 3. 操作人权限校验 ──${RESET}`);

for (const entry of allLogs) {
  const { hash, log } = entry;

  if (!OPERATOR_WHITELIST.includes(log.operator)) {
    fail(`[${hash}] operator "${log.operator}" 不在白名单中`);
    console.log(`  白名单: [${OPERATOR_WHITELIST.join(", ")}]`);
  } else {
    ok(`[${hash}] operator "${log.operator}" ✓`);
  }

  if (!VALID_ACTIONS.includes(log.action)) {
    fail(`[${hash}] action "${log.action}" 不在合法操作类型中`);
    console.log(`  合法类型: [${VALID_ACTIONS.join(", ")}]`);
  } else {
    ok(`[${hash}] action "${log.action}" ✓`);
  }
}

// ══════════════════════════════════════════════════════════════
// 阶段 4：修改一致性校验（changes vs 实际 data.json diff）
// ══════════════════════════════════════════════════════════════

console.log(`\n${BOLD}── 4. 修改一致性校验 ──${RESET}`);

// 获取 data.json 在 base 和当前 HEAD 的版本
let actualChanges = [];
try {
  const baseRef = process.env.GITHUB_BASE_REF || "main";
  const dataJsonPath = "public/data.json";

  // 获取 base 版本
  let oldRaw, newRaw;
  try {
    oldRaw = execSync(`git show origin/${baseRef}:${dataJsonPath}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e) {
    // base 中没有 data.json（可能是初始创建）
    ok(`base 分支中没有 ${dataJsonPath}，视为全新创建`);
    oldRaw = "{}";
  }

  // 获取当前版本
  try {
    newRaw = execSync(`git show HEAD:${dataJsonPath}`, {
      encoding: "utf-8",
    });
  } catch (e) {
    fail(`当前 HEAD 中缺少 ${dataJsonPath}`);
    actualChanges = null; // 标记为无法比较
  }

  if (actualChanges !== null) {
    const oldData = JSON.parse(oldRaw);
    const newData = JSON.parse(newRaw);

    const oldFlat = flattenObject(oldData);
    const newFlat = flattenObject(newData);

    actualChanges = diffFlatObjects(oldFlat, newFlat);
    ok(`data.json 实际变更: ${actualChanges.length} 个字段`);

    if (actualChanges.length === 0) {
      warn("data.json 无实际变更，但 PR 已创建（可能是仅修改非数据内容？请确认）");
    }

    for (const ch of actualChanges) {
      const fromStr =
        ch.from === undefined ? "<不存在>" : JSON.stringify(ch.from);
      const toStr =
        ch.to === undefined ? "<删除>" : JSON.stringify(ch.to);
      console.log(`    ${ch.field}: ${fromStr} → ${toStr}`);
    }
  }
} catch (e) {
  fail(`读取 data.json diff 失败: ${e.message}`);
  // 不影响其他校验继续执行
}

// 汇总日志中的所有 changes
const logChanges = [];
for (const entry of allLogs) {
  for (const ch of entry.log.changes) {
    logChanges.push({
      hash: entry.hash,
      field: ch.field,
      from: ch.from,
      to: ch.to,
    });
  }
}

ok(`日志中声明的变更: ${logChanges.length} 个字段`);

// 对比一致性
if (actualChanges !== null && actualChanges.length > 0) {
  // 构建集合作比较
  const actualSet = new Map();
  for (const ch of actualChanges) {
    actualSet.set(ch.field, ch);
  }

  const logSet = new Map();
  for (const ch of logChanges) {
    logSet.set(ch.field, ch);
  }

  // 检查：日志中有但实际 diff 中没有的
  for (const lc of logChanges) {
    if (!actualSet.has(lc.field)) {
      fail(
        `日志声明了 "${lc.field}" 变更，但 data.json diff 中未发现此字段变更`
      );
    } else {
      const ac = actualSet.get(lc.field);
      // 比较值（使用 JSON 序列化避免类型差异）
      const logFrom = JSON.stringify(lc.from);
      const logTo = JSON.stringify(lc.to);
      const actualFrom = JSON.stringify(ac.from);
      const actualTo = JSON.stringify(ac.to);

      if (logFrom !== actualFrom) {
        warn(
          `[${lc.hash}] "${lc.field}" 的 from 值不一致: 日志=${logFrom}, 实际=${actualFrom}`
        );
      }
      if (logTo !== actualTo) {
        warn(
          `[${lc.hash}] "${lc.field}" 的 to 值不一致: 日志=${logTo}, 实际=${actualTo}`
        );
      }
    }
  }

  // 检查：实际 diff 中有但日志中没有的
  for (const ac of actualChanges) {
    if (!logSet.has(ac.field)) {
      warn(
        `data.json 中 "${ac.field}" 发生了变更，但操作日志中未记录`
      );
    }
  }

  if (errors === 0) {
    ok("修改一致性校验通过");
  }
} else {
  console.log("  跳过一致性比较（无实际变更或无法读取 diff）");
}

// ══════════════════════════════════════════════════════════════
// 结果汇总
// ══════════════════════════════════════════════════════════════

console.log(`\n${BOLD}══════════════════════════════════════${RESET}`);
if (errors === 0) {
  console.log(`${GREEN}${BOLD}  操作日志校验通过 ✓${RESET}`);
  if (warnings > 0) {
    console.log(`${YELLOW}  ${warnings} 条提醒（不阻断）${RESET}`);
  }
  process.exit(0);
} else {
  console.log(`${RED}${BOLD}  操作日志校验失败: ${errors} 条错误${RESET}`);
  if (warnings > 0) {
    console.log(`${YELLOW}  ${warnings} 条提醒${RESET}`);
  }
  process.exit(1);
}

} // main() 结束

// ══════════════════════════════════════════════════════════════
// 导出 + 入口判断
// ══════════════════════════════════════════════════════════════

module.exports = {
  extractLogFromMessage,
  validateLogFields,
  flattenObject,
  diffFlatObjects,
};

if (require.main === module) {
  main();
}
