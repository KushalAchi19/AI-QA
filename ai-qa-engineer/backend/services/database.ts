import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import fsSync from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

// Initialize Supabase Client
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;
let useSupabase = !!supabase;

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
    if (useSupabase && supabase) {
        try {
            console.log("🔍 Verifying Supabase database connection...");
            const { error } = await supabase.from('analyses').select('id').limit(1);
            if (error) {
                console.error("⚠️ Supabase connection failed (Table missing or invalid config). Falling back to Local JSON database. Error:", error.message);
                useSupabase = false;
            } else {
                console.log("🚀 Supabase Engine Connected successfully (Production Mode)");
                return;
            }
        } catch (err: any) {
            console.error("⚠️ Supabase connection threw exception. Falling back to Local JSON database. Error:", err.message || err);
            useSupabase = false;
        }
    }
    
    try {
        if (!fsSync.existsSync(DB_FILE)) {
            const initialDb: Database = { analyses: [] };
            await fs.writeFile(DB_FILE, JSON.stringify(initialDb, null, 2), 'utf-8');
            console.log("⚠️ Initialized Local JSON database for fallback/development.");
        } else {
            console.log("📁 Local JSON database loaded for fallback/development.");
        }
    } catch (error) {
        console.error("Error initializing local database:", error);
    }
}

export async function createAnalysis(repoUrl: string, clientId: string): Promise<string> {
    if (useSupabase && supabase) {
        try {
            const { data, error } = await supabase
                .from('analyses')
                .insert([{ repo_url: repoUrl, client_id: clientId, status: 'STARTED' }])
                .select()
                .single();
            
            if (error) throw new Error(error.message);
            return data.id;
        } catch (err: any) {
            console.error("⚠️ Supabase insert failed, falling back to local database. Error:", err.message || err);
        }
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
    if (useSupabase && supabase) {
        try {
            const { error } = await supabase
                .from('analyses')
                .update(updates)
                .eq('id', id);
            
            if (error) throw new Error(error.message);
            return;
        } catch (err: any) {
            console.error(`⚠️ Supabase update failed for ${id}, falling back to local database. Error:`, err.message || err);
        }
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
    if (useSupabase && supabase) {
        try {
            let query = supabase.from('analyses').select('*');
            if (clientId) query = query.eq('client_id', clientId);
            
            const { data, error } = await query.order('created_at', { ascending: false });
            if (error) throw new Error(error.message);
            return data as AnalysisRecord[];
        } catch (err: any) {
            console.error("⚠️ Supabase fetch failed, falling back to local database. Error:", err.message || err);
        }
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
    if (useSupabase && supabase) {
        try {
            const { data, error } = await supabase
                .from('analyses')
                .select('*')
                .eq('id', id)
                .single();
            
            if (error) throw new Error(error.message);
            return data as AnalysisRecord;
        } catch (err: any) {
            console.error(`⚠️ Supabase fetch by ID failed for ${id}, falling back to local database. Error:`, err.message || err);
        }
    }

    // Local Fallback
    const data = await fs.readFile(DB_FILE, 'utf-8');
    const db: Database = JSON.parse(data);
    return db.analyses.find((a) => a.id === id) || null;
}

export async function deleteAnalysis(id: string) {
    if (useSupabase && supabase) {
        try {
            const { error } = await supabase
                .from('analyses')
                .delete()
                .eq('id', id);
            
            if (error) throw new Error(error.message);
            return;
        } catch (err: any) {
            console.error(`⚠️ Supabase delete failed for ${id}, falling back to local database. Error:`, err.message || err);
        }
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


