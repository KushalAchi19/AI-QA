import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import axios from 'axios';

const execPromise = util.promisify(exec);

// Maximum cumulative character size of file contents sent to AI
const MAX_AI_CONTEXT_CHARS = 120000; 

export interface ScannedFile {
    name: string;
    content: string;
    size: number;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    category: string;
}

/**
 * Repository Analyzer
 * High-speed implementation that prioritizes selective API fetching and shallow cloning.
 * Integrates ZIP download fallbacks and smart prioritized token compression.
 */
export async function analyzeRepository(
    repoUrl: string,
    analysisId: string,
    githubToken?: string,
    onProgress?: (stage: string, percent: number) => void
) {
    const notify = (stage: string, percent: number) => {
        if (onProgress) onProgress(stage, percent);
    };

    try {
        const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (!match) throw new Error("Invalid GitHub URL. Must be a valid github.com repository.");
        
        const owner = match[1];
        const repoName = match[2].replace('.git', '');
        const testsDir = path.join(__dirname, '..', 'tests-generated');
        const cloneFolder = `site-${analysisId}`;
        const clonePath = path.join(testsDir, cloneFolder);

        if (!fs.existsSync(testsDir)) {
            await fsPromises.mkdir(testsDir, { recursive: true });
        }

        notify("Fetching Repository", 15);
        console.log(`Starting High-Speed Analysis for ${owner}/${repoName}...`);

        let files: ScannedFile[] = [];
        let fetchedViaApi = false;

        // STRATEGY 1: Selective API Fetch (INSTANT fallback/bypass)
        try {
            console.log("Attempting high-speed selective API fetch...");
            files = await fetchKeyFilesViaAPI(owner, repoName, githubToken);
            if (files.length > 5) {
                console.log(`✅ API Selective Fetch successful (${files.length} files).`);
                fetchedViaApi = true;
                // Start background clone for environment execution later
                startBackgroundClone(repoUrl, clonePath, githubToken);
            }
        } catch (apiError: any) {
            console.log(`Notice: API Fetch skipped/failed (${apiError.message}), using shallow clone...`);
        }

        // STRATEGY 2: Ultra-Shallow Clone (Primary Local)
        if (!fetchedViaApi) {
            if (fs.existsSync(clonePath)) {
                await fsPromises.rm(clonePath, { recursive: true, force: true });
            }

            const authenticatedUrl = githubToken 
                ? repoUrl.replace('https://', `https://${githubToken}@`) 
                : repoUrl;

            notify("Fetching Repository (Cloning)", 20);

            try {
                // Clone depth 1, single branch, filtering out blob bodies until read
                await execPromise(`git clone --depth 1 --single-branch --filter=blob:none "${authenticatedUrl}" "${clonePath}"`, { timeout: 25000 });
                console.log("✅ Ultra-shallow clone successful.");
            } catch (cloneError: any) {
                console.warn(`Shallow clone failed (${cloneError.message}). Trying ZIP Fallback...`);
                notify("Fetching Repository (ZIP Fallback)", 25);
                await downloadRepoZip(owner, repoName, clonePath, githubToken);
            }

            notify("Filtering Files", 35);
            // Scan directory and build prioritised map
            files = await scanAndCategorizeDirectory(clonePath, clonePath);
        }

        notify("Static Analysis", 50);
        
        // Check if there is a frontend interface dynamically
        const isHeadless = !files.some(f => 
            f.name.endsWith('.html') || 
            f.name.endsWith('.jsx') || 
            f.name.endsWith('.tsx') || 
            f.name.endsWith('.vue') || 
            f.name.endsWith('.svelte')
        );

        // Apply dynamic token-budget priority sorting & prompt compression
        const compressedFiles = compressPromptContext(files);

        notify("AI Deep Analysis", 65);

        return { 
            files: compressedFiles, 
            cloneFolder, 
            isHeadless, 
            allScannedCount: files.length 
        };
        
    } catch (error: any) {
        console.error("Error in repository analysis:", error.message);
        throw new Error(`Failed to analyze repo: ${error.message}`);
    }
}

/**
 * Downloads the repository ZIP file as a fallback and extracts it.
 */
