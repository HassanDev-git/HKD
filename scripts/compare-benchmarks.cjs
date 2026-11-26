const fs = require("node:fs");
const path = require("node:path");
const { calculateStatistics } = require("../benchmarks/phase9/metrics/statistics.cjs");

function readReport(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
}

function assertCorrect(report, label) {
  if (!Array.isArray(report.workloads) || report.workloads.length === 0) throw new Error(`${label} has no workload results`);
  const ids = new Set();
  for (const workload of report.workloads) {
    if (!workload.id || ids.has(workload.id)) throw new Error(`${label} contains duplicate or missing workload IDs`);
    ids.add(workload.id);
    if (workload.correctness?.verified !== true || !Array.isArray(workload.samples_ms) || workload.samples_ms.length < 2 || workload.samples_ms.some(value => typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
      throw new Error(`${label} workload ${workload.id} has not passed correctness or has no raw timing samples`);
    }
  }
}

function environmentChanges(baseline, candidate) {
  const fields = ["os", "architecture", "cpu_model", "node_version", "zig_version"];
  return fields.filter((field) => baseline.environment?.[field] !== candidate.environment?.[field]).map((field) => ({
    field,
    baseline: baseline.environment?.[field] ?? "unavailable",
    candidate: candidate.environment?.[field] ?? "unavailable",
  }));
}

function compare(baseline, candidates) {
  assertCorrect(baseline, "Baseline");
  candidates.forEach((report, index) => assertCorrect(report, `Candidate run ${index + 1}`));
  for (const report of candidates) {
    if (report.workloads.length !== baseline.workloads.length || baseline.workloads.some(w => !report.workloads.some(c => c.id === w.id))) {
      throw new Error("Every candidate run must contain exactly the baseline workload IDs");
    }
    for (const field of ["warmup_iterations", "measured_iterations", "primary_metric", "timing_clock"]) {
      if (baseline.methodology?.[field] !== report.methodology?.[field]) throw new Error(`Benchmark methodology changed: ${field}`);
    }
  }
  const environmentFields = ["os", "architecture", "cpu_model", "node_version", "zig_version"];
  const candidateEnvironment = candidates[0].environment || {};
  if (candidates.some((report) => environmentFields.some((field) => report.environment?.[field] !== candidateEnvironment[field]))) {
    throw new Error("Candidate runs use different environments; do not pool measurements across machines or runtimes");
  }
  if (candidates.some((report) => report.git?.commit !== candidates[0].git?.commit)) {
    throw new Error("Candidate runs use different source revisions; do not pool measurements across revisions");
  }
  const baselineById = new Map(baseline.workloads.map((workload) => [workload.id, workload]));
  const candidateById = new Map();
  for (const report of candidates) {
    for (const workload of report.workloads) {
      const prior = candidateById.get(workload.id);
      if (prior && prior.workload.execution_type !== workload.execution_type) throw new Error(`Execution path changed for ${workload.id}`);
      candidateById.set(workload.id, { workload, samples: [...(prior?.samples || []), ...workload.samples_ms] });
    }
  }
  if (baselineById.size !== candidateById.size || [...baselineById.keys()].some((id) => !candidateById.has(id))) {
    throw new Error("Baseline and candidate workload IDs do not match");
  }

  const changedEnvironment = candidates.flatMap((report) => environmentChanges(baseline, report));
  const environmentDifferences = [...new Map(changedEnvironment.map((item) => [`${item.field}:${item.candidate}`, item])).values()];
  const rows = [];
  for (const [id, baselineWorkload] of baselineById) {
    const candidate = candidateById.get(id);
    if (baselineWorkload.execution_type !== candidate.workload.execution_type) throw new Error(`Execution path changed for ${id}`);
    const baselineSamples = baselineWorkload.samples_ms;
    const candidateStats = calculateStatistics(candidate.samples);
    const baselineStats = calculateStatistics(baselineSamples);
    const percentChange = baselineStats.median === 0 ? null : ((candidateStats.median - baselineStats.median) / baselineStats.median) * 100;
    const standardError = Math.sqrt((baselineStats.standardDeviation ** 2 / baselineStats.sampleCount) + (candidateStats.standardDeviation ** 2 / candidateStats.sampleCount));
    const statisticallySuspicious = percentChange !== null && percentChange >= 20 && (candidateStats.median - baselineStats.median) > 2 * standardError;
    rows.push({
      id,
      name: baselineWorkload.name,
      executionType: baselineWorkload.execution_type,
      correctness: "PASS",
      baseline: baselineStats,
      candidate: candidateStats,
      percentChange: percentChange === null ? null : Number(percentChange.toFixed(2)),
      assessment: environmentDifferences.length ? "ENVIRONMENT_CHANGED — compare cautiously" : statisticallySuspicious ? "INVESTIGATE — slower beyond conservative noise guard" : "NO REGRESSION FLAG",
    });
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    methodology: {
      workloadMatching: "exact workload ID and execution_type; mismatches abort",
      correctness: "all baseline and candidate correctness.verified values must be true before timing comparison",
      candidateMeasurements: "raw samples pooled across candidate report files",
      regressionFlag: "investigate only when median is at least 20% slower and delta exceeds 2 combined standard errors",
      ciFailureThreshold: "none; timing flags are advisory and do not fail CI",
    },
    baseline: { id: baseline.baseline, generatedAt: baseline.generated_at, commit: baseline.git?.commit },
    candidateRuns: candidates.map((report) => ({ id: report.baseline, generatedAt: report.generated_at, commit: report.git?.commit })),
    sourceRevisionDifferences: candidates.map((report) => ({
      baselineCommit: baseline.git?.commit ?? "unavailable",
      candidateCommit: report.git?.commit ?? "unavailable",
      baselineWorkingTreeDirty: baseline.git?.dirty ?? "unavailable",
      candidateWorkingTreeDirty: report.git?.dirty ?? "unavailable",
    })),
    environmentDifferences,
    workloads: rows,
  };
}

function markdown(report) {
  const lines = [
    "# HKD Benchmark Comparison",
    "",
    `Generated: ${report.generatedAt}`,
    `Baseline: ${report.baseline.id} (${report.baseline.generatedAt})`,
    `Candidate runs pooled: ${report.candidateRuns.length}`,
    "",
    "Correctness was checked before timing comparison. Workloads are matched by ID and execution path. A result is flagged for investigation only when it is at least 20% slower and exceeds two combined standard errors. These flags are advisory; they do not fail CI.",
    "",
  ];
  if (report.environmentDifferences.length) {
    lines.push("## Environment differences", "", ...report.environmentDifferences.map((item) => `- ${item.field}: baseline ${item.baseline}, candidate ${item.candidate}`), "");
  }
  lines.push("## Source revision evidence", "", ...report.sourceRevisionDifferences.map((item) => `- Commit ${item.baselineCommit} → ${item.candidateCommit}; dirty states ${item.baselineWorkingTreeDirty} → ${item.candidateWorkingTreeDirty}`), "");
  lines.push("## Workloads", "", "| Workload | Path | Baseline median ms | Candidate median ms | Change | Candidate SD ms | Assessment |", "|---|---|---:|---:|---:|---:|---|");
  for (const item of report.workloads) lines.push(`| ${item.name} | ${item.executionType} | ${item.baseline.median} | ${item.candidate.median} | ${item.percentChange ?? "n/a"}% | ${item.candidate.standardDeviation} | ${item.assessment} |`);
  lines.push("");
  return lines.join("\n");
}

if (require.main === module) {
const [baselinePath, ...candidatePaths] = process.argv.slice(2);
if (!baselinePath || candidatePaths.length === 0) {
  console.error("Usage: node scripts/compare-benchmarks.cjs <baseline.json> <candidate-run-1.json> [candidate-run-2.json ...]");
  process.exit(2);
}
const result = compare(readReport(baselinePath), candidatePaths.map(readReport));
const outDir = path.resolve("artifacts");
const reportPrefix = `benchmark-comparison-${Date.now()}`;
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${reportPrefix}.json`), JSON.stringify(result, null, 2) + "\n");
fs.writeFileSync(path.join(outDir, `${reportPrefix}.md`), markdown(result));
console.log(`Compared ${result.workloads.length} correctness-verified workloads across ${result.candidateRuns.length} candidate runs.`);

}
module.exports = { compare, markdown };
