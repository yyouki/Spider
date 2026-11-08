import { useMemo } from "react";

export type DailyTokenUsage = {
  day: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type RecentTokenUsage = {
  createdAt: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type TokenUsageSummary = {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latestAt: string | null;
  source: string;
  daily: DailyTokenUsage[];
  recent: RecentTokenUsage[];
};

export type WorkspaceFileMetadata = {
  path: string;
  language: string;
  sizeBytes: number;
  updatedAt: number;
};

function number(value: number | undefined): string {
  return (value ?? 0).toLocaleString();
}

function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function shortDate(day: string): string {
  const value = new Date(day + "T00:00:00Z");
  return value.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function AnalyticsPage({
  usage,
  files
}: {
  usage: TokenUsageSummary | null;
  files: WorkspaceFileMetadata[];
}) {
  const projectBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  const projectEstimate = Math.ceil(projectBytes / 4);
  const average = usage?.requests ? Math.round(usage.totalTokens / usage.requests) : 0;
  const inputShare = usage?.totalTokens ? Math.round(usage.inputTokens / usage.totalTokens * 100) : 0;
  const outputShare = usage?.totalTokens ? 100 - inputShare : 0;
  const maxDaily = Math.max(1, ...(usage?.daily ?? []).map((item) => item.totalTokens));

  const chartDays = useMemo(() => {
    const map = new Map((usage?.daily ?? []).map((item) => [item.day, item]));
    const now = new Date();
    return Array.from({ length: 14 }, (_, index) => {
      const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (13 - index)));
      const key = day.toISOString().slice(0, 10);
      return map.get(key) ?? {
        day: key,
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0
      };
    });
  }, [usage?.daily]);

  return (
    <main className="page-container analytics-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKSPACE INSIGHTS</p>
          <h1>Usage analytics</h1>
          <p>Actual model usage and clearly separated workspace estimates.</p>
        </div>
        <div className="page-heading-meta">
          <span className="live-indicator"><i /> Provider data</span>
          <span className="muted-meta">Updated {usage?.latestAt ? new Date(usage.latestAt).toLocaleString() : "when available"}</span>
        </div>
      </div>

      <section className="metric-grid" aria-label="Token usage summary">
        <article className="metric-card metric-primary">
          <span className="metric-label">TOTAL TOKENS</span>
          <strong>{usage ? number(usage.totalTokens) : "—"}</strong>
          <small>Provider-reported · recent 200 responses</small>
          <div className="metric-accent-line" />
        </article>
        <article className="metric-card">
          <span className="metric-label">INPUT TOKENS</span>
          <strong>{usage ? number(usage.inputTokens) : "—"}</strong>
          <small>Prompt and conversation context</small>
        </article>
        <article className="metric-card">
          <span className="metric-label">OUTPUT TOKENS</span>
          <strong>{usage ? number(usage.outputTokens) : "—"}</strong>
          <small>Generated model responses</small>
        </article>
        <article className="metric-card">
          <span className="metric-label">MODEL RESPONSES</span>
          <strong>{usage ? number(usage.requests) : "—"}</strong>
          <small>Average {usage ? number(average) : "—"} tokens per response</small>
        </article>
      </section>

      <div className="analytics-grid">
        <section className="surface-card usage-chart-card">
          <div className="card-heading">
            <div>
              <h2>Token activity</h2>
              <p>Daily totals from retained provider usage records.</p>
            </div>
            <span className="period-pill">Last 14 days · UTC</span>
          </div>
          <div className="chart-legend">
            <span><i className="legend-input" /> Input</span>
            <span><i className="legend-output" /> Output</span>
          </div>
          <div className="usage-chart" role="img" aria-label="Stacked daily chart of input and output tokens over the last fourteen days">
            {chartDays.map((day) => {
              const totalHeight = day.totalTokens ? Math.max(3, day.totalTokens / maxDaily * 100) : 0;
              const inputHeight = day.totalTokens ? day.inputTokens / day.totalTokens * 100 : 0;
              const outputHeight = day.totalTokens ? day.outputTokens / day.totalTokens * 100 : 0;
              return (
                <div className="chart-column" key={day.day} title={`${day.day}: ${number(day.totalTokens)} tokens · ${day.requests} responses`}>
                  <div className="chart-track">
                    <div className="chart-stack" style={{ height: `${totalHeight}%` }}>
                      <span className="chart-input" style={{ height: `${inputHeight}%` }} />
                      <span className="chart-output" style={{ height: `${outputHeight}%` }} />
                    </div>
                  </div>
                  <span className="chart-day">{shortDate(day.day)}</span>
                </div>
              );
            })}
          </div>
          {!usage?.requests && (
            <div className="chart-empty">Usage will appear here after Spider receives provider token metadata.</div>
          )}
          <div className="chart-footnote">The database retains at most 200 provider-reported responses. Missing provider metadata is not counted.</div>
        </section>

        <section className="surface-card composition-card">
          <div className="card-heading">
            <div>
              <h2>Usage composition</h2>
              <p>Input compared with generated output.</p>
            </div>
          </div>
          <div className="composition-total">
            <strong>{usage ? number(usage.totalTokens) : "—"}</strong>
            <span>tokens recorded</span>
          </div>
          <div className="composition-bar" aria-label={`${inputShare}% input and ${outputShare}% output`}>
            <span className="composition-input" style={{ width: `${inputShare}%` }} />
            <span className="composition-output" style={{ width: `${outputShare}%` }} />
          </div>
          <div className="composition-row">
            <span><i className="legend-input" /> Input</span>
            <strong>{usage ? number(usage.inputTokens) : "—"} <small>{inputShare}%</small></strong>
          </div>
          <div className="composition-row">
            <span><i className="legend-output" /> Output</span>
            <strong>{usage ? number(usage.outputTokens) : "—"} <small>{outputShare}%</small></strong>
          </div>
          <div className="composition-divider" />
          <div className="model-detail">
            <span>Active model</span>
            <strong>GLM-4.7-Flash</strong>
            <small>Cloudflare Workers AI</small>
          </div>
        </section>
      </div>

      <section className="surface-card recent-card">
        <div className="card-heading">
          <div>
            <h2>Recent model activity</h2>
            <p>Latest provider-reported responses retained by Spider.</p>
          </div>
          <span className="period-pill">{usage?.recent.length ?? 0} records</span>
        </div>
        <div className="usage-table-wrap">
          <table className="usage-table">
            <thead><tr><th>TIME</th><th>INPUT</th><th>OUTPUT</th><th className="align-right">TOTAL</th></tr></thead>
            <tbody>
              {(usage?.recent ?? []).map((item, index) => (
                <tr key={item.createdAt + "-" + index}>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                  <td>{number(item.inputTokens)}</td>
                  <td>{number(item.outputTokens)}</td>
                  <td className="align-right">{number(item.totalTokens)}</td>
                </tr>
              ))}
              {!usage?.recent.length && <tr><td colSpan={4} className="table-empty">No provider usage records available yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface-card workspace-usage-card">
        <div className="workspace-usage-copy">
          <div>
            <p className="eyebrow">PROJECT STORAGE</p>
            <h2>Workspace footprint</h2>
            <p>File-size estimate only. This is not model token consumption.</p>
          </div>
          <strong>{bytes(projectBytes)}</strong>
        </div>
        <div className="workspace-usage-stats">
          <div><strong>{number(files.length)}</strong><span>Files</span></div>
          <div><strong>{number(projectEstimate)}</strong><span>Estimated tokens · UTF-8 bytes ÷ 4</span></div>
          <div><strong>{bytes(2 * 1024 * 1024 - projectBytes)}</strong><span>Approximate remaining of 2 MB limit</span></div>
        </div>
      </section>

      <p className="analytics-disclaimer">
        Token values are actual only when returned by the model provider. Spider stores at most 200 such responses. Workspace estimates use file byte size divided by four and are not exact tokenizer counts. Exact monetary cost and account-wide Cloudflare neuron usage are not exposed by this workspace view.
      </p>
    </main>
  );
}
