// ============================================================================
// SERVICE: CLIENT-SIDE PDF GENERATOR (pdfService.ts)
// This service generates and downloads professional PDF audit reports
// directly within the user's browser without requiring backend PDF rendering.
// It uses:
// 1. marked: Parses AI markdown prose into semantic HTML.
// 2. html2canvas: Renders the off-screen HTML template into a high-res image.
// 3. jsPDF: Compiles the rasterized image into a multi-page A4 PDF file.
// ============================================================================

// Import jsPDF to programmatically generate PDF documents in the browser.
// WHAT: Client-side PDF generation library.
// WHY: Enables instant report downloads without server-side headless browsers like Puppeteer.
// HOW: Used to create, page, and save the final PDF file.
import { jsPDF } from 'jspdf';

// Import html2canvas to rasterize DOM elements into HTML5 Canvas.
// WHAT: Screenshots HTML DOM nodes into pixel buffers.
// WHY: Accurately preserves custom CSS styles, fonts, and borders in the generated PDF.
import html2canvas from 'html2canvas';

// Import marked to parse Markdown into HTML markup.
// WHAT: Fast markdown parser and compiler.
// WHY: The AI diagnostics output is formatted in Markdown; marked renders it as styled HTML.
import { marked } from 'marked';

// ----------------------------------------------------------------------------
// DATA INTERFACES
// ----------------------------------------------------------------------------

// Interface defining the analysis record fields required for report generation.
interface AnalysisRecord {
  id: string;
  repo_url: string;
  status: string;
  created_at: string;
  playwright_output?: string;
  test_code?: string;
  cicd_code?: string;
  total_duration?: number;
  framework_signature?: string;
}

// ----------------------------------------------------------------------------
// CLIENT PDF GENERATION WORKFLOW
// ----------------------------------------------------------------------------

/**
 * Generates and downloads a complete diagnostic audit report in PDF format.
 * WHAT: Assembles report data into an HTML template, renders it offscreen, captures it
 *       with html2canvas, pages it into a jsPDF document, and triggers browser download.
 * WHY: Provides students and engineers with a tangible, presentation-ready artifact for viva defense.
 * HOW: Called when the user clicks "Export PDF" in the dashboard header.
 */
