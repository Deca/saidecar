import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  askCodex,
  isLoginCheckFresh,
  resetLoginCheckCache,
  _setSpawnForTests,
} from "../src/codexClient.js";

// A controllable child. Call fire(exitCode) when ready to emit close.
function createControllableChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = { end: () => {} };
  child.kill = () => {};
  let fired = false;
  child.fire = (exitCode = 0, chunks = []) => {
    if (fired) return;
    fired = true;
    for (const c of chunks.stdout || []) child.stdout.emit("data", Buffer.from(c));
    for (const c of chunks.stderr || []) child.stderr.emit("data", Buffer.from(c));
    child.emit("close", exitCode);
  };
  return child;
}

function makeSpawnMock(children) {
  let i = 0;
  const invocations = [];
  const fn = (cmd, args) => {
    invocations.push({ cmd, args });
    if (i >= children.length) {
      throw new Error(`mock spawn exhausted at call ${i + 1}`);
    }
    return children[i++];
  };
  return { fn, invocations };
}

// Helper: microtask yield so codexClient can attach handlers
const yield_ = () => new Promise((r) => setImmediate(r));

test("askCodex reports per-stage timing on success", async () => {
  resetLoginCheckCache();
  const login = createControllableChild();
  const main = createControllableChild();
  const { fn } = makeSpawnMock([login, main]);
  _setSpawnForTests(fn);

  const promise = askCodex({ question: "hi", modeName: "normal" });
  // Let the codexClient attach handlers to login
  await yield_();
  login.fire(0);
  await yield_();
  main.fire(0, { stdout: ["x"] });
  const result = await promise;

  assert.equal(result.backend, "codex");
  assert.ok(result.timing, "timing should be set");
  assert.equal(typeof result.timing.loginMs, "number");
  assert.equal(typeof result.timing.cliStartupMs, "number");
  assert.equal(typeof result.timing.modelMs, "number");
  assert.equal(typeof result.timing.totalMs, "number");
  _setSpawnForTests(null);
});

test("askCodex skips login check when cache is fresh (only one spawn on second call)", async () => {
  resetLoginCheckCache();
  const login1 = createControllableChild();
  const main1 = createControllableChild();
  const first = makeSpawnMock([login1, main1]);
  _setSpawnForTests(first.fn);
  const p1 = askCodex({ question: "first", modeName: "normal" });
  await yield_();
  login1.fire(0);
  await yield_();
  main1.fire(0, { stdout: ["first"] });
  await p1;
  assert.equal(first.invocations.length, 2);

  // Second call: cache is fresh, only main child should be spawned
  const main2 = createControllableChild();
  const second = makeSpawnMock([main2]);
  _setSpawnForTests(second.fn);
  const p2 = askCodex({ question: "second", modeName: "normal" });
  await yield_();
  main2.fire(0, { stdout: ["second"] });
  await p2;
  assert.equal(second.invocations.length, 1, "second call should only spawn the main child");
  _setSpawnForTests(null);
});

test("askCodex reflects login time in timing on cold cache", async () => {
  resetLoginCheckCache();
  const login = createControllableChild();
  const main = createControllableChild();
  const { fn } = makeSpawnMock([login, main]);
  _setSpawnForTests(fn);

  const promise = askCodex({ question: "q", modeName: "normal" });
  await yield_();
  // Wait long enough to make loginMs > 0
  await new Promise((r) => setTimeout(r, 30));
  login.fire(0);
  await yield_();
  main.fire(0, { stdout: ["x"] });
  const result = await promise;

  assert.ok(result.timing.loginMs >= 25, `loginMs=${result.timing.loginMs} should be >= 25`);
  _setSpawnForTests(null);
});

test("askCodex reports loginMs=0 on warm cache", async () => {
  resetLoginCheckCache();
  const login = createControllableChild();
  const main1 = createControllableChild();
  const first = makeSpawnMock([login, main1]);
  _setSpawnForTests(first.fn);
  const p1 = askCodex({ question: "warm-up", modeName: "normal" });
  await yield_();
  login.fire(0);
  await yield_();
  main1.fire(0, { stdout: ["a"] });
  await p1;

  const main2 = createControllableChild();
  const second = makeSpawnMock([main2]);
  _setSpawnForTests(second.fn);
  const p2 = askCodex({ question: "q2", modeName: "normal" });
  await yield_();
  main2.fire(0, { stdout: ["b"] });
  const result = await p2;

  assert.equal(result.timing.loginMs, 0, "loginMs should be 0 on warm cache");
  _setSpawnForTests(null);
});

test("askCodex rejects with auth error when login check fails", async () => {
  resetLoginCheckCache();
  const login = createControllableChild();
  const { fn } = makeSpawnMock([login]);
  _setSpawnForTests(fn);

  const promise = askCodex({ question: "q", modeName: "normal" });
  await yield_();
  login.fire(1, { stderr: ["ERROR: not logged in. Run `codex login` first."] });

  await assert.rejects(promise, /not logged in|not authenticated/i);
  _setSpawnForTests(null);
});

test("askCodex returns answer trimmed (stdout fallback when no -o file)", async () => {
  resetLoginCheckCache();
  const login = createControllableChild();
  const main = createControllableChild();
  const { fn } = makeSpawnMock([login, main]);
  _setSpawnForTests(fn);

  const promise = askCodex({ question: "q", modeName: "normal" });
  await yield_();
  login.fire(0);
  await yield_();
  main.fire(0, { stdout: ["  hello world  \n"] });
  const result = await promise;

  assert.equal(result.answer, "hello world");
  _setSpawnForTests(null);
});

test("isLoginCheckFresh and resetLoginCheckCache work together", async () => {
  resetLoginCheckCache();
  assert.equal(isLoginCheckFresh(), false);
  const login = createControllableChild();
  const main = createControllableChild();
  const { fn } = makeSpawnMock([login, main]);
  _setSpawnForTests(fn);
  const promise = askCodex({ question: "q", modeName: "normal" });
  await yield_();
  login.fire(0);
  await yield_();
  main.fire(0, { stdout: ["x"] });
  await promise;
  assert.equal(isLoginCheckFresh(), true);
  resetLoginCheckCache();
  assert.equal(isLoginCheckFresh(), false);
  _setSpawnForTests(null);
});
