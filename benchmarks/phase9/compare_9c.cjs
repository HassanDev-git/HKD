const fs = require("fs");

const b9a = JSON.parse(fs.readFileSync("benchmarks/baseline_v1.json", "utf-8"));
const b9b = JSON.parse(fs.readFileSync("benchmarks/phase9/results/phase9b_final.json", "utf-8"));
const b9c = JSON.parse(fs.readFileSync("benchmarks/phase9/results/phase9c_register_final.json", "utf-8"));

console.log("| Workload | 9A Baseline (ms) | 9B Stack (ms) | 9C Reg (ms) | Delta vs 9A | Delta vs 9B | Status vs 9B |");
console.log("| :--- | ---: | ---: | ---: | ---: | ---: | :---: |");

let winCount = 0;
let lossCount = 0;
let neutralCount = 0;

b9a.workloads.forEach((w, i) => {
  const m9a = w.statistics_ms.median;
  const m9b = b9b.workloads[i].statistics_ms.median;
  const m9c = b9c.workloads[i].statistics_ms.median;
  const d9aPct = ((m9c - m9a) / m9a) * 100;
  const d9bPct = ((m9c - m9b) / m9b) * 100;
  const d9a = (d9aPct > 0 ? "+" : "") + d9aPct.toFixed(1) + "%";
  const d9b = (d9bPct > 0 ? "+" : "") + d9bPct.toFixed(1) + "%";
  
  let status = "NEUTRAL";
  if (d9bPct < -5) {
    status = "**WIN**";
    winCount++;
  } else if (d9bPct > 5) {
    status = "SLOWER";
    lossCount++;
  } else {
    neutralCount++;
  }

  console.log(`| ${w.name} | ${m9a.toFixed(2)} | ${m9b.toFixed(2)} | ${m9c.toFixed(2)} | ${d9a} | ${d9b} | ${status} |`);
});

console.log(`\nSummary vs 9B Stack VM: WIN: ${winCount}, SLOWER: ${lossCount}, NEUTRAL: ${neutralCount}`);
