import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import axios from 'axios';

const execPromise = util.promisify(exec);

/**
 * Repository Analyzer
 * High-speed implementation that prioritizes selective API fetching over full cloning.
 * Now supports GitHub PAT for Private Repository access.
 */
export async function analyzeRepository(repoUrl: string, analysisId: string, githubToken?: string) {
    try {
        const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (!match) throw new Error("Invalid GitHub URL.");
        
        const owner = match[1];
        const repoName = match[2].replace('.git', '');
        const testsDir = path.join(__dirname, '..', 'tests-generated');
        const cloneFolder = `site-${analysisId}`;
        const clonePath = path.join(testsDir, cloneFolder);

        if (!fs.existsSync(testsDir)) await fsPromises.mkdir(testsDir, { recursive: true });

        console.log(`Starting High-Speed Analysis for ${owner}/${repoName}...`);

        // STRATEGY 1: Selective API Fetch (INSTANT)
        // We try to get the 20 most critical files via API first to avoid the clone latency
        try {
            const files = await fetchKeyFilesViaAPI(owner, repoName, githubToken);
            if (files.length > 0) {
                console.log(`✅ API Selective Fetch successful (${files.length} files). Bypassing clone for analysis.`);
                // We still need to start a background clone for the actual test execution later
                startBackgroundClone(repoUrl, clonePath, githubToken);
                
                const isHeadless = !files.some(f => f.name.endsWith('.html') || f.name.endsWith('.jsx') || f.name.endsWith('.tsx') || f.name.endsWith('.vue') || f.name.endsWith('.svelte'));
                return { files, cloneFolder, isHeadless };
            }
        } catch (apiError) {
            console.log("Notice: API Fetch skipped (likely rate-limited or private), falling back to ultra-shallow clone...");
        }

        // STRATEGY 2: Ultra-Shallow Clone (FALLBACK)
        if (fs.existsSync(clonePath)) await fsPromises.rm(clonePath, { recursive: true, force: true });
        
        // Use blob filter to avoid downloading file contents until we actually read them
        const authenticatedUrl = githubToken ? repoUrl.replace('https://', `https://${githubToken}@`) : repoUrl;
        await execPromise(`git clone --depth 1 --single-branch --filter=blob:none ${authenticatedUrl} "${clonePath}"`);

        const files: any[] = [];
        await scanDirectory(clonePath, clonePath, files);

        const isHeadless = !files.some(f => f.name.endsWith('.html') || f.name.endsWith('.jsx') || f.name.endsWith('.tsx') || f.name.endsWith('.vue') || f.name.endsWith('.svelte'));
        return { files, cloneFolder, isHeadless };
        
    } catch (error: any) {
        console.error("Error analyzing repository:", error.message);
        throw new Error(`Failed to analyze repo: ${error.message}`);
    }
}

async function fetchKeyFilesViaAPI(owner: string, repo: string, githubToken?: string): Promise<any[]> {
    const criticalPaths = ['package.json', 'src', 'app', 'public', 'index.html', 'main.js', 'app.js', 'server.js'];
    const files: any[] = [];
    const seenPaths = new Set<string>();
    
    async function fetchPath(path: string, depth = 0) {
        if (depth > 2 || files.length > 25 || seenPaths.has(path)) return;
        seenPaths.add(path);
        
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
        
        try {
            const headers: any = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'AI-QA-Engineer' };
            if (githubToken) headers['Authorization'] = `token ${githubToken}`;
            
            const res = await axios.get(url, { headers, timeout: 5000 });
            const data = res.data;
            
            if (Array.isArray(data)) {
                // Parallelize child directory scanning
                await Promise.all(data.map(async (item: any) => {
                    if (item.type === 'file' && isSemanticFile(item.name)) {
                        await fetchPath(item.path, depth + 1);
                    } else if (item.type === 'dir' && (item.name === 'src' || item.name === 'app' || item.name === 'components' || item.name === 'lib')) {
                        await fetchPath(item.path, depth + 1);
                    }
                }));
            } else if (data.type === 'file' && data.content) {
                const content = Buffer.from(data.content, 'base64').toString('utf8');
                if (content.length < 50000) {
                    files.push({ name: data.path, content });
                }
            }
        } catch (e) {
            // Silence API errors, fallback to clone
        }
    }

    // Launch initial critical path fetches in parallel
    await Promise.all(criticalPaths.map(p => fetchPath(p)));
    return files;
}

function isSemanticFile(name: string) {
    const ext = path.extname(name);
    return ['.html', '.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte', '.json', '.css'].includes(ext);
}

function startBackgroundClone(repoUrl: string, clonePath: string, githubToken?: string) {
    const authenticatedUrl = githubToken ? repoUrl.replace('https://', `https://${githubToken}@`) : repoUrl;
    // Fire and forget - this runs while the AI is analyzing
    exec(`git clone --depth 1 --single-branch ${authenticatedUrl} "${clonePath}"`, (err) => {
        if (err) console.error("Background clone failed:", err.message);
        else console.log("Background clone completed successfully.");
    });
}

async function scanDirectory(basePath: string, currentPath: string, files: any[], depth = 0) {
    if (depth > 5 || files.length >= 25) return;
    const items = await fsPromises.readdir(currentPath);
    for (const item of items) {
        if (['node_modules', '.git', 'dist', 'build'].includes(item)) continue;
        const fullPath = path.join(currentPath, item);
        const stat = await fsPromises.stat(fullPath);
        if (stat.isDirectory()) await scanDirectory(basePath, fullPath, files, depth + 1);
        else if (stat.isFile() && isSemanticFile(item) && stat.size < 50000) {
            files.push({ name: path.relative(basePath, fullPath), content: await fsPromises.readFile(fullPath, 'utf8') });
        }
    }
}
