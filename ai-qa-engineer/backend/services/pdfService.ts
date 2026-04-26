import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { marked } from 'marked';
import { AnalysisRecord } from './database';

export async function generateAnalysisPDF(run: AnalysisRecord) {
    const date = new Date(run.created_at).toLocaleString();
    const title = run.repo_url === 'Code Snippet Debugging' ? 'Snippet Diagnostic Report' : 'Repository Audit Report';
    
    // Parse markdown to HTML
    let proseHtml = marked.parse(run.playwright_output || '');
    
    // Simple metrics parsing logic for the PDF
    let metricsHtml = '';
    const metrics = parseMetrics(run);
    
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
                <pre><code>${escapeHtml(run.test_code)}</code></pre>
            </div>
        `;
    }

    let cicdCodeHtml = '';
    if (run.cicd_code) {
        cicdCodeHtml = `
            <div class="report-content playwright-block">
                <h2>CI/CD Pipeline Configuration</h2>
                <pre><code>${escapeHtml(run.cicd_code)}</code></pre>
            </div>
        `;
    }

    const fullHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="utf-8">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
        <style>
            :root {
                --bg-color: #f8fafc;
                --text-main: #0f172a;
                --text-muted: #64748b;
                --border-color: #e2e8f0;
                --card-bg: #ffffff;
                --primary: #4f46e5;
                --success: #10b981;
                --error: #ef4444;
                --warning: #f59e0b;
                --info: #3b82f6;
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
            * { box-sizing: border-box; }
            body { 
                font-family: 'Inter', system-ui, -apple-system, sans-serif; 
                background-color: var(--bg-color); 
                color: var(--text-main); 
                line-height: 1.6;
                margin: 0; padding: 0;
                font-size: 12px;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .metric-card, h2, h3, .card-section {
                page-break-inside: avoid;
                break-inside: avoid;
            }
            pre {
                page-break-inside: auto; /* Allow very long code blocks to break */
            }
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
            .meta-target { color: var(--primary); font-weight: 600; }
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
            .metric-card .value { font-size: 15px; font-weight: 800; }
            .metric-error { border-left: 4px solid var(--error); }
            .metric-error .value { color: var(--error); }
            .metric-warning { border-left: 4px solid var(--warning); }
            .metric-warning .value { color: var(--warning); }
            .metric-success { border-left: 4px solid var(--success); }
            .metric-success .value { color: var(--success); }
            .metric-info { border-left: 4px solid var(--info); }
            .metric-info .value { color: var(--info); }

            .report-content {
                background: var(--card-bg);
                border: 1px solid var(--border-color);
                border-radius: 10px;
                padding: 32px;
                box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
                margin-bottom: 32px;
            }
            .report-content h2, .report-content h3 {
                font-size: 15px;
                color: var(--primary);
                font-weight: 700;
                margin-top: 32px;
                margin-bottom: 12px;
                padding-bottom: 8px;
                border-bottom: 1px solid #f1f5f9;
                text-transform: uppercase;
                letter-spacing: 0.03em;
            }
            .report-content p { margin-bottom: 16px; color: #334155; }
            .report-content ul { margin-left: 20px; margin-bottom: 24px; color: #334155; }
            .report-content li { margin-bottom: 8px; }
            .report-content strong {
                background: #eff6ff;
                color: #1d4ed8;
                padding: 2px 6px;
                border-radius: 4px;
                font-weight: 600;
                font-size: 11px;
            }
            .report-content pre, .playwright-block pre {
                background: #0f172a !important;
                color: #f8fafc !important;
                padding: 24px;
                border-radius: 12px;
                font-family: 'JetBrains Mono', monospace;
                font-size: 10.5px;
                line-height: 1.7;
                overflow-x: hidden;
                white-space: pre-wrap;
                word-wrap: break-word;
                border: 1px solid #1e293b;
                margin: 20px 0 32px 0;
            }
            .report-content code {
                background: #f1f5f9;
                color: #e11d48;
                padding: 2px 5px;
                border-radius: 4px;
                font-family: 'JetBrains Mono', monospace;
                font-size: 10px;
            }
            pre code { background: transparent !important; color: inherit !important; padding: 0 !important; }
            .pdf-footer {
                margin-top: 40px;
                padding-top: 16px;
                border-top: 1px solid var(--border-color);
                font-size: 9px;
                color: var(--text-muted);
                display: flex;
                justify-content: space-between;
                text-transform: uppercase;
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
        ${cicdCodeHtml}
        <div class="pdf-footer">
            <span>Generated by AI QA Engineer</span>
            <span>Premium Audit Report</span>
        </div>
    </body>
    </html>
    `;

    let browser;
    try {
        const chromiumAny = chromium as any;
        browser = await puppeteer.launch({
            args: [...(chromiumAny.args || []), '--hide-scrollbars', '--disable-web-security', '--no-sandbox', '--disable-setuid-sandbox'],
            defaultViewport: chromiumAny.defaultViewport,
            executablePath: await chromiumAny.executablePath(),
            headless: chromiumAny.headless === true ? true : 'new',
        } as any);

        const page = await browser.newPage();
        await page.setContent(fullHtml, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        const pdfBuffer = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' }
        });
        
        await browser.close();
        return pdfBuffer;
    } catch (err) {
        if (browser) await (browser as any).close();
        throw err;
    }
}

function parseMetrics(run: AnalysisRecord) {
    if (!run.playwright_output) return null;
    if (run.repo_url !== 'Code Snippet Debugging') {
        try {
            const jsonMatch = run.playwright_output.match(/### 🖥️ 5\. Execution Results\n+```json\n([\s\S]*?)```/i);
            if (jsonMatch && jsonMatch[1]) {
                const data = JSON.parse(jsonMatch[1].trim());
                const stats = data.stats || {};
                return {
                    type: 'playwright',
                    duration: run.total_duration ? run.total_duration.toFixed(1) : ((stats.duration || 0) / 1000).toFixed(1),
                    framework: run.framework_signature || 'Unknown Tech Stack'
                };
            }
        } catch (e) { }
        return { type: 'playwright', duration: run.total_duration?.toFixed(1) || '0', framework: run.framework_signature || 'N/A' };
    }
    const output = run.playwright_output;
    const errorType = output.match(/\*\*Error Type\*\*:\s*(.+)/i)?.[1]?.trim() || 'Analysis Complete';
    const errorLine = output.match(/\*\*Line Number\*\*:\s*(.+)/i)?.[1]?.trim() || 'N/A';
    return {
        type: 'snippet',
        errorType,
        errorLine,
        hasFix: output.includes('### 🚀 3.')
    };
}

function escapeHtml(text: string) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
