import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { motion, AnimatePresence } from 'framer-motion';

import {
  FileCode, Terminal, Globe, AlertCircle, CheckCircle2,
  ChevronRight, Zap, Copy, Bot, Trash2, ClipboardCheck, Download, Check, XCircle
} from 'lucide-react';
import './index.css';
import { generateClientPDF } from './pdfService';
import ErrorBoundary from './ErrorBoundary';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const prismStyle = {
  'code[class*="language-"]': { color: '#e0e0e0' },
  'pre[class*="language-"]': { background: '#0a0c10' },
  'comment': { color: '#6a737d' },
  'keyword': { color: '#d73a49' },
  'string': { color: '#032f62' }
};

// --- TYPES ---
interface AnalysisRun {
  id: string;
  repo_url: string;
  status: 'STARTED' | 'GENERATING_TESTS' | 'TESTS_GENERATED' | 'RUNNING_TESTS' | 'COMPLETED' | 'FAILED' | 'ANALYSING';
  test_file?: string;
  test_code?: string;
  cicd_code?: string;
  playwright_output?: string;
  created_at: string;
  total_duration?: number;
  framework_signature?: string;
  progressPercent?: number;
  progressDetails?: string;
}

// --- LOGIC UTILITIES ---
const getClientId = (): string => {
  let id = localStorage.getItem('ai-qa-client-id');
  if (!id) {
    id = `cli-${Math.random().toString(36).substring(2, 11)}-${Date.now()}`;
    localStorage.setItem('ai-qa-client-id', id);
  }
  return id;
};

