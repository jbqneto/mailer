import type { ProjectConfig } from '../domain/project.js';
import type { EmailAccount } from '../domain/smtp-provider.js';
import type { GatewayMetrics } from '../observability/metrics.js';
import type { EmailJobQueue } from '../application/email-job-queue.js';

interface AdminDashboardData {
  projects: readonly ProjectConfig[];
  emailAccounts: readonly EmailAccount[];
  metrics: GatewayMetrics;
  emailQueue: EmailJobQueue | undefined;
}

function sumCountersByPrefix(counters: Record<string, number>, prefix: string): number {
  return Object.entries(counters)
    .filter(([key]) => key.startsWith(prefix + '|'))
    .reduce((sum, [, value]) => sum + value, 0);
}

function sumHistogramsByPrefix(histograms: Record<string, { count: number; sum: number }>, prefix: string): { count: number; sum: number } {
  return Object.entries(histograms)
    .filter(([key]) => key.startsWith(prefix + '|'))
    .reduce(
      (acc, [, value]) => ({ count: acc.count + value.count, sum: acc.sum + value.sum }),
      { count: 0, sum: 0 }
    );
}

export function adminDashboardPage(data: AdminDashboardData): string {
  const { projects, emailAccounts, metrics, emailQueue } = data;

  const projectRows = projects.map((project) => {
    const accounts = emailAccounts.filter(
      (acc) => acc.id.startsWith(`test-account-${project.id}`) || acc.id.startsWith(`dev-account-${project.id}`)
    );
    const activeAccounts = accounts.filter((a) => a.active).length;
    return `
      <tr>
        <td><code>${project.id}</code></td>
        <td>${project.fromName} <${project.fromEmail}></td>
        <td>${project.allowedTemplates.join(', ') || '—'}</td>
        <td>${accounts.length} (${activeAccounts} active)</td>
        <td>${project.replyTo ?? '—'}</td>
      </tr>
    `;
  }).join('');

  const accountRows = emailAccounts.map((account) => `
    <tr>
      <td><code>${account.id}</code></td>
      <td>${account.name}</td>
      <td>${account.email}</td>
      <td>${account.provider}</td>
      <td><span class="${account.active ? 'badge-active' : 'badge-inactive'}">${account.active ? 'Active' : 'Inactive'}</span></td>
    </tr>
  `).join('');

  const metricsSnapshot = metrics.snapshot();
  const totalRequests = sumCountersByPrefix(metricsSnapshot.counters, 'email_gateway_http_requests_total');
  const totalDeliveries = sumCountersByPrefix(metricsSnapshot.counters, 'email_gateway_deliveries_total');
  const acceptedDeliveries = sumCountersByPrefix(metricsSnapshot.counters, 'email_gateway_deliveries_total|{"status":"accepted"');
  const failedDeliveries = sumCountersByPrefix(metricsSnapshot.counters, 'email_gateway_deliveries_total|{"status":"failed"');
  const queuedDeliveries = sumCountersByPrefix(metricsSnapshot.counters, 'email_gateway_deliveries_total|{"status":"queued"');
  const processingDeliveries = sumCountersByPrefix(metricsSnapshot.counters, 'email_gateway_deliveries_total|{"status":"processing"');
  const duplicateDeliveries = sumCountersByPrefix(metricsSnapshot.counters, 'email_gateway_deliveries_total|{"status":"duplicate"');

  const durationData = sumHistogramsByPrefix(metricsSnapshot.histograms, 'email_gateway_http_request_duration_ms');
  const avgDuration = durationData.count > 0 ? (durationData.sum / durationData.count).toFixed(2) : '0';

  const queueStatus = emailQueue ? 'Active' : 'Not configured';
  const queueType = emailQueue?.constructor.name || '—';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Email Gateway · Admin Dashboard</title>
  <style>
    :root { font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #172033; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #eef1f5; min-height: 100vh; }
    header { display: flex; justify-content: space-between; align-items: center; gap: 16px; background: #172033; color: #fff; padding: 18px 28px; position: sticky; top: 0; z-index: 10; }
    header h1 { margin: 0; font-size: 20px; }
    header a { color: #b9c3d4; text-decoration: none; font-size: 13px; }
    header a:hover { color: #fff; }
    main { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; padding: 22px; }
    .card { background: #fff; border: 1px solid #dce2eb; border-radius: 12px; box-shadow: 0 6px 24px #1720330d; padding: 20px; }
    .card h2 { margin: 0 0 16px; font-size: 16px; display: flex; align-items: center; gap: 8px; }
    .card h2::before { content: ''; width: 4px; height: 20px; background: #356ee8; border-radius: 2px; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .stat { background: #f8fafc; border: 1px solid #e6eaf0; border-radius: 8px; padding: 14px; text-align: center; }
    .stat-value { font-size: 28px; font-weight: 700; color: #172033; line-height: 1.2; }
    .stat-label { font-size: 11px; color: #68758a; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
    .stat-success { color: #16794c; }
    .stat-warning { color: #b45309; }
    .stat-error { color: #b42318; }
    .stat-info { color: #356ee8; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-top: 1px solid #e6eaf0; text-align: left; padding: 10px 8px; vertical-align: top; }
    th { color: #68758a; font-size: 11px; text-transform: uppercase; font-weight: 700; }
    td { color: #36445d; }
    tr:hover td { background: #fafbfc; }
    code { background: #f1f4f8; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
    .badge-active { background: #e6f7ee; color: #16794c; }
    .badge-inactive { background: #fef3e2; color: #b45309; }
    .badge-queued { background: #eef3ff; color: #356ee8; }
    .badge-processing { background: #fff4e6; color: #b45309; }
    .badge-failed { background: #fdeaea; color: #b42318; }
    .badge-accepted { background: #e6f7ee; color: #16794c; }
    .badge-duplicate { background: #f1f4f8; color: #526078; }
    .empty { color: #68758a; font-style: italic; text-align: center; padding: 24px; }
    .section { margin-bottom: 24px; }
    .section:last-child { margin-bottom: 0; }
    .queue-info { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
    .queue-info .item { background: #f8fafc; border: 1px solid #e6eaf0; border-radius: 8px; padding: 12px; }
    .queue-info .label { font-size: 11px; color: #68758a; text-transform: uppercase; }
    .queue-info .value { font-size: 14px; font-weight: 600; color: #172033; margin-top: 4px; }
    @media (max-width: 640px) {
      header { flex-direction: column; align-items: flex-start; gap: 12px; }
      main { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Email Gateway · Admin Dashboard</h1>
    <nav style="display: flex; gap: 16px;">
      <a href="/preview">Template Preview</a>
      <form action="/admin/logout" method="POST" style="margin: 0;">
        <button type="submit" style="background: transparent; border: 1px solid #71809a; color: #fff; padding: 7px 12px; border-radius: 6px; font-size: 12px; cursor: pointer;">Sign out</button>
      </form>
    </nav>
  </header>
  <main>
    <section class="card">
      <h2>Overview</h2>
      <div class="stat-grid">
        <div class="stat">
          <div class="stat-value stat-info">${totalRequests}</div>
          <div class="stat-label">HTTP Requests</div>
        </div>
        <div class="stat">
          <div class="stat-value stat-info">${totalDeliveries}</div>
          <div class="stat-label">Total Deliveries</div>
        </div>
        <div class="stat">
          <div class="stat-value stat-success">${acceptedDeliveries}</div>
          <div class="stat-label">Accepted</div>
        </div>
        <div class="stat">
          <div class="stat-value stat-warning">${queuedDeliveries + processingDeliveries}</div>
          <div class="stat-label">Queued / Processing</div>
        </div>
        <div class="stat">
          <div class="stat-value stat-error">${failedDeliveries}</div>
          <div class="stat-label">Failed</div>
        </div>
        <div class="stat">
          <div class="stat-value">${duplicateDeliveries}</div>
          <div class="stat-label">Duplicates</div>
        </div>
        <div class="stat">
          <div class="stat-value stat-info">${avgDuration} ms</div>
          <div class="stat-label">Avg Response Time</div>
        </div>
        <div class="stat">
          <div class="stat-value">${projects.length}</div>
          <div class="stat-label">Projects</div>
        </div>
        <div class="stat">
          <div class="stat-value">${emailAccounts.length}</div>
          <div class="stat-label">Email Accounts</div>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>Projects</h2>
      ${projects.length === 0 ? '<p class="empty">No projects configured</p>' : `
      <table>
        <thead>
          <tr><th>ID</th><th>From</th><th>Allowed Templates</th><th>Accounts</th><th>Reply-To</th></tr>
        </thead>
        <tbody>
          ${projectRows}
        </tbody>
      </table>
      `}
    </section>

    <section class="card">
      <h2>Email Accounts</h2>
      ${emailAccounts.length === 0 ? '<p class="empty">No email accounts configured</p>' : `
      <table>
        <thead>
          <tr><th>ID</th><th>Name</th><th>Email</th><th>Provider</th><th>Status</th></tr>
        </thead>
        <tbody>
          ${accountRows}
        </tbody>
      </table>
      `}
    </section>

    <section class="card">
      <h2>Queue Status</h2>
      <div class="queue-info">
        <div class="item">
          <div class="label">Queue Type</div>
          <div class="value">${queueType}</div>
        </div>
        <div class="item">
          <div class="label">Status</div>
          <div class="value"><span class="badge ${emailQueue ? 'badge-active' : 'badge-inactive'}">${queueStatus}</span></div>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>Delivery Status Breakdown</h2>
      <table>
        <thead>
          <tr><th>Status</th><th>Count</th></tr>
        </thead>
        <tbody>
          <tr><td><span class="badge badge-accepted">accepted</span></td><td>${acceptedDeliveries}</td></tr>
          <tr><td><span class="badge badge-queued">queued</span></td><td>${queuedDeliveries}</td></tr>
          <tr><td><span class="badge badge-processing">processing</span></td><td>${processingDeliveries}</td></tr>
          <tr><td><span class="badge badge-error">failed</span></td><td>${failedDeliveries}</td></tr>
          <tr><td><span class="badge badge-duplicate">duplicate</span></td><td>${duplicateDeliveries}</td></tr>
        </tbody>
      </table>
    </section>
  </main>
  <script>
    setTimeout(() => window.location.reload(), 30000);
  </script>
</body>
</html>`;
}