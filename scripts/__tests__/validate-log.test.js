/**
 * validate-log.js 单元测试
 *
 * 覆盖 9 个场景：合法日志、缺失日志、缺字段、白名单拦截、
 * 非法 action、diff 算法、多变更、新增条目、Schema 校验
 *
 * 运行: node --test scripts/__tests__/validate-log.test.js
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const { validateLogFields, extractLogFromMessage, flattenObject, diffFlatObjects } = require("../validate-log.js");

// ── 辅助：重置 validateLogFields 的副作用计数器 ──
// validateLogFields 内部调用全局 fail()/warn()，测试时需要隔离。
// 这里我们直接检测返回值，同时 mock 掉副作用函数。
// 由于 fail/warn 是模块内闭包变量无法直接 mock，我们通过 require.cache 重新加载模块。

function loadValidatorWithMock({ failMock, warnMock }) {
  // 清除缓存以重新加载
  delete require.cache[require.resolve("../validate-log.js")];
  // 注入 mock：用环境变量或直接测试纯逻辑
  // 简化方案：直接测试 extractLog/validateLogFields 的输入输出和返回值
  return require("../validate-log.js");
}

// ══════════════════════════════════════════════════════════════
// 测试 1: 合法日志 — extractLogFromMessage 正确解析
// ══════════════════════════════════════════════════════════════

describe("extractLogFromMessage", () => {
  it("TEST-1: 正确提取带 json 标记的日志块", () => {
    const msg = `feat: 更新队伍数据

\`\`\`json
{
  "operator": "weunimix",
  "timestamp": "2026-07-16T10:00:00Z",
  "action": "updateTeam",
  "changes": [
    { "field": "teams[0].name", "from": "旧队名", "to": "新队名" }
  ]
}
\`\`\``;
    const logs = extractLogFromMessage(msg);
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].operator, "weunimix");
    assert.strictEqual(logs[0].action, "updateTeam");
    assert.strictEqual(logs[0].changes.length, 1);
  });

  it("TEST-1b: 正确提取无 json 标记的代码块", () => {
    const msg = `fix: something

\`\`\`
{
  "operator": "admin",
  "action": "addNews",
  "timestamp": "2026-07-16T10:00:00Z",
  "changes": []
}
\`\`\``;
    const logs = extractLogFromMessage(msg);
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].operator, "admin");
  });
});

// ══════════════════════════════════════════════════════════════
// 测试 2: 缺失日志
// ══════════════════════════════════════════════════════════════

describe("extractLogFromMessage — 缺失日志", () => {
  it("TEST-2: 无代码块的 commit message 返回空数组", () => {
    const msg = "feat: update something without log";
    const logs = extractLogFromMessage(msg);
    assert.strictEqual(logs.length, 0);
  });

  it("TEST-2b: 代码块中无 operator/action 字段被忽略", () => {
    const msg = '```json\n{"foo": "bar"}\n```';
    const logs = extractLogFromMessage(msg);
    assert.strictEqual(logs.length, 0);
  });

  it("TEST-2c: 无效 JSON 代码块不崩溃，被跳过", () => {
    const msg = '```json\n{invalid json!!!}\n```';
    const logs = extractLogFromMessage(msg);
    assert.strictEqual(logs.length, 0);
  });
});

// ══════════════════════════════════════════════════════════════
// 测试 3: 缺少必填字段
// ══════════════════════════════════════════════════════════════

describe("validateLogFields — 字段校验", () => {
  it("TEST-3a: 完整字段返回 true", () => {
    const log = {
      operator: "weunimix",
      timestamp: "2026-07-16T10:00:00Z",
      action: "updateTeam",
      changes: [{ field: "x", from: 1, to: 2 }],
    };
    assert.strictEqual(validateLogFields(log, 0), true);
  });

  it("TEST-3b: 缺少 operator 返回 false", () => {
    const log = {
      timestamp: "2026-07-16T10:00:00Z",
      action: "updateTeam",
      changes: [],
    };
    assert.strictEqual(validateLogFields(log, 0), false);
  });

  it("TEST-3c: 缺少 timestamp 返回 false", () => {
    const log = {
      operator: "weunimix",
      action: "updateTeam",
      changes: [],
    };
    assert.strictEqual(validateLogFields(log, 0), false);
  });

  it("TEST-3d: 缺少 action 返回 false", () => {
    const log = {
      operator: "weunimix",
      timestamp: "2026-07-16T10:00:00Z",
      changes: [],
    };
    assert.strictEqual(validateLogFields(log, 0), false);
  });

  it("TEST-3e: changes 不是数组返回 false", () => {
    const log = {
      operator: "weunimix",
      timestamp: "2026-07-16T10:00:00Z",
      action: "updateTeam",
      changes: "not-an-array",
    };
    assert.strictEqual(validateLogFields(log, 0), false);
  });

  it("TEST-3f: 空 changes 数组不阻断但触发 warning（仍返回 true）", () => {
    const log = {
      operator: "weunimix",
      timestamp: "2026-07-16T10:00:00Z",
      action: "updateTeam",
      changes: [],
    };
    // 空 changes 仅 warn，不影响 validateLogFields 返回值
    assert.strictEqual(validateLogFields(log, 0), true);
  });
});

// ══════════════════════════════════════════════════════════════
// 测试 4: 白名单拦截（operator 约束由 constants.js 定义）
// ══════════════════════════════════════════════════════════════

describe("操作人白名单（集成验证）", () => {
  it("TEST-4: constants.js 中 OPERATOR_WHITELIST 包含 weunimix", () => {
    const { OPERATOR_WHITELIST } = require("../../constants.js");
    assert.ok(OPERATOR_WHITELIST.includes("weunimix"));
  });

  it("TEST-4b: 白名单不包含未知用户", () => {
    const { OPERATOR_WHITELIST } = require("../../constants.js");
    assert.strictEqual(OPERATOR_WHITELIST.includes("evil_hacker"), false);
  });
});

// ══════════════════════════════════════════════════════════════
// 测试 5: 非法 action
// ══════════════════════════════════════════════════════════════

describe("合法 action（集成验证）", () => {
  it("TEST-5: VALID_ACTIONS 包含 updateTeam", () => {
    const { VALID_ACTIONS } = require("../../constants.js");
    assert.ok(VALID_ACTIONS.includes("updateTeam"));
  });

  it("TEST-5b: VALID_ACTIONS 不包含 deleteAll", () => {
    const { VALID_ACTIONS } = require("../../constants.js");
    assert.strictEqual(VALID_ACTIONS.includes("deleteAll"), false);
  });
});

// ══════════════════════════════════════════════════════════════
// 测试 6: diff 算法
// ══════════════════════════════════════════════════════════════

describe("flattenObject + diffFlatObjects（diff 算法）", () => {
  it("TEST-6a: flattenObject 正确扁平化嵌套对象", () => {
    const obj = { a: { b: 1, c: 2 }, d: 3 };
    const flat = flattenObject(obj);
    assert.deepStrictEqual(flat, { "a.b": 1, "a.c": 2, "d": 3 });
  });

  it("TEST-6b: flattenObject 正确扁平化含数组的对象", () => {
    const obj = { teams: [{ name: "A" }, { name: "B" }] };
    const flat = flattenObject(obj);
    assert.deepStrictEqual(flat, { "teams[0].name": "A", "teams[1].name": "B" });
  });

  it("TEST-6c: flattenObject 处理 null 值", () => {
    const flat = flattenObject({ x: null });
    assert.deepStrictEqual(flat, { "x": null });
  });

  it("TEST-6d: diffFlatObjects 检测修改", () => {
    const old = { name: "A", value: 1 };
    const newer = { name: "B", value: 1 };
    const changes = diffFlatObjects(old, newer);
    assert.strictEqual(changes.length, 1);
    assert.deepStrictEqual(changes[0], { field: "name", from: "A", to: "B" });
  });

  it("TEST-6e: diffFlatObjects 检测新增和删除", () => {
    const old = { a: 1 };
    const newer = { a: 1, b: 2 };
    const changes = diffFlatObjects(old, newer);
    assert.strictEqual(changes.length, 1);
    assert.deepStrictEqual(changes[0], { field: "b", from: undefined, to: 2 });
  });

  it("TEST-6f: diffFlatObjects 无变更返回空数组", () => {
    const old = { a: 1, b: "hello" };
    const newer = { a: 1, b: "hello" };
    const changes = diffFlatObjects(old, newer);
    assert.strictEqual(changes.length, 0);
  });
});

// ══════════════════════════════════════════════════════════════
// 测试 7: 多变更
// ══════════════════════════════════════════════════════════════

describe("多变更场景", () => {
  it("TEST-7: 一个日志包含多个 changes 均被正确提取", () => {
    const msg = `feat: multi-update

\`\`\`json
{
  "operator": "weunimix",
  "timestamp": "2026-07-16T10:00:00Z",
  "action": "updateTeam",
  "changes": [
    { "field": "teams[0].name", "from": "A", "to": "AA" },
    { "field": "teams[0].status", "from": "upcoming", "to": "live" },
    { "field": "meta.season", "from": 1, "to": 2 }
  ]
}
\`\`\``;
    const logs = extractLogFromMessage(msg);
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].changes.length, 3);
    assert.strictEqual(logs[0].changes[0].field, "teams[0].name");
    assert.strictEqual(logs[0].changes[2].field, "meta.season");
  });

  it("TEST-7b: 多个 commit 各带一个日志", () => {
    const msg1 = '```json\n{"operator":"weunimix","timestamp":"2026-07-16T10:00:00Z","action":"updateTeam","changes":[{"field":"a","from":1,"to":2}]}\n```';
    const msg2 = '```json\n{"operator":"weunimix","timestamp":"2026-07-16T11:00:00Z","action":"addNews","changes":[{"field":"news[0].title","from":"<不存在>","to":"新消息"}]}\n```';

    assert.strictEqual(extractLogFromMessage(msg1).length, 1);
    assert.strictEqual(extractLogFromMessage(msg2).length, 1);
    assert.strictEqual(extractLogFromMessage(msg1)[0].action, "updateTeam");
    assert.strictEqual(extractLogFromMessage(msg2)[0].action, "addNews");
  });
});

// ══════════════════════════════════════════════════════════════
// 测试 8: 新增条目（from 为 "<不存在>" 语义）
// ══════════════════════════════════════════════════════════════

describe("新增条目", () => {
  it("TEST-8: diffFlatObjects 正确标记新增字段（from = undefined）", () => {
    const old = {};
    const newer = { teams: [{ name: "新队伍" }] };
    const changes = diffFlatObjects(
      flattenObject(old),
      flattenObject(newer)
    );
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].field, "teams[0].name");
    assert.strictEqual(changes[0].from, undefined);
    assert.strictEqual(changes[0].to, "新队伍");
  });

  it("TEST-8b: 日志中可声明 from 为 null/undefined 表示新增", () => {
    const msg = `feat: add new

\`\`\`json
{
  "operator": "weunimix",
  "timestamp": "2026-07-16T10:00:00Z",
  "action": "addBroadcaster",
  "changes": [
    { "field": "broadcasters[0].name", "to": "新主播" }
  ]
}
\`\`\``;
    const logs = extractLogFromMessage(msg);
    assert.strictEqual(logs.length, 1);
    assert.strictEqual(logs[0].changes[0].to, "新主播");
    // from 缺失视为新增
    assert.strictEqual(logs[0].changes[0].from, undefined);
  });
});

// ══════════════════════════════════════════════════════════════
// 测试 9: Schema 校验
// ══════════════════════════════════════════════════════════════

describe("Schema 校验", () => {
  it("TEST-9: operations.schema.json 文件存在且为有效 JSON", () => {
    const fs = require("fs");
    const path = require("path");
    const schemaPath = path.resolve(__dirname, "..", "..", "schema", "operations.schema.json");
    assert.ok(fs.existsSync(schemaPath), "operations.schema.json 文件存在");

    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    assert.strictEqual(schema.$id, "operations.schema.json");
    assert.ok(schema.properties);
    assert.ok(schema.properties.operator);
    assert.ok(schema.properties.action);
    assert.ok(schema.properties.changes);
  });

  it("TEST-9b: Schema 要求必填字段 operator/action/timestamp/changes", () => {
    const fs = require("fs");
    const path = require("path");
    const schemaPath = path.resolve(__dirname, "..", "..", "schema", "operations.schema.json");
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    assert.ok(schema.required.includes("operator"));
    assert.ok(schema.required.includes("action"));
    assert.ok(schema.required.includes("timestamp"));
    assert.ok(schema.required.includes("changes"));
  });

  it("TEST-9c: Schema action.enum 与 constants.js VALID_ACTIONS 一致", () => {
    const { VALID_ACTIONS } = require("../../constants.js");
    const fs = require("fs");
    const path = require("path");
    const schemaPath = path.resolve(__dirname, "..", "..", "schema", "operations.schema.json");
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));

    const schemaActions = [...schema.properties.action.enum].sort();
    const constActions = [...VALID_ACTIONS].sort();

    assert.deepStrictEqual(
      schemaActions,
      constActions,
      "schema 和 constants.js 的 action 列表不一致，请同步更新"
    );
  });
});
