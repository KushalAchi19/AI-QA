import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';

const execPromise = util.promisify(exec);

/**
 * Repository Analyzer
 * Clones a public GitHub repository and returns key file contexts.
 */
export async function analyzeRepository(repoUrl: string, analysisId: string) {
    try {
        const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        if (!match) {
            throw new Error("Invalid GitHub URL. Must be formatted like https://github.com/owner/repo");
        }
        
        const owner = match[1];
        const repoName = match[2].replace('.git', '');

        const testsDir = path.join(__dirname, '..', 'tests-generated');
        if (!fs.existsSync(testsDir)) {
            await fsPromises.mkdir(testsDir, { recursive: true });
        }

        const cloneFolder = `site-${analysisId}`;
        const clonePath = path.join(testsDir, cloneFolder);

        // Remove if previously failed or exists
        if (fs.existsSync(clonePath)) {
            await fsPromises.rm(clonePath, { recursive: true, force: true });
        }

        console.log(`Cloning repository: ${repoUrl} to ${clonePath}`);
        
        // Shallow clone just the latest snapshot to drastically reduce latency
        await execPromise(`git clone --depth 1 --single-branch ${repoUrl} "${clonePath}"`);

        console.log(`Successfully cloned ${owner}/${repoName}. Reading key UI files deeply...`);

        // Recursively read actual contents of semantic application files
        const files: any[] = [];
        
        async function scanDirectory(dir: string, depth = 0) {
            // Prevent infinite symlinks/giant monorepos and cap to ~25 critical UI files to save AI Context Window tokens
            if (depth > 5) return;
            if (files.length >= 25) return;

            const dirItems = await fsPromises.readdir(dir);
            for (const item of dirItems) {
                // Strictly exclude heavy, compiled, and irrelevant directories
                if (item === 'node_modules' || item.startsWith('.') || item === 'dist' || item === 'build' || item === 'out') {
                    continue;
                }
                
                const filePath = path.join(dir, item);
                const stat = await fsPromises.stat(filePath);
                
                if (stat.isDirectory()) {
                    await scanDirectory(filePath, depth + 1);
                } else if (stat.isFile() && stat.size < 50000) { 
                    // Automatically support Vanilla, React, Next, Vue, and Svelte component extensions
                    if (item.endsWith('.html') || item.endsWith('.js') || item.endsWith('.css') || item.endsWith('.ts') || item.endsWith('.jsx') || item.endsWith('.tsx') || item.endsWith('.vue') || item.endsWith('.svelte')) {
                        const content = await fsPromises.readFile(filePath, 'utf8');
                        files.push({
                            // Provide semantic relative path (e.g., 'src/components/Header.jsx') so AI understands architecture
                            name: path.relative(clonePath, filePath), 
                            content: content
                        });
                    }
                }
            }
        }
        
        await scanDirectory(clonePath);

        const isHeadless = !files.some(f => f.name.endsWith('.html') || f.name.endsWith('.jsx') || f.name.endsWith('.tsx') || f.name.endsWith('.vue') || f.name.endsWith('.svelte'));

        return { files, cloneFolder, isHeadless };
        
    } catch (error: any) {
        console.error("Error analyzing repository:", error.message);
        throw new Error(`Failed to clone and read repo data: ${error.message}`);
    }
}
