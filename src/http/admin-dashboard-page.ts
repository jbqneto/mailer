import type { ProjectConfig } from '../domain/project.js';
import type { EmailAccount } from '../domain/smtp-provider.js';
import { SmtpProvider } from '../domain/smtp-provider.js';
import type { GatewayMetrics } from '../observability/metrics.js';
import type { EmailJobQueue } from '../application/email-job-queue.js';

interface AdminDashboardData {
  projects: readonly ProjectConfig[];
  emailAccounts: readonly EmailAccount[];
  accountLinks: readonly { account: EmailAccount; projectIds: readonly string[]; isDefaultFor: readonly string[] }[];
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
      { count: 0, sum: 0 },
    );
}

function getProviderOptions(): string {
  return Object.values(SmtpProvider).map((p) => `<option value="${p}">${p}</option>`).join('');
}

export function adminDashboardPage(data: AdminDashboardData): string {
  const { projects, emailAccounts, accountLinks, metrics, emailQueue } = data;

  const projectRows = projects.map((project) => {
    const accounts = emailAccounts.filter(
      (acc) => acc.id.startsWith(`test-account-${project.id}`) || acc.id.startsWith(`dev-account-${project.id}`),
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

  const accountRows = accountLinks.map(({ account, projectIds, isDefaultFor }) => `
    <tr data-account-id="${account.id}">
      <td><code>${account.id}</code></td>
      <td>${account.name}</td>
      <td>${account.email}</td>
      <td>${account.provider}</td>
      <td><span class="badge ${account.active ? 'badge-active' : 'badge-inactive'}">${account.active ? 'Active' : 'Inactive'}</span></td>
      <td>${projectIds.length > 0 ? projectIds.map((pid) => `<code>${pid}${isDefaultFor.includes(pid) ? ' ⭐' : ''}</code>`).join(', ') : '—'}</td>
      <td>
        <button class="btn-icon" onclick="openEditModal('${account.id}')" title="Edit">✎</button>
        <button class="btn-icon danger" onclick="confirmDelete('${account.id}')" title="Delete">✕</button>
      </td>
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

  const projectOptions = projects.map((p) => `<option value="${p.id}">${p.id} (${p.fromEmail})</option>`).join('');

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
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .card-header h2 { margin: 0; }
    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid #dce2eb; border-radius: 8px; background: #fff; color: #172033; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; }
    .btn:hover { background: #f8fafc; border-color: #c8d0da; }
    .btn-primary { background: #356ee8; border-color: #356ee8; color: #fff; }
    .btn-primary:hover { background: #2a5ccf; border-color: #2a5ccf; }
    .btn-icon { background: transparent; border: 1px solid #dce2eb; border-radius: 6px; padding: 6px 8px; cursor: pointer; font-size: 14px; }
    .btn-icon:hover { background: #f1f4f8; }
    .btn-icon.danger { color: #b42318; border-color: #fda8a8; }
    .btn-icon.danger:hover { background: #fdeaea; }
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
    /* Modal styles */
    .modal-overlay { position: fixed; inset: 0; background: rgba(23,32,51,0.5); display: none; align-items: center; justify-content: center; z-index: 100; padding: 20px; }
    .modal-overlay.open { display: flex; }
    .modal { background: #fff; border-radius: 12px; box-shadow: 0 20px 40px #17203333; width: 100%; max-width: 480px; max-height: 90vh; overflow-y: auto; }
    .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #e6eaf0; }
    .modal-header h3 { margin: 0; font-size: 16px; }
    .modal-close { background: transparent; border: none; font-size: 20px; cursor: pointer; color: #68758a; padding: 4px; }
    .modal-body { padding: 20px; }
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-size: 12px; font-weight: 600; color: #36445d; margin-bottom: 6px; }
    .form-group input, .form-group select { width: 100%; padding: 10px 12px; border: 1px solid #dce2eb; border-radius: 8px; font-size: 13px; background: #fff; color: #172033; }
    .form-group input:focus, .form-group select:focus { outline: none; border-color: #356ee8; box-shadow: 0 0 0 3px #356ee833; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; padding-top: 16px; border-top: 1px solid #e6eaf0; }
    .link-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
    .link-row select { flex: 1; }
    .linked-projects { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .linked-project { display: inline-flex; align-items: center; gap: 6px; background: #f1f4f8; border-radius: 6px; padding: 4px 10px; font-size: 12px; }
    .linked-project.default { background: #fff4e6; color: #b45309; }
    .linked-project button { background: transparent; border: none; color: #68758a; cursor: pointer; padding: 0 4px; font-size: 14px; }
    .linked-project button:hover { color: #b42318; }
    @media (max-width: 640px) {
      header { flex-direction: column; align-items: flex-start; gap: 12px; }
      main { grid-template-columns: 1fr; }
      .form-row { grid-template-columns: 1fr; }
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
      <div class="card-header">
        <h2>Email Accounts</h2>
        <button class="btn btn-primary" onclick="openCreateModal()">+ Add Email Account</button>
      </div>
      ${accountLinks.length === 0 ? '<p class="empty">No email accounts configured</p>' : `
      <table>
        <thead>
          <tr><th>ID</th><th>Name</th><th>Email</th><th>Provider</th><th>Status</th><th>Linked Projects</th><th>Actions</th></tr>
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

  <!-- Create/Edit Modal -->
  <div class="modal-overlay" id="accountModal">
    <div class="modal">
      <div class="modal-header">
        <h3 id="modalTitle">Add Email Account</h3>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <div class="modal-body">
        <form id="accountForm">
          <input type="hidden" name="id" id="accountId">
          <div class="form-group">
            <label for="name">Name</label>
            <input type="text" name="name" id="name" required maxlength="120" placeholder="e.g., bloom-production">
          </div>
          <div class="form-group">
            <label for="email">Email Address</label>
            <input type="email" name="email" id="email" required placeholder="sender@domain.com">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="provider">Provider</label>
              <select name="provider" id="provider" required>
                ${getProviderOptions()}
              </select>
            </div>
            <div class="form-group">
              <label for="active">Status</label>
              <select name="active" id="active">
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label for="username">SMTP Username</label>
            <input type="text" name="username" id="username" required placeholder="SMTP username">
          </div>
          <div class="form-group">
            <label for="password">SMTP Password</label>
            <input type="password" name="password" id="password" required placeholder="SMTP password" autocomplete="new-password">
          </div>
          <div class="form-actions">
            <button type="button" class="btn" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="submitBtn">Save</button>
          </div>
        </form>
        <div id="linkSection" style="display:none; margin-top:20px; padding-top:16px; border-top:1px solid #e6eaf0;">
          <h4 style="margin:0 0 12px; font-size:14px;">Project Links</h4>
          <div id="linkedProjects"></div>
          <div class="link-row">
            <select id="linkProjectSelect">
              <option value="">-- Select Project --</option>
              ${projectOptions}
            </select>
            <label style="font-size:12px; display:flex; align-items:center; gap:4px; white-space:nowrap;">
              <input type="checkbox" id="linkIsDefault"> Default
            </label>
            <button type="button" class="btn btn-primary" style="padding:8px 12px; font-size:12px;" onclick="addProjectLink()">Link</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const providerOptions = ${JSON.stringify(Object.values(SmtpProvider))};
    const projectsData = ${JSON.stringify(projects.map(p => ({ id: p.id, fromEmail: p.fromEmail })))};

    function openCreateModal() {
      document.getElementById('modalTitle').textContent = 'Add Email Account';
      document.getElementById('accountForm').reset();
      document.getElementById('accountId').value = '';
      document.getElementById('password').required = true;
      document.getElementById('linkSection').style.display = 'none';
      document.getElementById('submitBtn').textContent = 'Create';
      document.getElementById('accountModal').classList.add('open');
    }

    async function openEditModal(accountId) {
      document.getElementById('modalTitle').textContent = 'Edit Email Account';
      document.getElementById('password').required = false;
      document.getElementById('linkSection').style.display = 'block';
      document.getElementById('submitBtn').textContent = 'Save';

      const res = await fetch('/admin/email-accounts/' + accountId, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) return alert('Failed to load account');
      const account = await res.json();

      document.getElementById('accountId').value = account.id;
      document.getElementById('name').value = account.name;
      document.getElementById('email').value = account.email;
      document.getElementById('provider').value = account.provider;
      document.getElementById('active').value = account.active.toString();
      document.getElementById('username').value = account.credentials?.username || '';
      document.getElementById('password').value = '';

      await loadLinkedProjects(account.id);
      document.getElementById('accountModal').classList.add('open');
    }

    async function loadLinkedProjects(accountId) {
      const res = await fetch('/admin/email-accounts', { headers: { 'Accept': 'application/json' } });
      if (!res.ok) return;
      const { data } = await res.json();
      const accountData = data.find(a => a.account.id === accountId);
      if (!accountData) return;

      const container = document.getElementById('linkedProjects');
      if (accountData.projectIds.length === 0) {
        container.innerHTML = '<p style="color:#68758a; font-size:13px;">No linked projects</p>';
        return;
      }
      container.innerHTML = accountData.projectIds.map((pid) => {
        const isDefault = accountData.isDefaultFor.includes(pid);
        return '<span class="linked-project' + (isDefault ? ' default' : '') + '">' +
          pid + (isDefault ? ' ⭐' : '') +
          '<button onclick="unlinkProject(\'' + accountId + '\', \'' + pid + '\')" title="Unlink">✕</button>' +
        '</span>';
      }).join('') + (accountData.projectIds.some((pid) => !accountData.isDefaultFor.includes(pid)) ?
        '<div style="margin-top:8px;"><button type="button" class="btn" style="font-size:12px;" onclick="setDefaultProject(\'' + accountId + '\')">Set Default for a Project</button></div>'
        : '');
    }

    function closeModal() {
      document.getElementById('accountModal').classList.remove('open');
    }

    async function addProjectLink() {
      const accountId = document.getElementById('accountId').value;
      const projectId = document.getElementById('linkProjectSelect').value;
      const isDefault = document.getElementById('linkIsDefault').checked;
      if (!projectId) return alert('Select a project');

      const res = await fetch('/admin/email-accounts/' + accountId + '/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, isDefault })
      });
      if (!res.ok) {
        const err = await res.json();
        return alert(err.message || 'Failed to link project');
      }
      document.getElementById('linkProjectSelect').value = '';
      document.getElementById('linkIsDefault').checked = false;
      await loadLinkedProjects(accountId);
    }

    async function unlinkProject(accountId, projectId) {
      if (!confirm('Unlink this project?')) return;
      const res = await fetch('/admin/email-accounts/' + accountId + '/projects/' + projectId, { method: 'DELETE' });
      if (!res.ok) return alert('Failed to unlink');
      await loadLinkedProjects(accountId);
    }

    async function setDefaultProject(accountId) {
      const projectId = prompt('Enter project ID to set as default:');
      if (!projectId) return;
      const res = await fetch('/admin/email-accounts/' + accountId + '/projects/' + projectId, { method: 'PATCH' });
      if (!res.ok) return alert('Failed to set default');
      await loadLinkedProjects(accountId);
    }

    async function confirmDelete(accountId) {
      if (!confirm('Delete this email account? This cannot be undone.')) return;
      const res = await fetch('/admin/email-accounts/' + accountId, { method: 'DELETE' });
      if (!res.ok) return alert('Failed to delete');
      window.location.reload();
    }

    document.getElementById('accountForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const accountId = document.getElementById('accountId').value;
      const isEdit = !!accountId;

      const body = {
        name: form.name.value,
        email: form.email.value,
        provider: form.provider.value,
        credentials: {
          username: form.username.value,
          password: form.password.value
        },
        active: form.active.value === 'true'
      };

      const url = isEdit ? '/admin/email-accounts/' + accountId : '/admin/email-accounts';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const err = await res.json();
        return alert(err.message || 'Failed to save');
      }

      closeModal();
      window.location.reload();
    });

    // Close modal on overlay click
    document.getElementById('accountModal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    // Auto-refresh
    setTimeout(() => window.location.reload(), 30000);
  </script>
</body>
</html>`;
}