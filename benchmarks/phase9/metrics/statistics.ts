/**
 * HKD Phase 9 Statistics Engine
 *
 * Provides transparent, deterministic statistical calculations for benchmark metrics:
 * - min, max, mean, median
 * - percentile p95, p99
 * - delta and speedup comparison
 */

export interface BenchmarkStatistics {
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
  sampleCount: number;
}

export interface DeltaComparison {
  baselineMedian: number;
  candidateMedian: number;
  absoluteDelta: number;
  percentageChange: number;
  speedupRatio: number;
}

/**
 * Calculates standard statistical metrics from an array of numeric samples.
 * Array must contain at least 1 sample.
 */
export function calculateStatistics(samples: number[]): BenchmarkStatistics {
  if (!samples || samples.length === 0) {
    throw new Error("Cannot calculate statistics for empty or null samples array");
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;

  const min = sorted[0];
  const max = sorted[n - 1];

  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const mean = Number((sum / n).toFixed(4));

  // Median
  const mid = Math.floor(n / 2);
  const median = n % 2 !== 0 ? sorted[mid] : Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(4));

  // Percentiles (nearest rank method with boundary safety)
  const p95 = calculatePercentile(sorted, 95);
  const p99 = calculatePercentile(sorted, 99);

  return {
    min: Number(min.toFixed(4)),
    max: Number(max.toFixed(4)),
    mean,
    median: Number(median.toFixed(4)),
    p95: Number(p95.toFixed(4)),
    p99: Number(p99.toFixed(4)),
    sampleCount: n,
  };
}

/**
 * Calculates the p-th percentile from an already sorted array using standard nearest-rank interpolation.
 */
export function calculatePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const rank = (p / 100) * (sorted.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const weight = rank - lowerIndex;

  if (lowerIndex === upperIndex) {
    return sorted[lowerIndex];
  }

  return sorted[lowerIndex] * (1 - weight) + sorted[upperIndex] * weight;
}

/**
 * Compares a candidate measurement against a baseline measurement.
 */
export function compareBaselines(baselineMedian: number, candidateMedian: number): DeltaComparison {
  const absoluteDelta = Number((candidateMedian - baselineMedian).toFixed(4));
  const percentageChange = baselineMedian !== 0
    ? Number((((candidateMedian - baselineMedian) / baselineMedian) * 100).toFixed(2))
    : 0;
  const speedupRatio = candidateMedian !== 0
    ? Number((baselineMedian / candidateMedian).toFixed(3))
    : 1.0;

  return {
    baselineMedian,
    candidateMedian,
    absoluteDelta,
    percentageChange,
    speedupRatio,
  };
}
