import test from "node:test";
import assert from "node:assert/strict";
import { formatDoctorChecks } from "../src/doctor.js";

test("formatDoctorChecks reports failures and successes", () => {
  const output = formatDoctorChecks([
    { name: "Node.js", ok: true, detail: "v99.0.0" },
    { name: "backend config", ok: false, detail: "missing key" },
  ]);

  assert.match(output, /OK\s+Node\.js/);
  assert.match(output, /FAIL backend config/);
  assert.match(output, /1 check failed/);
});
