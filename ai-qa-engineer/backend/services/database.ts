import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

// Initialize Supabase Client
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

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

// Fallback logic for Local Development if Supabase is not configured
interface Database {
    analyses: AnalysisRecord[];
}

export async function initDb() {
    if (supabase) {
        console.log("🚀 Supabase Engine Connected (Production Mode)");
        return;
    }
    
    try {
        if (!fsSync.existsSync(DB_FILE)) {
            const initialDb: Database = { analyses: [] };
            await fs.writeFile(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf-8');
            console.log("⚠️ Supabase not found. Initialized Local JSON database for development.");
        }
    } catch (error) {
        console.error("Error initializing database:", error);
    }
}

export async function createAnalysis(repoUrl: string, clientId: string): Promise<string> {
    if (supabase) {
        const { data, error } = await supabase
            .from('analyses')
            .insert([{ repo_url: repoUrl, client_id: clientId, status: 'STARTED' }])
            .select()
            .single();
        
        if (error) throw new Error(`Supabase Insert Error: ${error.message}`);
        return data.id;
    }

    // Local Fallback
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
}

export async function updateAnalysis(id: string, updates: Partial<AnalysisRecord>) {
    if (supabase) {
        const { error } = await supabase
            .from('analyses')
            .update(updates)
            .eq('id', id);
        
        if (error) console.error(`Supabase Update Error for ${id}: ${error.message}`);
        return;
    }

    // Local Fallback
    const data = await fs.readFile(DB_FILE, 'utf-8');
    const db: Database = JSON.parse(data);
    const index = db.analyses.findIndex((a) => a.id === id);
    if (index > -1) {
        db.analyses[index] = { ...db.analyses[index], ...updates };
        await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    }
}

export async function getAnalyses(clientId?: string): Promise<AnalysisRecord[]> {
    if (supabase) {
        let query = supabase.from('analyses').select('*');
        if (clientId) query = query.eq('client_id', clientId);
        
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw new Error(`Supabase Fetch Error: ${error.message}`);
        return data as AnalysisRecord[];
    }

    // Local Fallback
    const data = await fs.readFile(DB_FILE, 'utf-8');
    const db: Database = JSON.parse(data);
    let results = db.analyses;
    if (clientId) {
        results = results.filter(a => a.client_id === clientId);
    }
    return results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function getAnalysisById(id: string): Promise<AnalysisRecord | null> {
    if (supabase) {
        const { data, error } = await supabase
            .from('analyses')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) return null;
        return data as AnalysisRecord;
    }

    // Local Fallback
    const data = await fs.readFile(DB_FILE, 'utf-8');
    const db: Database = JSON.parse(data);
    return db.analyses.find((a) => a.id === id) || null;
}

export async function deleteAnalysis(id: string) {
    if (supabase) {
        const { error } = await supabase
            .from('analyses')
            .delete()
            .eq('id', id);
        
        if (error) throw new Error(`Supabase Delete Error: ${error.message}`);
        return;
    }

    // Local Fallback
    const data = await fs.readFile(DB_FILE, 'utf-8');
    const db: Database = JSON.parse(data);
    const originalCount = db.analyses.length;
    db.analyses = db.analyses.filter((a) => a.id !== id);
    if (db.analyses.length < originalCount) {
        await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
    } else {
        throw new Error("Analysis record not found.");
    }
}

