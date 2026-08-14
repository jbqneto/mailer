type Labels = Record<string, string>;

interface Counter {
  name: string;
  labels: Labels;
  value: number;
}

interface Histogram {
  name: string;
  labels: Labels;
  count: number;
  sum: number;
}

function key(name: string, labels: Labels): string {
  return `${name}|${JSON.stringify(Object.entries(labels).sort())}`;
}

function escapeLabel(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
}

function formatLabels(labels: Labels): string {
  const entries = Object.entries(labels).sort();
  if (entries.length === 0) return '';
  return `{${entries.map(([name, value]) => `${name}="${escapeLabel(value)}"`).join(',')}}`;
}

export class GatewayMetrics {
  private readonly counters = new Map<string, Counter>();
  private readonly histograms = new Map<string, Histogram>();

  increment(name: string, labels: Labels = {}, value = 1): void {
    const metricKey = key(name, labels);
    const existing = this.counters.get(metricKey);
    if (existing) {
      existing.value += value;
      return;
    }
    this.counters.set(metricKey, { name, labels: { ...labels }, value });
  }

  observe(name: string, value: number, labels: Labels = {}): void {
    const metricKey = key(name, labels);
    const existing = this.histograms.get(metricKey);
    if (existing) {
      existing.count += 1;
      existing.sum += value;
      return;
    }
    this.histograms.set(metricKey, { name, labels: { ...labels }, count: 1, sum: value });
  }

  renderPrometheus(): string {
    const lines: string[] = [];
    const counterNames = new Set([...this.counters.values()].map((metric) => metric.name));
    for (const name of counterNames) {
      lines.push(`# TYPE ${name} counter`);
      for (const metric of this.counters.values()) {
        if (metric.name === name) lines.push(`${name}${formatLabels(metric.labels)} ${metric.value}`);
      }
    }

    const histogramNames = new Set([...this.histograms.values()].map((metric) => metric.name));
    for (const name of histogramNames) {
      lines.push(`# TYPE ${name} summary`);
      for (const metric of this.histograms.values()) {
        if (metric.name !== name) continue;
        lines.push(`${name}_count${formatLabels(metric.labels)} ${metric.count}`);
        lines.push(`${name}_sum${formatLabels(metric.labels)} ${metric.sum}`);
      }
    }

    return `${lines.join('\n')}\n`;
  }
}
