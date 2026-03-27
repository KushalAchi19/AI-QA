import fs from 'fs';
import path from 'path';

const DB_FILE = path.join(__dirname, '..', 'ai-qa.json');

// Ensure db file exists
export async function initDb() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({ analyses: [] }, null, 2), 'utf-8');
        console.log("Local JSON database initialized.");
    }
}

function readDb() {
    const data = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(data);
}

function writeDb(data: any) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export async function createAnalysis(repoUrl: string) {
    const db = readDb();
    const newId = Date.now(); // Simple ID
    db.analyses.push({
        id: newId,
        repo_url: repoUrl,
        status: 'STARTED',
        created_at: new Date().toISOString()
    });
    writeDb(db);
    return newId;
}

export async function updateAnalysis(id: number, updates: any) {
    const db = readDb();
    const index = db.analyses.findIndex((a: any) => a.id === id);
    if (index > -1) {
        db.analyses[index] = { ...db.analyses[index], ...updates };
        writeDb(db);
    }
}

export async function getAnalyses() {
    const db = readDb();
    return db.analyses.sort((a: any, b: any) => b.id - a.id);
}
