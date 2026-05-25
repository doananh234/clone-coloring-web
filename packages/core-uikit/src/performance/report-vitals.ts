import { onCLS, onINP, onLCP, onFCP, onTTFB, type Metric } from "web-vitals";

type VitalsReporter = (metric: Metric) => void;

const defaultReporter: VitalsReporter = (metric) => {
  if ((import.meta as any).env?.DEV) {
    console.log(`[Web Vitals] ${metric.name}: ${Math.round(metric.value)}ms`);
  }
};

export function reportWebVitals(reporter?: VitalsReporter): void {
  const report = reporter ?? defaultReporter;
  onCLS(report);
  onINP(report);
  onLCP(report);
  onFCP(report);
  onTTFB(report);
}
