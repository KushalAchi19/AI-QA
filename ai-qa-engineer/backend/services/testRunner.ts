// ============================================================================
// SERVICE: TEST RUNNER (LOCAL ENVIRONMENT PREP & PLAYWRIGHT EXECUTION)
// This service prepares the execution environment for cloned repositories
// and executes the AI-generated Playwright tests against them.
// It handles:
// 1. Force-clearing port 3030 of any leftover background servers.
// 2. Injecting a web terminal emulator for headless CLI Node.js projects.
// 3. Booting local web application dev servers (Vite, Next, React, Static).
// 4. Executing Playwright E2E test suites with JSON reporting.
// ============================================================================

// Import file system methods to inspect paths and files in target repositories.
import fs, { existsSync as fsExists } from 'fs';
// Import child_process functions to spawn background servers and execute shell commands.
import { spawn, exec } from 'child_process';
// Import util to convert callback-based child_process functions into modern Promises.
import util from 'util';
// Import path to resolve directory locations across Windows and Linux environments.
import path from 'path';

// Alias synchronous existence checking helper.
const fsSync = { existsSync: fsExists };
// Promisify child_process.exec so we can use async/await with shell commands.
const execPromise = util.promisify(exec);

// ----------------------------------------------------------------------------
// ENVIRONMENT PREPARATION & SERVER BOOTSTRAPPING
// ----------------------------------------------------------------------------

/**
 * Atomically prepares the environment (port clearing, installs, server boot).
 * WHAT: Clears port 3030, identifies repository type (headless CLI vs modern web app vs static site),
 *       installs minimal dependencies, and starts a local server on port 3030.
 * WHY: Playwright tests need a running application target at http://localhost:3030 to test against.
 * HOW: Returns `{ serverProcess, executionLog }` so `server.ts` or `worker-entry.ts` can monitor and clean up the process.
 */
