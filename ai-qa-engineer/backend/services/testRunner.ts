import { exec } from 'child_process';
import util from 'util';
import path from 'path';

const execPromise = util.promisify(exec);

/**
 * Programmatically runs a generated Playwright test and captures the JSON report.
 */
export async function runGeneratedTest(testFileName: string) {
    const cwd = path.join(__dirname, '..');
    const testPath = path.join('tests-generated', testFileName);
    
    console.log(`Running test: npx playwright test ${testPath} --reporter=json`);
    
    try {
        // Run Playwright test using JSON reporter, redirect output to a file or stdout
        const { stdout } = await execPromise(`npx playwright test ${testPath} --reporter=json`, {
            cwd,
            // Playwright might timeout or output a huge json, increasing buffer
            maxBuffer: 1024 * 1024 * 10 
        });
        
        return JSON.parse(stdout);
    } catch (error: any) {
        // Playwright commands throw an error if the test fails (exit code 1)
        // However, the JSON report is still written to stdout.
        if (error.stdout) {
             try {
                 return JSON.parse(error.stdout);
             } catch (e) {
                 throw new Error("Failed to parse Playwright JSON output on test failure.");
             }
        }
        throw new Error("Failed to execute testRunner: " + error.message);
    }
}