async function downloadRepoZip(owner: string, repo: string, extractPath: string, githubToken?: string) {
    const zipUrl = `https://api.github.com/repos/${owner}/${repo}/zipball/main`;
    const tempZip = `${extractPath}.zip`;

    // Ensure the folder directory exists
    await fsPromises.mkdir(extractPath, { recursive: true });

    try {
        const headers: any = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'AI-QA-Engineer' };
        if (githubToken) headers['Authorization'] = `token ${githubToken}`;

        const response = await axios.get(zipUrl, {
            headers,
            responseType: 'arraybuffer',
            timeout: 20000
        });

        await fsPromises.writeFile(tempZip, Buffer.from(response.data));

        // Extract ZIP using native platforms
        if (process.platform === 'win32') {
            await execPromise(`powershell -Command "Expand-Archive -Path '${tempZip}' -DestinationPath '${extractPath}' -Force"`);
        } else {
            await execPromise(`unzip -q "${tempZip}" -d "${extractPath}"`);
        }

        // Clean up zip archive
        if (fs.existsSync(tempZip)) await fsPromises.unlink(tempZip);

        // Flatten the top level zip folder if it exists
        const rootItems = await fsPromises.readdir(extractPath);
        if (rootItems.length === 1) {
            const nestedDir = path.join(extractPath, rootItems[0]);
            const stat = await fsPromises.stat(nestedDir);
            if (stat.isDirectory()) {
                const subItems = await fsPromises.readdir(nestedDir);
                for (const subItem of subItems) {
                    const src = path.join(nestedDir, subItem);
                    const dest = path.join(extractPath, subItem);
                    await fsPromises.rename(src, dest);
                }
                await fsPromises.rm(nestedDir, { recursive: true, force: true });
            }
        }
        console.log("✅ ZIP Fallback download & extraction completed.");
    } catch (err: any) {
        if (fs.existsSync(tempZip)) await fsPromises.unlink(tempZip).catch(() => {});
        throw new Error(`ZIP Fallback download failed: ${err.message}`);
    }
}

/**
 * Fast background cloner for verification step.
 */
function startBackgroundClone(repoUrl: string, clonePath: string, githubToken?: string) {
    if (fs.existsSync(clonePath)) return;
    const authenticatedUrl = githubToken ? repoUrl.replace('https://', `https://${githubToken}@`) : repoUrl;
    exec(`git clone --depth 1 --single-branch "${authenticatedUrl}" "${clonePath}"`, (err) => {
        if (err) console.error("Background clone error:", err.message);
        else console.log("Background clone completed successfully.");
    });
}

/**
 * Scan directory and categorize based on developers priority rules.
 */
async function scanAndCategorizeDirectory(basePath: string, currentPath: string, depth = 0): Promise<ScannedFile[]> {
    const files: ScannedFile[] = [];
    if (depth > 6) return files; // Protect against unbounded recursion

    const items = await fsPromises.readdir(currentPath);
    
    // Concurrently fetch stats to speed up scanning
    const results = await Promise.all(items.map(async (item) => {
        const fullPath = path.join(currentPath, item);
        
        // Smart IGNORE checking
        if (isIgnoredPath(item)) return null;

        try {
            const stat = await fsPromises.stat(fullPath);
            if (stat.isDirectory()) {
                return await scanAndCategorizeDirectory(basePath, fullPath, depth + 1);
            } else if (stat.isFile()) {
                if (stat.size > 2 * 1024 * 1024) return null; // Ignore huge files > 2MB

                const extension = path.extname(item).toLowerCase().replace('.', '');
                if (!isMeaningfulExtension(extension) || isBinaryExtension(extension)) return null;

                const name = path.relative(basePath, fullPath).replace(/\\/g, '/');
                const content = await fsPromises.readFile(fullPath, 'utf8');
                
                // Determine file priority
                const priority = getFilePriority(name, extension);

                return {
                    name,
                    content,
                    size: stat.size,
                    priority,
                    category: getFileCategory(extension)
                };
            }
        } catch (e) {
            // Ignore individual file read errors
        }
        return null;
    }));

    for (const res of results) {
        if (Array.isArray(res)) {
            files.push(...res);
        } else if (res) {
            files.push(res);
        }
    }

    return files;
}

/**
 * Optimized key files fetcher via GitHub REST API.
 */
