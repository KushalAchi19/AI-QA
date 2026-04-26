import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const DB_FILE = path.join(__dirname, '..', 'ai-qa.json');

export interface AnalysisRecord {
    id: string;
    client_id: string;
    repo_url: string;
    status: 'STARTED' | 'GENERATING_TESTS' | 'TESTS_GENERATED' | 'RUNNING_TESTS' | 'COMPLETED' | 'FAILED' | 'ANALYSING';
    created_at: string;
    test_file?: string;
    test_code?: string;
    cicd_code?: string;
    playwright_output?: string;
    total_duration?: number;
    framework_signature?: string;
}

interface Database {
    analyses: AnalysisRecord[];
}

// Ensure db file exists
export async function initDb() {
    try {
        if (!fsSync.existsSync(DB_FILE)) {
            const initialDb: Database = { analyses: [] };
            await fs.writeFile(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf-8');
            console.log("Local JSON database initialized.");
        }
    } catch (error) {
        console.error("Error initializing database:", error);
        throw new Error("Failed to initialize database.");
    }
}

async function readDb(): Promise<Database> {
    try {
        const data = await fs.readFile(DB_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error("Error reading database:", error);
        return { analyses: [] };
    }
}

async function writeDb(data: Database) {
    try {
        await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
        console.error("Error writing to database:", error);
        throw new Error("Failed to save data.");
    }
}

export async function createAnalysis(repoUrl: string, clientId: string): Promise<string> {
    const db = await readDb();
    const newId = uuidv4();
    const newRecord: AnalysisRecord = {
        id: newId,
        client_id: clientId,
        repo_url: repoUrl,
        status: 'STARTED',
        created_at: new Date().toISOString()
    };
    db.analyses.push(newRecord);
    await writeDb(db);
    return newId;
}

export async function updateAnalysis(id: string, updates: Partial<AnalysisRecord>) {
    const db = await readDb();
    const index = db.analyses.findIndex((a) => a.id === id);
    if (index > -1) {
        db.analyses[index] = { ...db.analyses[index], ...updates };
        await writeDb(db);
    }
}

export async function getAnalyses(clientId?: string): Promise<AnalysisRecord[]> {
    const db = await readDb();
    let results = db.analyses;
    if (clientId) {
        results = results.filter(a => a.client_id === clientId);
    }
    return results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function deleteAnalysis(id: string) {
    const db = await readDb();
    const originalCount = db.analyses.length;
    db.analyses = db.analyses.filter((a) => a.id !== id);
    if (db.analyses.length < originalCount) {
        await writeDb(db);
    } else {
        throw new Error("Analysis record not found.");
    }
}
