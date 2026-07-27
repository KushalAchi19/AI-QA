import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const DB_FILE = path.join(__dirname, '..', 'ai-qa.json');

let dbPromise = Promise.resolve();

async function runLocked<T>(op: () => Promise<T>): Promise<T> {
    const next = dbPromise.then(op);
    dbPromise = next.then(() => {}, () => {});
    return next;
}

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

export async function initDb() {
    return runLocked(async () => {
        try {
            if (!fsSync.existsSync(DB_FILE)) {
                const initialDb: Database = { analyses: [] };
                await fs.writeFile(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf-8');
                console.log("📁 Initialized Local JSON database.");
            } else {
                console.log("📁 Local JSON database loaded.");
            }
        } catch (error) {
            console.error("Error initializing local database:", error);
        }
    });
}

export async function createAnalysis(repoUrl: string, clientId: string): Promise<string> {
    return runLocked(async () => {
        const data = await fs.readFile(DB_FILE, 'utf-8');
        const db: Database = JSON.parse(data);
        const newId = uuidv4();
        const newRecord: AnalysisRecord = {
            id: newId,
            client_id: clientId,
            repo_url: repoUrl,
            status: 'STARTED',
            created_at: new Date().toISOString()
        };
        db.analyses.push(newRecord);
        await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
        return newId;
    });
}

export async function updateAnalysis(id: string, updates: Partial<AnalysisRecord>) {
    return runLocked(async () => {
        const data = await fs.readFile(DB_FILE, 'utf-8');
        const db: Database = JSON.parse(data);
        const index = db.analyses.findIndex((a) => a.id === id);
        if (index > -1) {
            db.analyses[index] = { ...db.analyses[index], ...updates };
            await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
        }
    });
}

export async function getAnalyses(clientId?: string): Promise<AnalysisRecord[]> {
    return runLocked(async () => {
        const data = await fs.readFile(DB_FILE, 'utf-8');
        const db: Database = JSON.parse(data);
        let results = db.analyses;
        if (clientId) {
            results = results.filter(a => a.client_id === clientId);
        }
        return results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    });
}

export async function getAnalysisById(id: string): Promise<AnalysisRecord | null> {
    return runLocked(async () => {
        const data = await fs.readFile(DB_FILE, 'utf-8');
        const db: Database = JSON.parse(data);
        return db.analyses.find((a) => a.id === id) || null;
    });
}

export async function deleteAnalysis(id: string) {
    return runLocked(async () => {
        const data = await fs.readFile(DB_FILE, 'utf-8');
        const db: Database = JSON.parse(data);
        const originalCount = db.analyses.length;
        db.analyses = db.analyses.filter((a) => a.id !== id);
        if (db.analyses.length < originalCount) {
            await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
        } else {
            throw new Error("Analysis record not found.");
        }
    });
}
