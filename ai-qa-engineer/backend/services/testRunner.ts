import fs, { existsSync as fsExists } from 'fs';
import { spawn, exec } from 'child_process';
import util from 'util';
import path from 'path';

const fsSync = { existsSync: fsExists };
const execPromise = util.promisify(exec);

/**
 * Atomically prepares the environment (port clearing, installs, server boot)
 */
export async function prepareEnvironment(cloneFolder: string, isHeadless: boolean) {
    const cwd = path.join(__dirname, '..');
    const sitePath = path.join(cwd, 'tests-generated', cloneFolder);
    let executionLog = "";
    
    const log = (msg: string) => {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] ${msg}`);
        executionLog += `[${timestamp}] ${msg}\n`;
    };

    let serverProcess: any;
    const packageJsonPath = path.join(sitePath, 'package.json');
    const isNodeApp = fs.existsSync(packageJsonPath);

    async function waitForServer(url: string, timeoutMs: number) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            try {
                const res = await fetch(url);
                if (res.ok || res.status < 500) return true; // Accept any non-server-error response
            } catch (_) { /* Server not ready yet */ }
            await new Promise(r => setTimeout(r, 1500));
        }
        log(`⚠️ Server did not respond at ${url} within ${timeoutMs / 1000}s — proceeding anyway.`);
        return false;
    }

    try {
        log("Force-clearing any dangling processes on port 3030...");
        if (process.platform === 'win32') {
            try {
                // Get PIDs listening on port 3030, kill each
                const { stdout } = await execPromise('netstat -ano | findstr ":3030 "').catch(() => ({ stdout: '' }));
                const pids = [...new Set(
                    stdout.split('\n')
                        .map(line => line.trim().split(/\s+/).pop())
                        .filter((p): p is string => !!p && /^\d+$/.test(p) && p !== '0')
                )];
                for (const pid of pids) {
                    await execPromise(`taskkill /f /pid ${pid}`).catch(() => {});
                }
            } catch (e) {}
        } else {
            try { await execPromise('lsof -t -i:3030 | xargs kill -9'); } catch (e) {}
        }

        const hasSrcFolder = fsSync.existsSync(path.join(sitePath, 'src'));
        
        if (isHeadless) {
            log("Headless CLI detected. Injecting Web Shell Wrapper...");
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

            fs.writeFileSync(path.join(sitePath, 'ai-qa-shell.html'), shellHtml);
            fs.writeFileSync(path.join(sitePath, 'ai-qa-server.js'), wrapperServer);

            if (isNodeApp) {
                log("Installing CLI dependencies (optimized)...");
                await execPromise(`npm install --no-fund --no-audit --silent --prefer-offline --no-package-lock --no-save`, { cwd: sitePath, timeout: 60000 });
            }

            serverProcess = spawn('node', ['ai-qa-server.js'], { cwd: sitePath, shell: true });
            await waitForServer('http://localhost:3030', 20000);

        } else if (isNodeApp && hasSrcFolder) {
            log("Modern Web App detected (React/Vue/Vite). Installing dependencies...");
            try {
                await execPromise(`npm install --no-fund --no-audit --silent --prefer-offline --no-package-lock --no-save`, { cwd: sitePath, timeout: 120000 });
            } catch (e) { log("Notice: npm install timed out or warned, attempting to proceed anyway..."); }
            
            log("Booting Framework Dev Server...");
            const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            const cmd = pkg.scripts?.dev ? 'dev' : 'start';
            serverProcess = spawn('npm', ['run', cmd], {
                cwd: sitePath,
                shell: true,
                env: { ...process.env, PORT: '3030', VITE_PORT: '3030', BROWSER: 'none', SKIP_PREFLIGHT_CHECK: 'true' }
            });
            await waitForServer('http://localhost:3030', 60000);

        } else {
            log("Static Site detected. Booting ultra-fast server...");
            serverProcess = spawn('npx', ['-y', 'sirv-cli', '.', '--port', '3030', '--host', 'localhost'], { cwd: sitePath, shell: true });
            await waitForServer('http://localhost:3030', 10000);
        }

        return { serverProcess, executionLog };

    } catch (error: any) {
        log(`Environment Setup Failed: ${error.message}`);
        return { serverProcess, executionLog, error: error.message };
    }
}

/**
 * Runs Playwright against an already-prepared environment
 */
export async function runPlaywrightTest(testFileName: string, executionLog: string) {
    const cwd = path.join(__dirname, '..');
    const testPath = `tests-generated/${testFileName}`;
    
    try {
        console.log(`Executing Playwright Test Suite: ${testFileName}`);
        const { stdout } = await execPromise(`npx playwright test "${testPath}" --reporter=json`, { cwd, maxBuffer: 1024 * 1024 * 10 });
        const result = JSON.parse(stdout);
        result.executionLog = executionLog;
        return result;
    } catch (error: any) {
        if (error.stdout) {
            try {
                const result = JSON.parse(error.stdout);
                result.executionLog = executionLog;
                return result;
            } catch (e) {}
        }
        return { error: error.message, executionLog };
    }
}

/**
 * Legacy wrapper for synchronous execution
 */
export async function runGeneratedTest(testFileName: string, cloneFolder: string, isHeadless: boolean) {
    const { serverProcess, executionLog, error } = await prepareEnvironment(cloneFolder, isHeadless);
    if (error) return { error, executionLog };
    
    try {
        return await runPlaywrightTest(testFileName, executionLog);
    } finally {
        if (serverProcess) {
            if (process.platform === 'win32' && serverProcess.pid) {
                try { exec(`taskkill /pid ${serverProcess.pid} /t /f`); } catch (e) {}
            } else {
                serverProcess.kill('SIGINT');
            }
        }
    }
}