export async function generateClientPDF(run: AnalysisRecord) {
  // Format creation timestamp into localized readable date.
  const date = new Date(run.created_at).toLocaleString();
  // Determine title based on whether input was a code snippet or repository.
  const title = run.repo_url === 'Code Snippet Debugging' ? 'Snippet Diagnostic Report' : 'Repository Audit Report';
  
  // 1. Prepare the HTML Content
  // Parse AI markdown text into HTML using marked.
  const proseHtml = marked.parse(run.playwright_output || '');
  // Extract key metrics (e.g. error type, duration, tech stack) from analysis record.
  const metrics = parseMetrics(run);
  
  // Build metrics grid HTML cards.
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
            <div class="label">Result</div>
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
            <div class="label">Framework</div>
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

  // Format Playwright test suite code section if present.
  const testCodeHtml = run.test_code ? `
    <div class="section-title">Playwright Test Suite</div>
    <pre class="code-block"><code>${escapeHtml(run.test_code)}</code></pre>
  ` : '';

  // Format GitHub Actions CI/CD configuration section if present.
  const cicdCodeHtml = run.cicd_code ? `
    <div class="section-title">CI/CD Pipeline Configuration</div>
    <pre class="code-block"><code>${escapeHtml(run.cicd_code)}</code></pre>
  ` : '';

  // Combine components into complete off-screen template container with embedded styles.
  const fullHtml = `
    <div id="pdf-template" style="width: 800px; padding: 40px; background: #f8fafc; color: #0f172a; font-family: sans-serif; line-height: 1.6;">
      <div style="border-bottom: 2px solid #4f46e5; padding-bottom: 20px; margin-bottom: 30px;">
        <h1 style="font-size: 28px; margin: 0; font-weight: 800;">${title}</h1>
        <div style="display: flex; justify-content: space-between; font-size: 12px; color: #64748b; margin-top: 10px;">
          <span>Target: <strong style="color: #4f46e5;">${run.repo_url}</strong></span>
          <span>${date}</span>
        </div>
      </div>
      
      ${metricsHtml}
      
      <div style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 30px; margin-bottom: 30px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
        ${proseHtml}
      </div>
      
      ${testCodeHtml}
      ${cicdCodeHtml}
      
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; text-transform: uppercase;">
        <span>Generated by AI QA Engineer</span>
        <span>Premium Audit Report</span>
      </div>
      
      <style>
        .metrics-grid { display: flex; gap: 15px; margin-bottom: 30px; }
        .metric-card { flex: 1; background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; border-left: 4px solid #cbd5e1; }
        .metric-card .label { font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 5px; }
        .metric-card .value { font-size: 16px; font-weight: 800; }
        .metric-error { border-left-color: #ef4444; } .metric-error .value { color: #ef4444; }
        .metric-warning { border-left-color: #f59e0b; } .metric-warning .value { color: #f59e0b; }
        .metric-success { border-left-color: #10b981; } .metric-success .value { color: #10b981; }
        .metric-info { border-left-color: #3b82f6; } .metric-info .value { color: #3b82f6; }
        .section-title { font-size: 14px; font-weight: 800; color: #4f46e5; margin-top: 30px; margin-bottom: 10px; text-transform: uppercase; }
        .code-block { background: #0f172a; color: #f8fafc; padding: 20px; border-radius: 10px; font-family: monospace; font-size: 11px; white-space: pre-wrap; overflow-x: hidden; }
        h1, h2, h3 { color: #1e293b; margin-top: 25px; }
        ul { padding-left: 20px; }
        li { margin-bottom: 5px; }
      </style>
    </div>
  `;

  // 2. Render to a temporary offscreen container
  // WHAT: Creates a div positioned far off the visible viewport (`left: -9999px`).
  // WHY: Browser must calculate layout and fonts for html2canvas without disturbing the active UI.
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.innerHTML = fullHtml;
  document.body.appendChild(container);

  try {
    // 3. Capture as Image using html2canvas
    const element = document.getElementById('pdf-template');
    if (!element) throw new Error("Template not found");
    
    // Rasterize element into canvas with 2x scale for sharp, crisp print quality.
    const canvas = await html2canvas(element, {
      scale: 2, // Higher resolution
      useCORS: true,
      logging: false,
      backgroundColor: '#f8fafc'
    });
    
    // Convert canvas into PNG Data URL.
    const imgData = canvas.toDataURL('image/png');
    
    // 4. Create PDF using jsPDF (Portrait, Millimeters, A4 format)
    const pdf = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4'
    });
    
    // Calculate proportional height to fit standard A4 paper width.
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    
    // Handle multi-page splitting if report length exceeds single page.
    let heightLeft = pdfHeight;
    let position = 0;
    const pageHeight = pdf.internal.pageSize.getHeight();

    // Add first page
    pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
    heightLeft -= pageHeight;

    // Loop and add additional pages as long as remaining content height exists.
    while (heightLeft >= 0) {
      position = heightLeft - pdfHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pageHeight;
    }
    
    // 5. Trigger browser file download with unique ID filename.
    pdf.save(`AI-Diagnostic-${run.id.slice(0, 8)}.pdf`);
    
  } finally {
    // Always clean up the temporary offscreen DOM node to avoid memory leaks.
    document.body.removeChild(container);
  }
}

// ----------------------------------------------------------------------------
// HELPER FUNCTIONS
// ----------------------------------------------------------------------------

/**
 * Parses quantitative metrics from raw analysis output.
 * WHAT: Extracts duration, framework signature, error type, and line numbers using regex.
 * WHY: Powers the summary metric boxes at the top of the PDF report.
 */
function parseMetrics(run: any) {
  if (!run.playwright_output) return null;
  if (run.repo_url !== 'Code Snippet Debugging') {
    return {
      type: 'playwright',
      duration: run.total_duration?.toFixed(1) || '0',
      framework: run.framework_signature || 'N/A'
    };
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

/**
 * Escapes HTML characters in code snippets to prevent injection or broken tags in pre blocks.
 */
function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