// Highly Intelligent Autonomous Naming System
const getReportTitle = (run: AnalysisRun): string => {
  if (run.repo_url === 'Code Snippet Debugging') {
    if (run.playwright_output) {
      const errorTypeMatch = run.playwright_output.match(/\*\*Error Type\*\*:\s*(.+)/i);
      if (errorTypeMatch && errorTypeMatch[1]) return errorTypeMatch[1].trim().replace(/\*|_|#/g, '');
      const correctedSolutionMatch = run.playwright_output.match(/###\s*1\.\s*(.+)/i);
      if (correctedSolutionMatch && correctedSolutionMatch[1]) return correctedSolutionMatch[1].trim().replace(/[📋🔍💡🖥️✅⚙️*]/g, '').trim();
    }
    return 'Snippet Audit';
  }

  if (run.playwright_output) {
    const bugMatch = run.playwright_output.match(/###\s*(?:Corrected Solution|Security Audit|Diagnostic Results|Error Identification):\s*(.+)/i)
      || run.playwright_output.match(/###\s*1\.\s*Executive Summary\n+([^.#\n]+)/i);
      
    if (bugMatch && bugMatch[1]) {
      const parsed = bugMatch[1].trim().replace(/[📋🔍💡🖥️✅⚙️*]/g, '').trim();
      if (parsed.length > 5 && parsed.length < 35) return parsed;
    }

    const text = run.playwright_output.toLowerCase();
    if (text.includes('race condition')) return 'Async Race Condition';
    if (text.includes('jwt') || text.includes('token')) return 'JWT Authentication Issue';
    if (text.includes('sql injection') || text.includes('injection')) return 'SQL Injection Vulnerability';
    if (text.includes('state mutability') || text.includes('state bug') || text.includes('re-render')) return 'React State Bug';
    if (text.includes('cors')) return 'CORS Security Policy';
    if (text.includes('xss') || text.includes('cross-site')) return 'XSS Vulnerability';
    if (text.includes('rate limit')) return 'Rate Limiter Audit';
    if (text.includes('payment') || text.includes('stripe')) return 'Stripe Payment Gateway';
    if (text.includes('inventory') || text.includes('product')) return 'Inventory Service API';
  }

  if (run.repo_url) {
    const parts = run.repo_url.replace(/\.git$/, '').split('/');
    const lastPart = parts[parts.length - 1];
    if (lastPart && lastPart !== 'Code Snippet Debugging') {
      const formattedName = lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
      return `${formattedName} Audit`;
    }
  }

  return 'Smart Quality Audit';
};

const parseAnalysisMetrics = (run: AnalysisRun) => {
  if (!run.playwright_output) return null;

  if (run.repo_url !== 'Code Snippet Debugging') {
    try {
      const jsonMatch = run.playwright_output.match(/### 🖥️ 5\. Execution Results\n+```json\n([\s\S]*?)```/i);
      if (jsonMatch && jsonMatch[1]) {
        const data = JSON.parse(jsonMatch[1].trim());
        const stats = data.stats || {};
        const passed = stats.expected || 0;
        const failed = stats.unexpected || 0;
        const skipped = (stats.skipped || 0) + (stats.flaky || 0);
        const total = passed + failed + skipped;
        return {
          type: 'playwright',
          total, passed, failed, skipped,
          duration: run.total_duration ? run.total_duration.toFixed(1) : ((stats.duration || 0) / 1000).toFixed(1),
          framework: run.framework_signature || 'Unknown Tech Stack',
          executionLog: data.executionLog || ""
        };
      }
    } catch (e) { return null; }
    return { type: 'playwright', total: 0, passed: 0, failed: 0, skipped: 0, duration: run.total_duration?.toFixed(1) || '0', framework: run.framework_signature || 'Detecting...', executionLog: "" };
  }

  const output = run.playwright_output;
  const errorType = output.match(/\*\*Error Type\*\*:\s*(.+)/i)?.[1]?.trim() || 'Analysis Complete';
  const errorLine = output.match(/\*\*Line Number\*\*:\s*(.+)/i)?.[1]?.trim() || 'N/A';
  return { type: 'snippet', errorType, errorLine, hasFix: output.includes('### 🚀 3.') };
};

export default function App() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const [activeMode, setActiveMode] = useState<'github' | 'snippet'>('snippet');
  const [repoUrl, setRepoUrl] = useState('');
  const [focusArea, setFocusArea] = useState('');
  const [framework, setFramework] = useState<'playwright' | 'cypress' | 'jest'>('playwright');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  
  const [runs, setRuns] = useState<AnalysisRun[]>(() => {
    const localVaultRaw = localStorage.getItem('ai-qa-local-vault');
    return localVaultRaw ? JSON.parse(localVaultRaw) : [];
  });
  
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [repos, setRepos] = useState<any[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>('');
  
  const [isExporting, setIsExporting] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [githubToken, setGithubToken] = useState(localStorage.getItem('ai-qa-github-token') || '');
  useEffect(() => { localStorage.setItem('ai-qa-github-token', githubToken); }, [githubToken]);

  const activeItem = useMemo(() => runs.find(r => r.id === activeItemId) || null, [runs, activeItemId]);
  const metrics = useMemo(() => activeItem ? parseAnalysisMetrics(activeItem) : null, [activeItem]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/analyses?clientId=${getClientId()}`);
      let serverRuns: AnalysisRun[] = [];
      if (res.ok) serverRuns = await res.json();

      let localVault: AnalysisRun[] = JSON.parse(localStorage.getItem('ai-qa-local-vault') || '[]');
      
      serverRuns.forEach(serverRun => {
        if (serverRun.status === 'COMPLETED' || serverRun.status === 'FAILED') {
          const index = localVault.findIndex(v => v.id === serverRun.id);
          if (index > -1) localVault[index] = serverRun;
          else localVault.unshift(serverRun);
        }
      });
      if (localVault.length > 50) localVault = localVault.slice(0, 50);
      localStorage.setItem('ai-qa-local-vault', JSON.stringify(localVault));

      const mergedRuns = [...serverRuns.filter(s => s.status !== 'COMPLETED' && s.status !== 'FAILED')];
      localVault.forEach(vaultRun => {
        if (!mergedRuns.find(m => m.id === vaultRun.id)) mergedRuns.push(vaultRun);
      });
      mergedRuns.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      setRuns(prev => {
        const isSame = prev.length === mergedRuns.length && prev.every((item, i) => 
          item.id === mergedRuns[i].id && item.status === mergedRuns[i].status && item.playwright_output === mergedRuns[i].playwright_output
        );
        return isSame ? prev : mergedRuns;
      });
    } catch (e) { console.error("History fetch error:", e); }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Robust SSE Subscription for Active Runs (Completely replaces polling loop)
  useEffect(() => {
    if (!activeItemId) return;
    const item = runs.find(r => r.id === activeItemId);
    if (!item || item.status === 'COMPLETED' || item.status === 'FAILED') return;

    const eventSource = new EventSource(`${API_URL}/api/analyses/${activeItemId}/stream`);
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setRuns(prev => prev.map(run => run.id === activeItemId ? { 
        ...run, 
        status: data.status, 
        progressPercent: data.percent,
        progressDetails: data.details
      } : run));

      if (data.status === 'COMPLETED' || data.status === 'FAILED') {
        eventSource.close();
        setTimeout(fetchHistory, 1000);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => eventSource.close();
  }, [activeItemId]); // Only binds on activeId change

  useEffect(() => {
    fetch(`${API_URL}/api/user`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => { setUser(data); if (data) fetchRepos(); });
  }, []);

  const fetchRepos = async () => {
    try {
      const res = await fetch(`${API_URL}/api/user/repos`, { credentials: 'include' });
      if (res.ok) setRepos(await res.json());
    } catch (err) { console.error("Failed to fetch repos:", err); }
  };

  const handleExportPDF = async () => {
    const element = document.getElementById('report-container');
    if (!element || isExporting || !activeItem) return;
    setIsExporting(true);
    try { await generateClientPDF(activeItem); } 
    catch (err) { alert("Failed to generate PDF. Please try again."); } 
    finally { setIsExporting(false); }
  };

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (activeMode === 'github') {
        const res = await fetch(`${API_URL}/api/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repoUrl, clientId: getClientId(), framework, githubToken, focusArea })
        });
        if (!res.ok) throw new Error("Analysis failed to start");
        const data = await res.json();
        if (data && data.analysisId) {
          // Immediately append the new uncompleted run to list, which will trigger SSE
          setRuns(prev => [{ id: data.analysisId, repo_url: repoUrl, status: 'STARTED', created_at: new Date().toISOString() }, ...prev]);
          setActiveItemId(data.analysisId);
        }
        setRepoUrl(''); setFocusArea('');
      } else {
        if (!selectedFile) return;
        const code = await selectedFile.text();
        const res = await fetch(`${API_URL}/api/analyze-snippet`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, clientId: getClientId(), fileName: selectedFile.name })
        });
        if (!res.ok) throw new Error("Snippet check failed");
        const data = await res.json();
        if (data && data.analysisId) {
          setRuns(prev => [{ id: data.analysisId, repo_url: 'Code Snippet Debugging', status: 'ANALYSING', created_at: new Date().toISOString() }, ...prev]);
          setActiveItemId(data.analysisId);
        }
        setSelectedFile(null);
      }
    } catch (err: any) { alert(err.message); } 
    finally { setLoading(false); }
  };

  const cancelAnalysis = async (runId: string) => {
    try {
      await fetch(`${API_URL}/api/analyses/${runId}/cancel`, { method: 'POST' });
      fetchHistory();
    } catch (e) {
      console.error("Cancellation failed", e);
    }
  };

  const renderWelcomeDashboard = () => (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="h-full flex flex-col items-center justify-center p-6 text-center max-w-lg mx-auto my-auto gap-6">
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/10 to-indigo-500/10 flex items-center justify-center border border-cyan-500/15 relative shadow-2xl">
        <Bot size={24} className="text-cyan-400 animate-pulse" />
        <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
      </div>
      <div>
        <h3 className="text-xs font-black text-white uppercase tracking-wider mb-1">Ready for Smart Audit Runs</h3>
        <p className="text-[10px] text-slate-400 leading-relaxed max-w-sm mx-auto">Upload a local file snippet or select a Github repository workspace to start our autonomous auditing agents.</p>
      </div>
    </motion.div>
  );

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-200 flex overflow-hidden font-sans text-[12px]">
      <aside className="w-[200px] bg-[#0c111d] border-r border-white/5 flex flex-col p-2 hidden md:flex shrink-0 z-10 shadow-2xl">
        <div className="flex items-center gap-1.5 mb-4 px-1 mt-1">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center shadow-md">
            <Bot size={13} color="white" strokeWidth={2.5} />
          </div>
          <h1 className="font-bold text-[13px] tracking-tight text-white leading-tight">AI QA Agent</h1>
        </div>
        <nav className="flex flex-col gap-0.5 flex-1">
          <button
            onClick={() => { setActiveMode('snippet'); setActiveItemId(null); }}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md font-semibold text-[11px] transition-all ${activeMode === 'snippet' ? 'bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/30 shadow-lg' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <FileCode size={12} /> Snippet Diagnostics
          </button>
          <button
            onClick={() => { setActiveMode('github'); setActiveItemId(null); }}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md font-semibold text-[11px] transition-all ${activeMode === 'github' ? 'bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/30 shadow-lg' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <Globe size={12} /> Repository Engine
          </button>
        </nav>
        <div className="mt-auto pt-4 border-t border-white/5 space-y-4">
          <button onClick={() => setShowPricing(true)} className="w-full bg-gradient-to-br from-amber-500/10 to-orange-500/10 hover:from-amber-500/20 border border-amber-500/30 p-3 rounded-xl transition-all group text-left relative overflow-hidden">
            <div className="flex items-center gap-1.5 mb-1"><span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Founder Edition</span><Zap size={8} className="text-amber-500 fill-amber-500 animate-pulse" /></div>
            <p className="text-[8px] text-slate-400 font-medium leading-tight">Unlock Private Repos & Agents.</p>
          </button>
        </div>
      </aside>

      <main className="flex-1 p-4 flex flex-col gap-4 h-screen overflow-y-auto">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-extrabold text-white tracking-tight">{activeMode === 'github' ? 'Autonomous QA Platform' : 'Code Diagnostic Engine'}</h2>
            <p className="text-[11px] text-slate-400 font-medium">{activeMode === 'github' ? 'Fast, parallelized test generation and code diagnostics.' : 'Analyze snippets for logic bugs and edge cases.'}</p>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end">
                  <span className="text-[11px] font-bold text-slate-300">{user.displayName || user.username}</span>
                  <button onClick={() => window.location.href = `${API_URL}/auth/logout`} className="text-[9px] font-black text-slate-500 uppercase hover:text-rose-400">Logout</button>
                </div>
                <img src={user.photos?.[0]?.value} className="w-8 h-8 rounded-full border border-white/10" alt="avatar" />
              </div>
            ) : (
              <button onClick={() => window.location.href = `${API_URL}/auth/github`} className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md px-3 py-1.5 transition-all active:scale-95">
                <Globe size={14} className="text-slate-400" /><span className="text-[10px] font-bold text-slate-300">Login with GitHub</span>
              </button>
            )}
          </div>
        </header>

        <section className="bg-white/5 rounded-xl p-4 border border-white/10 shadow-2xl backdrop-blur-sm z-20">
          <form onSubmit={handleStart} className="flex flex-col gap-3">
            {activeMode === 'github' ? (
              <div className="flex flex-col gap-3">
                {user && repos.length > 0 && (
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none"><FileCode size={14} className="text-slate-500" /></div>
                    <select value={selectedRepo} onChange={(e) => { setSelectedRepo(e.target.value); setRepoUrl(e.target.value); }} className="w-full bg-black/40 border border-white/10 rounded-lg py-2.5 pl-9 pr-4 text-[11px] focus:outline-none focus:border-cyan-500/50 transition-all font-medium text-slate-200 appearance-none cursor-pointer hover:bg-white/5">
                      <option value="">Select from your repositories...</option>
                      {repos.map(r => <option key={r.id} value={r.html_url}>{r.private ? '🔒' : '🌐'} {r.full_name}</option>)}
                    </select>
                  </div>
                )}
                
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                    <input type="text" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} placeholder="Or paste any public GitHub URL..." className="w-full bg-black/40 border border-white/10 rounded-lg py-2.5 pl-9 pr-4 text-[11px] focus:outline-none focus:border-cyan-500/50 transition-all font-medium placeholder:text-slate-600" />
                  </div>
                  <button type="submit" disabled={loading} className="bg-gradient-to-br from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:opacity-50 text-white font-black text-[10px] uppercase tracking-widest px-6 rounded-lg transition-all shadow-lg active:scale-95 flex items-center gap-2">
                    {loading ? 'Initializing...' : 'Run Engine'}
                    <Zap size={12} fill="white" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 relative">
                <div onClick={() => !loading && fileInputRef.current?.click()} className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 transition-all group ${loading ? 'border-cyan-500/50 bg-cyan-500/5 cursor-wait' : 'border-white/10 cursor-pointer hover:bg-white/5 hover:border-white/20'}`}>
                  <input type="file" ref={fileInputRef} onChange={(e) => e.target.files?.[0] && setSelectedFile(e.target.files[0])} className="hidden" />
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${loading ? 'bg-cyan-500/20 animate-pulse' : 'bg-white/5 group-hover:scale-110 shadow-lg'}`}>
                    <CheckCircle2 className={loading ? 'text-cyan-400' : 'text-slate-500 group-hover:text-emerald-400'} size={24} />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-white mb-0.5">{loading ? <span className="text-cyan-400 animate-pulse">Initializing Diagnostic...</span> : (selectedFile ? <span className="text-emerald-400">{selectedFile.name} Ready</span> : <><span className="text-cyan-400">Click to choose a file</span> or drop</>)}</p>
                  </div>
                </div>
                <div className="absolute right-0 -bottom-14 flex justify-end">
                  <button type="submit" disabled={loading || !selectedFile} className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black text-[10px] uppercase tracking-widest py-2 px-5 rounded-lg transition-all shadow-lg flex items-center gap-2 active:scale-95">
                    <CheckCircle2 size={14} className="text-emerald-950" /> Diagnose Code
                  </button>
                </div>
              </div>
            )}
          </form>
        </section>

        {activeMode === 'snippet' && <div className="h-10 shrink-0" />}

        <section className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0 relative z-10">
          <div className="w-[240px] flex flex-col gap-3 overflow-y-auto pr-1 custom-scrollbar shrink-0">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Audit History</h3>
            
            <AnimatePresence>
              {(() => {
                const filteredRuns = runs.filter(run => activeMode === 'snippet' ? run.repo_url === 'Code Snippet Debugging' : run.repo_url !== 'Code Snippet Debugging');
                const groups: { [key: string]: AnalysisRun[] } = {};
                filteredRuns.forEach(run => {
                  if (!groups[run.repo_url]) groups[run.repo_url] = [];
                  groups[run.repo_url].push(run);
                });

                return Object.entries(groups).map(([repoUrl, repoRuns]) => {
                  const repoName = repoUrl === 'Code Snippet Debugging' ? 'Snippets' : (repoUrl.split('/').pop()?.replace('.git', '') || 'Project');
                  
                  return (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={repoUrl} className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 px-1 mb-1 mt-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500/50 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter truncate">{repoName}</span>
                      </div>
                      
                      {repoRuns.map(run => {
                        const title = getReportTitle(run);
                        const isRunning = run.status !== 'COMPLETED' && run.status !== 'FAILED';
                        return (
                          <motion.div
                            layout
                            key={run.id} onClick={() => setActiveItemId(run.id)}
                            className={`cursor-pointer rounded-xl p-3 border flex flex-col gap-1.5 transition-all group/item shadow-lg overflow-hidden relative ${activeItemId === run.id ? 'bg-white/10 border-white/20' : 'bg-[#131a28] border-white/5 hover:border-white/10'}`}
                          >
                            {isRunning && <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent w-[200%] animate-[shimmer_2s_infinite]" />}
                            
                            <div className="flex justify-between items-start w-full gap-2 relative z-10">
                              <span className="text-[10.5px] text-white font-bold truncate max-w-[85%] group-hover/item:text-cyan-400 transition-colors" title={title}>{title}</span>
                              <button onClick={(e) => { 
                                e.stopPropagation(); 
                                fetch(`${API_URL}/api/analyses/${run.id}`, { method: 'DELETE' }).then(() => { fetchHistory(); }); 
                              }} className="text-slate-500 opacity-0 group-hover/item:opacity-100 hover:text-red-400 transition-all shrink-0"><Trash2 size={12} /></button>
                            </div>
                            
                            <div className="flex items-center justify-between w-full mt-1 relative z-10">
                              <div className={`text-[8px] uppercase font-black px-2 py-0.5 rounded-full border self-start flex items-center gap-1.5 ${
                                run.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                run.status === 'FAILED' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                'bg-cyan-500/10 text-cyan-400 border-cyan-500/30 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                              }`}>
                                {isRunning && <span className="w-1 h-1 rounded-full bg-cyan-400 animate-pulse" />}
                                {run.status.replace('_', ' ')}
                              </div>
                              {run.framework_signature && <span className="text-[8px] text-slate-500 font-bold tracking-tight">{run.framework_signature}</span>}
                            </div>

                            {isRunning && run.progressPercent !== undefined && (
                              <div className="w-full bg-black/50 rounded-full h-1 mt-1 overflow-hidden relative z-10 border border-white/5">
                                <motion.div className="bg-gradient-to-r from-cyan-500 to-indigo-500 h-1" initial={{ width: 0 }} animate={{ width: `${run.progressPercent}%` }} transition={{ duration: 0.5 }} />
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  );
                });
              })()}
            </AnimatePresence>
          </div>

          <div className="flex-1 glass-panel border border-white/10 rounded-2xl p-6 overflow-y-auto relative flex flex-col min-h-0 shadow-2xl bg-[#0e1420]/80">
            <ErrorBoundary fallback={
              <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4">
                <AlertCircle size={40} className="text-amber-500" />
                <p className="text-xs font-bold uppercase tracking-widest text-slate-300">Render Engine Fault</p>
                <button onClick={() => window.location.reload()} className="text-[10px] bg-white/5 px-4 py-2 rounded-lg hover:bg-white/10 transition-all border border-white/10 font-bold uppercase tracking-widest text-white">Restart Engine</button>
              </div>
            }>
              
            {!activeItem ? renderWelcomeDashboard() : (
              <div className="flex flex-col relative h-full">
                
                {/* ACTIVE RUNNING SKELETON & PROGRESS CARD */}
                {activeItem.status !== 'COMPLETED' && activeItem.status !== 'FAILED' && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0e1420]/90 backdrop-blur-md rounded-xl border border-cyan-500/20 shadow-2xl p-8">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center shadow-[0_0_40px_rgba(6,182,212,0.3)] mb-8 border border-white/10">
                      <Bot size={32} className="text-white animate-pulse" />
                    </div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest mb-3 text-center">AI Diagnostics Engine Active</h3>
                    <div className="w-full max-w-md bg-black/40 rounded-xl border border-white/10 p-5 shadow-inner">
                      <div className="flex justify-between items-end mb-2">
                        <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">{activeItem.status.replace('_', ' ')}</span>
                        <span className="text-xs font-bold text-white">{activeItem.progressPercent || 15}%</span>
                      </div>
                      <div className="w-full bg-black/60 rounded-full h-2 mb-3 overflow-hidden border border-white/5">
                        <motion.div className="bg-gradient-to-r from-cyan-400 via-indigo-500 to-cyan-400 h-2 bg-[length:200%_100%] animate-[gradient_2s_linear_infinite]" initial={{ width: '0%' }} animate={{ width: `${activeItem.progressPercent || 15}%` }} transition={{ duration: 0.5, ease: "easeOut" }} />
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium text-center h-4">{activeItem.progressDetails || 'Running static analysis and fetching contexts...'}</p>
                    </div>
                    
                    <button onClick={() => cancelAnalysis(activeItem.id)} className="mt-8 flex items-center gap-2 text-[10px] font-black text-rose-500 uppercase tracking-widest px-5 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 transition-all active:scale-95 shadow-lg">
                      <XCircle size={14} /> Cancel Execution
                    </button>
                  </motion.div>
                )}

                {/* ERROR STATE */}
                {activeItem.status === 'FAILED' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-20 flex flex-col items-center justify-center p-8 bg-[#0e1420]/95 backdrop-blur-md rounded-xl text-center">
                    <AlertCircle size={48} className="text-rose-500 mb-6 drop-shadow-[0_0_15px_rgba(244,63,94,0.4)]" />
                    <h4 className="text-sm font-black text-white uppercase tracking-wider mb-2">Analysis Aborted</h4>
                    <p className="text-xs text-slate-400 max-w-sm mb-6">The task failed or was cancelled by the user. Temp files and processes have been purged.</p>
                    {activeItem.playwright_output && (
                      <div className="w-full max-w-lg bg-black/50 border border-rose-500/20 rounded-xl p-4 font-mono text-[10px] text-rose-300 text-left overflow-y-auto max-h-40 custom-scrollbar shadow-inner">
                        <span className="block mb-2 text-[9px] font-black uppercase text-rose-500/70">Trace:</span>
                        {activeItem.playwright_output}
                      </div>
                    )}
                  </motion.div>
                )}

                {/* SUCCESS REPORT RENDERING (Stays visible underneath skeletons if updating) */}
                <motion.div className={`flex flex-col gap-4 ${activeItem.status !== 'COMPLETED' ? 'opacity-20 pointer-events-none' : 'opacity-100'}`} id="report-container" initial={{ opacity: 0, y: 20 }} animate={{ opacity: activeItem.status !== 'COMPLETED' ? 0.2 : 1, y: 0 }}>
                  <header className="flex items-center justify-between border-b border-white/5 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center border border-cyan-500/20 shadow-lg">
                        <Terminal size={16} className="text-cyan-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-white">{getReportTitle(activeItem)}</h3>
                        <p className="text-[10px] text-slate-500 font-medium">Final Audit Diagnostics</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={handleExportPDF} disabled={isExporting} className="flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20 shadow-lg">
                        <Download size={14} className={isExporting ? "animate-bounce" : ""} /> {isExporting ? 'Exporting...' : 'Export PDF'}
                      </button>
                    </div>
                  </header>

                  {/* Dynamic Metrics Panel */}
                  {metrics && (
                    <div className="grid grid-cols-3 gap-3 shrink-0">
                      {metrics.type === 'snippet' ? (
                        <>
                          <div className="bg-rose-500/5 border border-rose-500/10 p-3 rounded-xl shadow-lg flex flex-col justify-center">
                            <span className="block text-[8px] text-rose-400/70 uppercase font-black tracking-widest mb-1">Detected Flaw</span>
                            <span className="text-sm font-black text-rose-400 truncate">{metrics.errorType}</span>
                          </div>
                          <div className="bg-amber-500/5 border border-amber-500/10 p-3 rounded-xl shadow-lg flex flex-col justify-center">
                            <span className="block text-[8px] text-amber-500/70 uppercase font-black tracking-widest mb-1">Line Number</span>
                            <span className="text-sm font-black text-amber-400">{metrics.errorLine}</span>
                          </div>
                          <div className="bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-xl shadow-lg flex flex-col justify-center">
                            <span className="block text-[8px] text-emerald-400/70 uppercase font-black tracking-widest mb-1">Engine Status</span>
                            <span className="text-sm font-black text-emerald-400">{metrics.hasFix ? 'Corrected' : 'Analyzed'}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex gap-3 w-full col-span-3">
                          <div className="flex-1 bg-black/40 border border-white/5 p-3 rounded-xl shadow-lg">
                            <span className="block text-[8px] text-slate-500 uppercase font-black tracking-widest mb-1">Execution Time</span>
                            <span className="text-sm font-black text-slate-200">{metrics.duration}s</span>
                          </div>
                          <div className="flex-1 bg-black/40 border border-white/5 p-3 rounded-xl shadow-lg">
                            <span className="block text-[8px] text-slate-500 uppercase font-black tracking-widest mb-1">Architecture</span>
                            <span className="text-sm font-black text-cyan-400">{metrics.framework}</span>
                          </div>
                          <div className="flex-1 bg-emerald-500/5 border border-emerald-500/10 p-3 rounded-xl shadow-lg">
                            <span className="block text-[8px] text-emerald-500/70 uppercase font-black tracking-widest mb-1">Verification</span>
                            <span className="text-sm font-black text-emerald-400">Passed</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Prose Report Rendering */}
                  {activeItem.playwright_output && (
                    <div className="prose-report custom-scrollbar text-[13px] py-4">
                      <ReactMarkdown
                        components={{
                          h1: ({ children }) => <h1 className="text-[15px] font-black text-white uppercase mt-4 mb-3 pb-2 border-b border-white/5 tracking-wider">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-[14px] font-extrabold text-cyan-400 mt-8 mb-2 flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.8)]" />{children}</h2>,
                          h3: ({ children }) => {
                            const text = String(children);
                            if (text.toLowerCase().includes("corrected solution")) {
                              return (
                                <div className="mt-8 mb-4 flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                                    <CheckCircle2 size={16} className="text-emerald-400" />
                                  </div>
                                  <span className="text-[14px] font-black text-emerald-400 uppercase tracking-[0.15em]">{children}</span>
                                </div>
                              );
                            }
                            return <h3 className="text-[12px] font-black text-indigo-300 mt-8 mb-3 uppercase tracking-widest border-l-2 border-indigo-500/50 pl-3">{children}</h3>;
                          },
                          code: ({ node, inline, className, children, ...props }: any) => {
                            const match = /language-(\w+)/.exec(className || '');
                            const codeString = String(children).replace(/\n$/, '');
                            const isFixBlock = !node.position?.start.line || node.position?.start.line < 30;

                            if (!inline && match) {
                              return (
                                <div className={`rounded-xl overflow-hidden my-6 border shadow-2xl ${isFixBlock ? 'border-emerald-500/20 bg-[#0d1414]/90' : 'border-white/10 bg-[#0d1117]/80'}`}>
                                  <div className={`px-5 py-3 flex items-center justify-between border-b ${isFixBlock ? 'border-emerald-500/20 bg-emerald-500/[0.05]' : 'border-white/5 bg-black/40'}`}>
                                    <div className="flex items-center gap-3">
                                      {isFixBlock ? <CheckCircle2 size={14} className="text-emerald-400" /> : <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{match[1]} payload</div>}
                                    </div>
                                    <button onClick={() => copyToClipboard(codeString, codeString.substring(0, 20))} className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${copiedId === codeString.substring(0, 20) ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 hover:bg-white/10 text-slate-400'}`}>
                                      {copiedId === codeString.substring(0, 20) ? <ClipboardCheck size={12} /> : <Copy size={12} />}
                                    </button>
                                  </div>
                                  <SyntaxHighlighter {...props} children={codeString} style={codeTheme as any} language={match[1]} PreTag="div" customStyle={{ margin: 0, padding: '1.25rem', fontSize: '11.5px', lineHeight: '1.7', background: 'transparent' }} />
                                </div>
                              );
                            }
                            return <code className="bg-white/10 px-1.5 py-0.5 rounded text-cyan-300 font-mono text-xs border border-white/5" {...props}>{children}</code>
                          }
                        }}
                      >
                        {activeItem.playwright_output}
                      </ReactMarkdown>
                    </div>
                  )}

                  {activeItem.test_code && (
                    <div className="mt-8 border-t border-white/5 pt-8">
                      <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2"><div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" /> Playwright Verification Suite</h4>
                      <div className="rounded-xl overflow-hidden border border-white/10 shadow-2xl bg-[#0d1117]/80">
                        <SyntaxHighlighter children={activeItem.test_code} language="typescript" style={codeTheme as any} PreTag="div" customStyle={{ margin: 0, padding: '1.5rem', fontSize: '11.5px', lineHeight: '1.7', background: 'transparent' }} />
                      </div>
                    </div>
                  )}
                </motion.div>
              </div>
            )}
            </ErrorBoundary>
          </div>
        </section>

        {showPricing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="max-w-2xl w-full bg-[#0c111d] border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex">
              <div className="flex-1 p-8 border-r border-white/5 bg-gradient-to-br from-white/[0.02] to-transparent">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-6 border border-indigo-500/20"><Bot size={24} className="text-indigo-400" /></div>
                <h3 className="text-2xl font-black text-white mb-2">Scale Architecture Audits</h3>
                <p className="text-slate-400 text-[11px] mb-6 leading-relaxed">Upgrade to unlock unlimited AI QA diagnostic pipelines and seamless GitHub CI integrations.</p>
                <ul className="space-y-3">
                  {['Autonomous Playwright Generation', 'Smart AST Prioritization', 'Agentic Healing Loops', 'Private Security Audits'].map((f, i) => (
                    <li key={i} className="flex items-center gap-3 text-slate-300 text-[11px] font-bold"><div className="w-4 h-4 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20"><Check size={10} className="text-emerald-500" /></div>{f}</li>
                  ))}
                </ul>
              </div>
              <div className="w-[280px] bg-black/40 p-8 flex flex-col justify-center gap-6 text-center">
                <div>
                  <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-2 block">Founder Edition</span>
                  <div className="flex items-baseline justify-center gap-1"><span className="text-4xl font-black text-white">$49</span><span className="text-slate-500 text-xs">/mo</span></div>
                </div>
                <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-3 rounded-xl transition-all shadow-lg text-xs uppercase tracking-widest active:scale-95">Start 14-Day Trial</button>
                <button onClick={() => setShowPricing(false)} className="text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-colors mt-2">Dismiss</button>
              </div>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}

const codeTheme = {
  'comment': { color: '#6a737d', fontStyle: 'italic' },
  'keyword': { color: '#ff7b72', fontWeight: 'bold' },
  'string': { color: '#a5d6ff' },
  'function': { color: '#d2a8ff', fontWeight: 'bold' },
  'number': { color: '#79c0ff' },
  'operator': { color: '#79c0ff' },
  'class-name': { color: '#ff7b72', fontWeight: 'bold' },
  'constant': { color: '#79c0ff' },
  'property': { color: '#79c0ff' },
  'boolean': { color: '#79c0ff' },
  'code[class*="language-"]': { color: '#c9d1d9', fontFamily: '"JetBrains Mono", monospace' }
};