export async function prepareEnvironment(cloneFolder: string, isHeadless: boolean) {
    // Resolve the root backend directory.
    const cwd = path.join(__dirname, '..');
    // Compute the absolute path to the cloned repository inside 'tests-generated'.
    const sitePath = path.join(cwd, 'tests-generated', cloneFolder);
    // Accumulate log messages for debugging and viva inspection.
    let executionLog = "";
    
    // Internal logging helper that timestamps output and saves to executionLog.
    const log = (msg: string) => {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] ${msg}`);
        executionLog += `[${timestamp}] ${msg}\n`;
    };

    // Reference to hold the spawned child process representing the running server.
    let serverProcess: any;
    // Path to the repository's package.json file if one exists.
    const packageJsonPath = path.join(sitePath, 'package.json');
    // Boolean check whether the cloned project is a Node.js-based application.
    const isNodeApp = fs.existsSync(packageJsonPath);

    // Helper function that polls a target URL until the server responds or times out.
    // WHAT: Repeatedly sends HTTP GET requests to `url` every 1.5 seconds.
    // WHY: We must not run Playwright tests before the dev server has fully finished booting.
    // HOW: Returns true if server responds with HTTP < 500 within `timeoutMs`.
    async function waitForServer(url: string, timeoutMs: number) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            try {
                const res = await fetch(url);
                // Accept any non-500 response (e.g., 200 OK, 304 Not Modified, 404 Route).
                if (res.ok || res.status < 500) return true;
            } catch (_) { 
                // Dev server is still starting or compiling; suppress fetch error and retry.
            }
            // Wait 1.5 seconds before polling again.
            await new Promise(r => setTimeout(r, 1500));
        }
        log(`⚠️ Server did not respond at ${url} within ${timeoutMs / 1000}s — proceeding anyway.`);
        return false;
    }

    try {
        log("Force-clearing any dangling processes on port 3030...");
        // Handle operating system differences for freeing up port 3030.
        if (process.platform === 'win32') {
            try {
                // Windows: Query netstat for active listeners on port 3030.
                const { stdout } = await execPromise('netstat -ano | findstr ":3030 "').catch(() => ({ stdout: '' }));
                // Extract unique process IDs (PIDs) from netstat tabular output.
                const pids = [...new Set(
                    stdout.split('\n')
                        .map(line => line.trim().split(/\s+/).pop())
                        .filter((p): p is string => !!p && /^\d+$/.test(p) && p !== '0')
                )];
                // Forcibly kill each lingering process using taskkill.
                for (const pid of pids) {
                    await execPromise(`taskkill /f /pid ${pid}`).catch(() => {});
                }
            } catch (e) {}
        } else {
            // Linux/macOS: Use lsof and xargs to kill any process bound to port 3030.
            try { await execPromise('lsof -t -i:3030 | xargs kill -9'); } catch (e) {}
        }

        // Check if the cloned project contains a standard 'src' source code folder.
        const hasSrcFolder = fsSync.existsSync(path.join(sitePath, 'src'));
        
        // --------------------------------------------------------------------
        // CASE 1: HEADLESS NODE CLI APPLICATION
        // --------------------------------------------------------------------
        if (isHeadless) {
            log("Headless CLI detected. Injecting Web Shell Wrapper...");
            // Web Shell HTML interface that provides a browser DOM emulator for Playwright.
            // WHAT: Generates an HTML page with terminal output display and command input field.
            // WHY: Playwright is a browser automation tool; headless CLI apps don't have a UI to test.
            // HOW: Provides `#cli-output` and `#cli-input` selectors so Playwright can interact with stdin/stdout.
            const shellHtml = `<!DOCTYPE html><html><body style="background:#1a1a1a;color:#0f0;font-family:monospace;padding:20px;">
                <div id="cli-output" style="white-space:pre-wrap;height:500px;overflow-y:auto;border:1px solid #333;padding:10px;margin-bottom:10px;"></div>
                <div style="display:flex;gap:10px;"><span style="color:#0f0">AI-QA></span><input type="text" id="cli-input" style="background:transparent;border:none;color:#fff;outline:none;flex:1;" autofocus /></div>
                <button id="cli-submit" style="display:none;">Submit</button>
                <script>
                    const out = document.getElementById('cli-output');
                    const inp = document.getElementById('cli-input');
                    const sub = document.getElementById('cli-submit');
                    const poll = async () => { try { const r = await fetch('/output'); out.innerText = await r.text(); out.scrollTop = out.scrollHeight; } catch(e){} };
                    setInterval(poll, 1000);
                    const send = async () => { if(!inp.value) return; await fetch('/input', {method:'POST', body:inp.value}); inp.value=''; poll(); };
                    inp.onkeydown = (e) => { if(e.key==='Enter') send(); };
                    sub.onclick = send;
                </script></body></html>`;

            // Node HTTP wrapper server that spawns the CLI process and exposes endpoints to read stdout and write stdin.
            const wrapperServer = `const http = require('http'); const fs = require('fs'); const { spawn } = require('child_process');
                let out = ''; let proc;
                if(fs.existsSync('package.json')) { proc = spawn('npm', ['start'], {shell:true}); }
                else { let f = fs.existsSync('index.js') ? 'index.js' : 'app.js'; if(fs.existsSync(f)) proc = spawn('node', [f], {shell:true}); }
                if(proc) { proc.stdout.on('data', d=>out+=d); proc.stderr.on('data', d=>out+=d); }
                http.createServer((req,res) => {
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    if(req.url==='/'){ res.end(fs.readFileSync('ai-qa-shell.html')); }
                    else if(req.url==='/output'){ res.end(out); }
                    else if(req.url==='/input'){ let b=''; req.on('data',c=>b+=c); req.on('end',()=>{ if(proc)proc.stdin.write(b+'\\n'); res.end(); }); }
                }).listen(3030);`;

            // Write the wrapper HTML and server scripts directly into the cloned repo directory.
            fs.writeFileSync(path.join(sitePath, 'ai-qa-shell.html'), shellHtml);
            fs.writeFileSync(path.join(sitePath, 'ai-qa-server.js'), wrapperServer);

            // Install minimal CLI dependencies if package.json is present.
            if (isNodeApp) {
                log("Installing CLI dependencies (optimized)...");
                await execPromise(`npm install --no-fund --no-audit --silent --prefer-offline --no-package-lock --no-save`, { cwd: sitePath, timeout: 60000 });
            }

            // Spawn the wrapper server process on port 3030.
            serverProcess = spawn('node', ['ai-qa-server.js'], { cwd: sitePath, shell: true });
            // Wait for port 3030 to respond before returning.
            await waitForServer('http://localhost:3030', 20000);

        // --------------------------------------------------------------------
        // CASE 2: MODERN FULLSTACK / FRONTEND WEB APP (React, Vue, Vite, Next)
        // --------------------------------------------------------------------
        } else if (isNodeApp && hasSrcFolder) {
            log("Modern Web App detected (React/Vue/Vite). Installing dependencies...");
            try {
                // Install dependencies quickly without audit or lock updates.
                await execPromise(`npm install --no-fund --no-audit --silent --prefer-offline --no-package-lock --no-save`, { cwd: sitePath, timeout: 120000 });
            } catch (e) { log("Notice: npm install timed out or warned, attempting to proceed anyway..."); }
            
            log("Booting Framework Dev Server...");
            // Parse package.json scripts to find either 'dev' or 'start'.
            const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            const cmd = pkg.scripts?.dev ? 'dev' : 'start';
            // Spawn the application dev server, forcing PORT to 3030.
            serverProcess = spawn('npm', ['run', cmd], {
                cwd: sitePath,
                shell: true,
                env: { ...process.env, PORT: '3030', VITE_PORT: '3030', BROWSER: 'none', SKIP_PREFLIGHT_CHECK: 'true' }
            });
            // Allow up to 60 seconds for modern framework dev servers to bundle and listen.
            await waitForServer('http://localhost:3030', 60000);

        // --------------------------------------------------------------------
        // CASE 3: STATIC HTML/CSS/JS WEBSITE
        // --------------------------------------------------------------------
        } else {
            log("Static Site detected. Booting ultra-fast server...");
            // Use sirv-cli to instantly serve static files on port 3030.
            serverProcess = spawn('npx', ['-y', 'sirv-cli', '.', '--port', '3030', '--host', 'localhost'], { cwd: sitePath, shell: true });
            // Static server boots fast; allow 10 seconds.
            await waitForServer('http://localhost:3030', 10000);
        }

        // Return the active server process handle and execution log.
        return { serverProcess, executionLog };

    } catch (error: any) {
        log(`Environment Setup Failed: ${error.message}`);
        return { serverProcess, executionLog, error: error.message };
    }
}