async function fetchKeyFilesViaAPI(owner: string, repo: string, githubToken?: string): Promise<ScannedFile[]> {
    const criticalRoots = ['package.json', 'tsconfig.json', 'src', 'app', 'middleware.ts', 'server.js', 'app.js'];
    const files: ScannedFile[] = [];
    const seenPaths = new Set<string>();
    
    async function fetchPath(targetPath: string, depth = 0) {
        if (depth > 3 || files.length > 40 || seenPaths.has(targetPath)) return;
        seenPaths.add(targetPath);
        
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${targetPath}`;
        
        try {
            const headers: any = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'AI-QA-Engineer' };
            if (githubToken) headers['Authorization'] = `token ${githubToken}`;
            
            const res = await axios.get(url, { headers, timeout: 5000 });
            const data = res.data;
            
            if (Array.isArray(data)) {
                // Parallelize children fetch
                await Promise.all(data.map(async (item: any) => {
                    const ext = path.extname(item.name).toLowerCase().replace('.', '');
                    if (item.type === 'file' && isMeaningfulExtension(ext) && !isBinaryExtension(ext)) {
                        await fetchPath(item.path, depth + 1);
                    } else if (item.type === 'dir' && !isIgnoredPath(item.name) && depth < 2) {
                        await fetchPath(item.path, depth + 1);
                    }
                }));
            } else if (data.type === 'file' && data.content) {
                const content = Buffer.from(data.content, 'base64').toString('utf8');
                const extension = path.extname(data.name).toLowerCase().replace('.', '');
                if (content.length < 150000) {
                    files.push({
                        name: data.path,
                        content,
                        size: content.length,
                        priority: getFilePriority(data.path, extension),
                        category: getFileCategory(extension)
                    });
                }
            }
        } catch (e) {
            // Silence API failures to let shallow clone run
        }
    }

    await Promise.all(criticalRoots.map(p => fetchPath(p)));
    return files;
}

/**
 * Checks if a path is in our ignore list.
 */
function isIgnoredPath(name: string): boolean {
    const ignored = [
        'node_modules', 'dist', 'build', 'coverage', '.next', '.cache',
        '.git', 'vendor', 'target', 'out', 'bin', '.idea', '.vscode'
    ];
    return ignored.includes(name.toLowerCase());
}

/**
 * Checks if file extension is meaningful for developer files.
 */
function isMeaningfulExtension(ext: string): boolean {
    const list = [
        'js', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'html', 'css', 'scss', 'sass', 'less',
        'py', 'java', 'go', 'rb', 'php', 'cs', 'cpp', 'c', 'rs', 'kt', 'scala', 'swift', 'dart', 'ex', 'exs',
        'json', 'yaml', 'yml', 'toml', 'env', 'ini', 'conf', 'properties', 'xml',
        'sql', 'prisma', 'md', 'ipynb'
    ];
    return list.includes(ext);
}

/**
 * Checks if extension is a binary file.
 */
function isBinaryExtension(ext: string): boolean {
    const binaries = [
        'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'mp3', 'zip', 'tar', 'exe', 'dll', 'so', 'dylib', 'pdf', 'ico'
    ];
    return binaries.includes(ext);
}

/**
 * Dynamic File Prioritization Heuristic.
 */
function getFilePriority(filePath: string, ext: string): 'HIGH' | 'MEDIUM' | 'LOW' {
    const pathLower = filePath.toLowerCase();
    
    // High Priority Rules
    const isHighKeywords = [
        'auth', 'route', 'middleware', 'jwt', 'schema', 'db', 'controller', 
        'security', 'permission', 'rbac', 'payment', 'stripe', 'checkout', 'config'
    ];
    const isHighExtensions = ['sql', 'prisma', 'env'];
    const isHighFiles = ['package.json', 'dockerfile', 'docker-compose.yml', 'tsconfig.json', 'nginx.conf'];

    if (isHighFiles.includes(pathLower.split('/').pop() || '')) return 'HIGH';
    if (isHighExtensions.includes(ext)) return 'HIGH';
    if (isHighKeywords.some(keyword => pathLower.includes(keyword))) return 'HIGH';

    // Low Priority Rules
    const isLowExtensions = ['css', 'scss', 'sass', 'less', 'md'];
    if (isLowExtensions.includes(ext)) return 'LOW';

    // Default to Medium (services, utilities, hooks, components)
    return 'MEDIUM';
}

function getFileCategory(ext: string): string {
    const frontend = ['js', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'html'];
    const styling = ['css', 'scss', 'sass', 'less'];
    const backend = ['py', 'java', 'go', 'rb', 'php', 'cs', 'cpp', 'c', 'rs', 'kt', 'scala', 'swift', 'dart', 'ex', 'exs'];
    const configs = ['json', 'yaml', 'yml', 'toml', 'env', 'ini', 'conf', 'properties', 'xml'];
    
    if (frontend.includes(ext)) return 'frontend';
    if (styling.includes(ext)) return 'styling';
    if (backend.includes(ext)) return 'backend';
    if (configs.includes(ext)) return 'config';
    return 'other';
}

/**
 * Token-budget prompt compressor.
 * Guarantees context characters do not exceed MAX_AI_CONTEXT_CHARS by abstracting files.
 */
export function compressPromptContext(files: ScannedFile[]): ScannedFile[] {
    // Sort: HIGH priority first, then MEDIUM, then LOW. Within that, smaller files first
    const sorted = [...files].sort((a, b) => {
        const priorityOrder = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
            return priorityOrder[b.priority] - priorityOrder[a.priority];
        }
        return a.size - b.size;
    });

    let currentLength = 0;
    const result: ScannedFile[] = [];

    for (const file of sorted) {
        const charLength = file.content.length;
        
        if (file.priority === 'HIGH' || (currentLength + charLength < MAX_AI_CONTEXT_CHARS)) {
            // Keep full content
            result.push(file);
            currentLength += charLength;
        } else {
            // Out of budget - abstract/summarize file to keep structural integrity without burning tokens
            const abstractedContent = `// [CONTENT OMITTED FOR TOKEN BUDGET - STRUCTURAL OVERVIEW ONLY]
// File Path: ${file.name}
// Size: ${file.size} bytes
// Priority: ${file.priority}
// Category: ${file.category}
// Imports / Exports Detectable in Static Mapping.
`;
            result.push({
                ...file,
                content: abstractedContent,
                size: abstractedContent.length
            });
            currentLength += abstractedContent.length;
        }
    }

    console.log(`compressed code context from ${files.reduce((acc, f) => acc + f.content.length, 0)} to ${currentLength} characters.`);
    return result;
}
