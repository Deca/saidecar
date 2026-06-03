#!/usr/bin/env node

import { formatDoctorChecks, runDoctorChecks } from "../src/doctor.js";

const checks = await runDoctorChecks();
console.log(formatDoctorChecks(checks));
process.exit(checks.some((item) => !item.ok) ? 1 : 0);