// ----------------------------------------------------------------------------
// PLAYWRIGHT TEST SUITE EXECUTION
// ----------------------------------------------------------------------------

/**
 * Runs Playwright against an already-prepared environment.
 * WHAT: Executes the generated test file using the Playwright CLI with JSON reporter.
 * WHY: Enables structured evaluation of test passes, failures, and execution timings.
 * HOW: Returns parsed JSON results along with concatenated execution logs.
 */
export async function runPlaywrightTest(testFileName: string, executionLog: string) {
    // Root directory of the backend where playwright is installed.
    const cwd = path.join(__dirname, '..');
    // Relative path to the generated test specification file.
    const testPath = `tests-generated/${testFileName}`;
    
    try {
        console.log(`Executing Playwright Test Suite: ${testFileName}`);
        // Run Playwright CLI with JSON output reporter for machine-readable results.
        const { stdout } = await execPromise(`npx playwright test "${testPath}" --reporter=json`, { cwd, maxBuffer: 1024 * 1024 * 10 });
        // Parse the JSON output emitted by Playwright.
        const result = JSON.parse(stdout);
        // Attach terminal log history to the result object.
        result.executionLog = executionLog;
        return result;
    } catch (error: any) {
        // Playwright exits with non-zero code if any test fails, which triggers catch block.
        // Check if stdout contains valid JSON reporting despite the failure exit code.
        if (error.stdout) {
            try {
                const result = JSON.parse(error.stdout);
                result.executionLog = executionLog;
                return result;
            } catch (e) {}
        }
        // Return standard error payload if JSON parsing fails.
        return { error: error.message, executionLog };
    }
}

// ----------------------------------------------------------------------------
// SYNCHRONOUS RUNNER WRAPPER (LEGACY SUPPORT)
// ----------------------------------------------------------------------------

/**
 * Legacy wrapper for synchronous execution.
 * WHAT: Prepares environment, runs tests, and cleans up server in a finally block.
 * WHY: Provides self-contained single-call execution if needed.
 * HOW: Cleans up server process via taskkill (Windows) or SIGINT (Unix).
 */
export async function runGeneratedTest(testFileName: string, cloneFolder: string, isHeadless: boolean) {
    // Step 1: Boot environment on port 3030.
    const { serverProcess, executionLog, error } = await prepareEnvironment(cloneFolder, isHeadless);
    if (error) return { error, executionLog };
    
    try {
        // Step 2: Run the Playwright test suite against port 3030.
        return await runPlaywrightTest(testFileName, executionLog);
    } finally {
        // Step 3: Always terminate the background dev server to free system resources.
        if (serverProcess) {
            if (process.platform === 'win32' && serverProcess.pid) {
                try { exec(`taskkill /pid ${serverProcess.pid} /t /f`); } catch (e) {}
            } else {
                serverProcess.kill('SIGINT');
            }
        }
    }
}
