export const generatePremiumPDFHtml = (
  run: any, 
  metrics: any, 
  cloneHtml: string
) => {
  const date = new Date().toLocaleString();
  const title = run.repo_url === 'Code Snippet Debugging' ? 'Snippet Diagnostic Report' : 'Repository Audit Report';
  
  // Extract just the markdown prose content from the clone
  const parser = new DOMParser();
  const doc = parser.parseFromString(cloneHtml, 'text/html');
  const proseElement = doc.querySelector('.prose-report-classic');
  let proseHtml = proseElement ? proseElement.innerHTML : '';

  // Clean up any stray buttons (like "Copy" buttons in code blocks) that might have survived
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = proseHtml;
  tempDiv.querySelectorAll('button').forEach(b => b.remove());
  
  proseHtml = tempDiv.innerHTML;

  let metricsHtml = '';
  if (metrics) {
    if (metrics.type === 'snippet') {
      metricsHtml = `
        <div class="metrics-grid">
          <div class="metric-card metric-error">
            <div class="label">Error Type</div>
            <div class="value">${metrics.errorType}</div>
          </div>
          <div class="metric-card metric-warning">
            <div class="label">Line Number</div>
            <div class="value">${metrics.errorLine}</div>
          </div>
          <div class="metric-card metric-success">
            <div class="label">Diagnostic Result</div>
            <div class="value">${metrics.hasFix ? 'Fixed' : 'Analyzed'}</div>
          </div>
        </div>
      `;
    } else {
      metricsHtml = `
        <div class="metrics-grid">
          <div class="metric-card metric-info">
            <div class="label">Execution Time</div>
            <div class="value">${metrics.duration}s</div>
          </div>
          <div class="metric-card metric-warning">
            <div class="label">Framework Signature</div>
            <div class="value">${metrics.framework}</div>
          </div>
          <div class="metric-card ${run.status === 'COMPLETED' ? 'metric-success' : 'metric-error'}">
            <div class="label">Status</div>
            <div class="value">${run.status === 'COMPLETED' ? 'Success' : run.status}</div>
          </div>
        </div>
      `;
    }
  }

  let testCodeHtml = '';
  if (run.test_code) {
    testCodeHtml = `
      <div class="report-content playwright-block">
        <h2>Playwright Test Suite</h2>
        <pre><code>${run.test_code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
      <style>
        :root {
          --bg-color: #f8fafc; /* light gray background */
          --text-main: #0f172a;
          --text-muted: #64748b;
          --border-color: #e2e8f0;
          --card-bg: #ffffff;
          
          --primary: #4f46e5; /* Indigo */
          --success: #10b981; /* Emerald */
          --error: #ef4444;   /* Red */
          --warning: #f59e0b; /* Amber */
          --info: #3b82f6;    /* Blue */
        }

        @page {
          margin: 15mm;
          @bottom-right {
            content: "Page " counter(page) " of " counter(pages);
            font-family: 'Inter', sans-serif;
            font-size: 10px;
            color: #94a3b8;
          }
        }

        * {
          box-sizing: border-box;
        }

        body { 
          font-family: 'Inter', system-ui, -apple-system, sans-serif; 
          background-color: var(--bg-color); 
          color: var(--text-main); 
          line-height: 1.6;
          margin: 0;
          padding: 0;
          font-size: 12px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        /* Prevent page breaks inside cards and code blocks */
        .metric-card, pre, h2, h3, .card-section {
          page-break-inside: avoid;
          break-inside: avoid;
        }

        /* HEADER */
        .pdf-header {
          border-bottom: 2px solid var(--primary);
          padding-bottom: 16px;
          margin-bottom: 24px;
        }
        .pdf-header h1 {
          font-size: 26px;
          font-weight: 800;
          color: #0f172a;
          margin: 0 0 8px 0;
          letter-spacing: -0.02em;
        }
        .pdf-header .meta {
          color: var(--text-muted);
          font-size: 11px;
          display: flex;
          justify-content: space-between;
          font-weight: 500;
        }
        .meta-target {
          color: var(--primary);
          font-weight: 600;
        }

        /* METRICS GRID */
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 32px;
        }
        .metric-card {
          background: var(--card-bg);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          padding: 16px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.02);
        }
        .metric-card .label {
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
          font-weight: 700;
          margin-bottom: 6px;
        }
        .metric-card .value {
          font-size: 15px;
          font-weight: 800;
        }
        .metric-error { border-left: 4px solid var(--error); }
        .metric-error .value { color: var(--error); }
        .metric-warning { border-left: 4px solid var(--warning); }
        .metric-warning .value { color: var(--warning); }
        .metric-success { border-left: 4px solid var(--success); }
        .metric-success .value { color: var(--success); }
        .metric-info { border-left: 4px solid var(--info); }
        .metric-info .value { color: var(--info); }

        /* CONTENT STYLING */
        .report-content {
          background: var(--card-bg);
          border: 1px solid var(--border-color);
          border-radius: 10px;
          padding: 32px;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
          margin-bottom: 32px;
        }
        
        .report-content h1 { display: none; } /* Hide duplicate markdown H1 */
        
        .report-content h2, 
        .report-content h3 {
          font-size: 15px;
          color: var(--primary);
          font-weight: 700;
          margin-top: 32px;
          margin-bottom: 12px;
          padding-bottom: 8px;
          border-bottom: 1px solid #f1f5f9;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        /* Remove the dark-mode specific spans from H3s that were cloned */
        .report-content h3 span {
          color: inherit !important;
          background: none !important;
          border: none !important;
          box-shadow: none !important;
          text-shadow: none !important;
          display: inline !important;
          width: auto !important;
          height: auto !important;
        }
        
        /* Special handling for "Corrected Solution" */
        .report-content div.flex.items-center.gap-2 {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 32px;
          margin-bottom: 12px;
        }
        .report-content div.flex.items-center.gap-2 span {
          font-size: 15px !important;
          color: var(--success) !important;
          font-weight: 700 !important;
          text-transform: uppercase;
          letter-spacing: 0.03em !important;
        }
        .report-content div.flex.items-center.gap-2 div {
          background-color: var(--success) !important;
          box-shadow: none !important;
          width: 8px !important;
          height: 8px !important;
          border-radius: 50%;
        }

        .report-content p {
          margin-bottom: 16px;
          color: #334155;
        }

        .report-content ul {
          margin-left: 20px;
          margin-bottom: 24px;
          color: #334155;
          padding-left: 0;
        }
        .report-content li {
          margin-bottom: 8px;
        }

        /* BADGES */
        .report-content strong {
          background: #eff6ff;
          color: #1d4ed8;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 600;
          font-size: 11px;
        }

        /* CODE BLOCKS - PREMIUM DARK THEME */
        .report-content pre, .playwright-block pre {
          background: #0d1117 !important;
          color: #c9d1d9 !important;
          padding: 20px;
          border-radius: 8px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          line-height: 1.6;
          overflow-x: hidden;
          white-space: pre-wrap;
          word-wrap: break-word;
          border: 1px solid #30363d;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05);
          margin: 16px 0 24px 0;
        }
        
        /* The syntax highlighter wraps code inside divs, strip their bg */
        .report-content pre div {
          background: transparent !important;
          margin: 0 !important;
          padding: 0 !important;
        }

        .report-content code {
          background: #f1f5f9;
          color: #be123c;
          padding: 2px 6px;
          border-radius: 4px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
        }
        
        pre code {
          background: transparent;
          color: inherit;
          padding: 0;
        }
        
        /* Remove the custom UI elements around code blocks from the clone */
        .rounded-xl.overflow-hidden.my-6 {
          border: none !important;
          background: none !important;
          box-shadow: none !important;
          margin: 0 !important;
        }
        .px-5.py-3\\.5.flex {
          display: none !important; /* Hide the top bar of code blocks */
        }

        /* FOOTER */
        .pdf-footer {
          margin-top: 40px;
          padding-top: 16px;
          border-top: 1px solid var(--border-color);
          font-size: 9px;
          color: var(--text-muted);
          display: flex;
          justify-content: space-between;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
      </style>
    </head>
    <body>
      <div class="pdf-header">
        <h1>${title}</h1>
        <div class="meta">
          <span>Target: <span class="meta-target">${run.repo_url}</span></span>
          <span>${date}</span>
        </div>
      </div>

      ${metricsHtml}

      <div class="report-content">
        ${proseHtml}
      </div>

      ${testCodeHtml}

      <div class="pdf-footer">
        <span>Generated by AI QA Engineer</span>
        <span>Premium Audit Report</span>
      </div>
    </body>
    </html>
  `;
};
