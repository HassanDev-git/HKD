const { spawnSync } = require("child_process");
const path = require("path");
const exe = path.join(process.cwd(), "native-runtime/zig-out/bin/hkd-runtime.exe");

function bench(name, file) {
  const times = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    spawnSync(exe, [file]);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  console.log(`${name}: median ${times[2].toFixed(2)} ms, min ${times[0].toFixed(2)} ms`);
}

bench("loop (1M)", "benchmarks/loop.hkdb");
bench("fib (30)", "benchmarks/fib.hkdb");
