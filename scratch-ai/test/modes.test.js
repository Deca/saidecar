import test from "node:test";
import assert from "node:assert/strict";
import { parseInput } from "../src/modes.js";

test("parseInput returns empty for blank input", () => {
  assert.deepEqual(parseInput(""), { type: "empty" });
  assert.deepEqual(parseInput("   "), { type: "empty" });
  assert.deepEqual(parseInput("\t"), { type: "empty" });
});

test("parseInput handles /exit, :q, and quit as exit commands", () => {
  assert.deepEqual(parseInput("/exit"), { type: "command", command: "exit" });
  assert.deepEqual(parseInput(":q"), { type: "command", command: "exit" });
  assert.deepEqual(parseInput("quit"), { type: "command", command: "exit" });
  assert.deepEqual(parseInput("QUIT"), { type: "command", command: "exit" });
});

test("parseInput handles simple commands", () => {
  assert.deepEqual(parseInput("/help"), { type: "command", command: "help" });
  assert.deepEqual(parseInput("?"), { type: "command", command: "help" });
  assert.deepEqual(parseInput("/status"), { type: "command", command: "status" });
  assert.deepEqual(parseInput("/session"), { type: "command", command: "status" });
  assert.deepEqual(parseInput("/config"), { type: "command", command: "config" });
  assert.deepEqual(parseInput("/log"), { type: "command", command: "log" });
  assert.deepEqual(parseInput("/modes"), { type: "command", command: "modes" });
  assert.deepEqual(parseInput("/history"), { type: "command", command: "history" });
  assert.deepEqual(parseInput("/clear"), { type: "command", command: "clear" });
  assert.deepEqual(parseInput("/reset"), { type: "command", command: "reset" });
});

test("parseInput handles /context variants", () => {
  assert.deepEqual(parseInput("/context"), { type: "command", command: "context", action: "status" });
  assert.deepEqual(parseInput("/context on"), { type: "command", command: "context", action: "on" });
  assert.deepEqual(parseInput("/context OFF"), { type: "command", command: "context", action: "off" });
  assert.deepEqual(parseInput("/context status"), { type: "command", command: "context", action: "status" });
  assert.deepEqual(parseInput("/context invalid"), { type: "command", command: "unknown", input: "/context invalid" });
});

test("parseInput handles /save command", () => {
  const result = parseInput("/save 3 laravel queue");
  assert.equal(result.type, "command");
  assert.equal(result.command, "save");
  assert.equal(result.index, 3);
  assert.deepEqual(result.tags, ["laravel", "queue"]);
});

test("parseInput handles /tag command", () => {
  const result = parseInput("/tag 5 important");
  assert.equal(result.type, "command");
  assert.equal(result.command, "tag");
  assert.equal(result.index, 5);
  assert.deepEqual(result.tags, ["important"]);
});

test("parseInput handles /tag with no tags as unknown", () => {
  const result = parseInput("/tag 5");
  assert.deepEqual(result, { type: "command", command: "tag", index: 5, tags: [] });
});

test("parseInput handles mode prefixes", () => {
  const thinkResult = parseInput("/think what is Rust?");
  assert.equal(thinkResult.type, "question");
  assert.equal(thinkResult.mode, "think");
  assert.equal(thinkResult.question, "what is Rust?");

  const tResult = parseInput("/t what is Rust?");
  assert.equal(tResult.type, "question");
  assert.equal(tResult.mode, "think");

  const webResult = parseInput("/web latest news");
  assert.equal(webResult.type, "question");
  assert.equal(webResult.mode, "web");

  const wResult = parseInput("/w latest news");
  assert.equal(wResult.type, "question");
  assert.equal(wResult.mode, "web");

  const deepwebResult = parseInput("/deepweb analyze this");
  assert.equal(deepwebResult.type, "question");
  assert.equal(deepwebResult.mode, "deepweb");

  const dwResult = parseInput("/dw analyze this");
  assert.equal(dwResult.type, "question");
  assert.equal(dwResult.mode, "deepweb");

  const qResult = parseInput("/q what's the weather?");
  assert.equal(qResult.type, "question");
  assert.equal(qResult.mode, "normal");
  assert.equal(qResult.question, "what's the weather?");
});

test("parseInput treats unknown / commands as unknown", () => {
  assert.deepEqual(parseInput("/foobar"), { type: "command", command: "unknown", input: "/foobar" });
  assert.deepEqual(parseInput("/exitall"), { type: "command", command: "unknown", input: "/exitall" });
});

test("parseInput treats regular text as question in normal mode", () => {
  const result = parseInput("What is the meaning of life?");
  assert.equal(result.type, "question");
  assert.equal(result.mode, "normal");
  assert.equal(result.question, "What is the meaning of life?");
});

test("parseInput handles mode prefix with no question text", () => {
  const result = parseInput("/think");
  assert.equal(result.type, "command");
  assert.equal(result.command, "unknown");
});

test("parseInput handles /save with just index", () => {
  const result = parseInput("/save 7");
  assert.equal(result.type, "command");
  assert.equal(result.command, "save");
  assert.equal(result.index, 7);
  assert.deepEqual(result.tags, []);
});