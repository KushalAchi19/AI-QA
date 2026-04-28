import { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
// Use a more stable style import or a local style object
const prismStyle = {
  'code[class*="language-"]': { color: '#e0e0e0' },
  'pre[class*="language-"]': { background: '#0a0c10' },
  'comment': { color: '#6a737d' },
  'keyword': { color: '#d73a49' },
  'string': { color: '#032f62' }
};

import {
  FileCode, Terminal, Globe, AlertCircle, CheckCircle2,
  ChevronRight, Zap, Copy, Bot, Trash2, ClipboardCheck, Download, Lock, Check
} from 'lucide-react';
import './index.css';
import { generatePremiumPDFHtml } from './pdfTemplate';
import { generateClientPDF } from './pdfService';
import ErrorBoundary from './ErrorBoundary';

const API_URL = import.meta.env.VITE_API_URL;

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
}

// --- LOGIC UTILITIES ---
const extractCodeSnippet = (markdown: string) => {
  const regex = /### 1\. Corrected Solution\n+```[a-z]*\n([\s\S]*?)```/i;
  const match = markdown.match(regex);
  return match ? match[1].trim() : null;
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
        const score = total > 0 ? Math.round((passed / total) * 100) : 0;
        return {
          type: 'playwright',
          total,
          passed,
          failed,
          skipped,
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
  return {
    type: 'snippet',
    errorType,
    errorLine,
    hasFix: output.includes('### 🚀 3.')
  };
};

// --- APP COMPONENT ---

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
  const [runs, setRuns] = useState<AnalysisRun[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [repos, setRepos] = useState<any[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>('');
  
  // Check auth state on mount
  useEffect(() => {
    fetch(`${API_URL}/api/user`, { credentials: 'include' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        setUser(data);
        if (data) fetchRepos();
      });
  }, []);

  const fetchRepos = async () => {
    try {
      const res = await fetch(`${API_URL}/api/user/repos`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setRepos(data);
      }
    } catch (err) {
      console.error("Failed to fetch repos:", err);
    }
  };

  const handleRepoSelect = (url: string) => {
    setSelectedRepo(url);
    setRepoUrl(url);
  };

  const [isExporting, setIsExporting] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [githubToken, setGithubToken] = useState(localStorage.getItem('ai-qa-github-token') || '');
  const [showTokenInput, setShowTokenInput] = useState(false);

  useEffect(() => {
    localStorage.setItem('ai-qa-github-token', githubToken);
  }, [githubToken]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const activeItem = useMemo(() => runs.find(r => r.id === activeItemId) || null, [runs, activeItemId]);
  
  const metrics = useMemo(() => {
    if (!activeItem) return null;
    const m = parseAnalysisMetrics(activeItem);
    // Only run the live timer if the backend hasn't saved a total_duration yet
    if (m && m.type === 'playwright' && !activeItem.total_duration && activeItem.status !== 'COMPLETED' && activeItem.status !== 'FAILED') {
      const start = new Date(activeItem.created_at).getTime();
      m.duration = ((now - start) / 1000).toFixed(1);
    }
    return m;
  }, [activeItem, now]);

  const handleExportPDF = async () => {
    const element = document.getElementById('report-container');
    if (!element || isExporting) return;
    
    setIsExporting(true);
    
    try {
      setIsExporting(true);
      await generateClientPDF(activeItem);
    } catch (err) {
      console.error("Client-side PDF generation failed:", err);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const clientId = localStorage.getItem('ai-qa-client-id');
      const res = await fetch(`${API_URL}/api/analyses?clientId=${clientId}`);
      let serverRuns: AnalysisRun[] = [];
      
      if (res.ok) {
        serverRuns = await res.json();
      }

      // --- LOCAL VAULT PERSISTENCE (FIX FOR VANISHING REPORTS) ---
      const localVaultRaw = localStorage.getItem('ai-qa-local-vault');
      let localVault: AnalysisRun[] = localVaultRaw ? JSON.parse(localVaultRaw) : [];

      // Update vault with any new completed runs from server
      serverRuns.forEach(serverRun => {
        if (serverRun.status === 'COMPLETED' || serverRun.status === 'FAILED') {
          const index = localVault.findIndex(v => v.id === serverRun.id);
          if (index > -1) {
            localVault[index] = serverRun;
          } else {
            localVault.unshift(serverRun);
          }
        }
      });

      // Limit vault size to ~50 reports to stay under localStorage 5MB limit
      if (localVault.length > 50) localVault = localVault.slice(0, 50);
      localStorage.setItem('ai-qa-local-vault', JSON.stringify(localVault));

      // Merge: Active server runs + Persistent local vault
      const mergedRuns = [...serverRuns.filter(s => s.status !== 'COMPLETED' && s.status !== 'FAILED')];
      
      // Add local vault items, avoiding duplicates
      localVault.forEach(vaultRun => {
        if (!mergedRuns.find(m => m.id === vaultRun.id)) {
          mergedRuns.push(vaultRun);
        }
      });

      // Sort by date (newest first)
      mergedRuns.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      
      setRuns(mergedRuns);
    } catch (e) { 
      console.error("History fetch error:", e);
      // Fallback to vault only if server is down
      const localVaultRaw = localStorage.getItem('ai-qa-local-vault');
      if (localVaultRaw) setRuns(JSON.parse(localVaultRaw));
    }
  };

  useEffect(() => {
    // Generate or retrieve a persistent client ID for this browser
    if (!localStorage.getItem('ai-qa-client-id')) {
      const newId = `cli-${Math.random().toString(36).substring(2, 11)}-${Date.now()}`;
      localStorage.setItem('ai-qa-client-id', newId);
    }
    
    // Initial load from vault for instant responsiveness
    const localVaultRaw = localStorage.getItem('ai-qa-local-vault');
    if (localVaultRaw) setRuns(JSON.parse(localVaultRaw));

    fetchHistory();
    
    // DYNAMIC POLLING: High frequency (1s) during active runs, low frequency (5s) otherwise.
    let intervalTime = 5000;
    const activeRun = runs.some(r => r.status !== 'COMPLETED' && r.status !== 'FAILED');
    if (activeRun) intervalTime = 1000;

    const interval = setInterval(fetchHistory, intervalTime);
    return () => clearInterval(interval);
  }, [runs.length, runs.some(r => r.status !== 'COMPLETED' && r.status !== 'FAILED')]);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const clientId = localStorage.getItem('ai-qa-client-id');

    try {
      if (activeMode === 'github') {
        const res = await fetch(`${API_URL}/api/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repoUrl, taskType: 'E2E', clientId, framework, githubToken, focusArea })
        });
        if (!res.ok) throw new Error("Analysis failed to start");
        setRepoUrl('');
        setFocusArea('');
      } else {
        if (!selectedFile) return;
        const code = await selectedFile.text();
        const res = await fetch(`${API_URL}/api/analyze-snippet`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, clientId })
        });
        if (!res.ok) throw new Error("Snippet check failed");
        setSelectedFile(null);
      }
      setTimeout(fetchHistory, 1000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-200 flex overflow-hidden font-sans text-[12px]">
      {/* Sidebar */}
      <aside className="w-44 bg-[#0c111d] border-r border-white/5 flex flex-col p-2 hidden md:flex shrink-0">
        <div className="flex items-center gap-1.5 mb-4 px-1 mt-1">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center shadow-md">
            <Bot size={13} color="white" strokeWidth={2.5} />
          </div>
          <h1 className="font-bold text-xs tracking-tight text-white leading-tight">AI QA Agent</h1>
        </div>
        <nav className="flex flex-col gap-0.5 flex-1">
          <button
            onClick={() => { setActiveMode('snippet'); setActiveItemId(null); }}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md font-semibold text-[11px] transition-all ${activeMode === 'snippet' ? 'bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/30' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <FileCode size={12} />
            Snippet Diagnostics
          </button>
          <button
            onClick={() => { setActiveMode('github'); setActiveItemId(null); }}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md font-semibold text-[11px] transition-all ${activeMode === 'github' ? 'bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/30' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <Globe size={12} />
            Repository Engine
          </button>
        </nav>

        {/* Bottom Engine Status & Upgrade */}
        <div className="mt-auto pt-4 border-t border-white/5 space-y-4">
          <button 
            onClick={() => setShowPricing(true)}
            className="w-full bg-gradient-to-br from-amber-500/10 to-orange-500/10 hover:from-amber-500/20 hover:to-orange-500/20 border border-amber-500/30 p-3 rounded-xl transition-all group text-left relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
              <Zap size={32} className="text-amber-500" />
            </div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Founder Edition</span>
              <Zap size={8} className="text-amber-500 fill-amber-500 animate-pulse" />
            </div>
            <p className="text-[8px] text-slate-400 font-medium leading-tight">Unlock Private Repos & Priority Agentic Loops.</p>
          </button>

          <div className="flex items-center gap-1.5 opacity-60 px-1 pb-2">
            <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[7.5px] font-black text-emerald-400 uppercase tracking-widest">Gemini 2.5 Flash</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-3 flex flex-col gap-2.5 h-screen overflow-y-auto">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-extrabold text-white tracking-tight">
              {activeMode === 'github' ? 'Autonomous QA Platform' : 'Code Diagnostic Engine'}
            </h2>
            <p className="text-[10px] text-slate-400 font-medium">
              {activeMode === 'github' ? 'Fast, parallelized test generation and code diagnostics.' : 'Analyze snippets for logic bugs and edge cases.'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold text-slate-300">{user.displayName || user.username}</span>
                  <button 
                    onClick={() => window.location.href = `${API_URL}/auth/logout`}
                    className="text-[8px] font-black text-slate-500 uppercase hover:text-rose-400 transition-colors"
                  >
                    Logout
                  </button>
                </div>
                <img src={user.photos?.[0]?.value} className="w-8 h-8 rounded-full border border-white/10" alt="avatar" />
              </div>
            ) : (
              <button 
                onClick={() => window.location.href = `${API_URL}/auth/github`}
                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-md px-3 py-1.5 transition-all active:scale-95"
              >
                <Globe size={14} className="text-slate-400" />
                <span className="text-[10px] font-bold text-slate-300">Login with GitHub</span>
              </button>
            )}
            <button className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2">
              Founder Edition
              <CheckCircle2 size={12} fill="currentColor" className="text-amber-950" />
            </button>
          </div>
        </header>

        {/* Input Panel */}
        <section className="bg-white/5 rounded-lg p-4 border border-white/10 shadow-xl">
          <form onSubmit={handleStart} className="flex flex-col gap-3">
            {activeMode === 'github' ? (
              <div className="flex flex-col gap-3">
                {user && repos.length > 0 && (
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                      <FileCode size={14} className="text-slate-500" />
                    </div>
                    <select
                      value={selectedRepo}
                      onChange={(e) => handleRepoSelect(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-md py-2.5 pl-9 pr-4 text-[11px] focus:outline-none focus:border-cyan-500/50 transition-all font-medium text-slate-200 appearance-none cursor-pointer hover:bg-white/5"
                    >
                      <option value="">Select from your repositories...</option>
                      {repos.map(r => (
                        <option key={r.id} value={r.html_url}>
                          {r.private ? '🔒' : '🌐'} {r.full_name}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
                      <ChevronRight size={14} className="text-slate-600 rotate-90" />
                    </div>
                  </div>
                )}
                
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                    <input
                      type="text"
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      placeholder="Or paste any public GitHub URL..."
                      className="w-full bg-black/40 border border-white/10 rounded-md py-2 pl-9 pr-4 text-[11px] focus:outline-none focus:border-cyan-500/50 transition-all font-medium placeholder:text-slate-600"
                    />
                  </div>
                  <div className="relative flex-1">
                    <Bot className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                    <input
                      type="text"
                      value={focusArea}
                      onChange={(e) => setFocusArea(e.target.value)}
                      placeholder="Strategic Focus (e.g. Auth flow, Stripe...)"
                      className="w-full bg-black/40 border border-white/10 rounded-md py-2 pl-9 pr-4 text-[11px] focus:outline-none focus:border-emerald-500/50 transition-all font-medium placeholder:text-slate-600"
                    />
                  </div>
                  <div className="relative">
                    <select
                      value={framework}
                      onChange={(e) => setFramework(e.target.value as any)}
                      className="bg-black/40 border border-white/10 rounded-md py-2 px-3 text-[11px] focus:outline-none focus:border-cyan-500/50 transition-all font-medium text-slate-300 appearance-none cursor-pointer hover:bg-white/5"
                    >
                      <option value="playwright">Playwright</option>
                      <option value="cypress">Cypress</option>
                      <option value="jest">Jest</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-black text-[10px] uppercase tracking-widest px-6 rounded-md transition-all shadow-lg active:scale-95 flex items-center gap-2"
                  >
                    {loading ? 'Analyzing...' : 'Run Engine'}
                    <Zap size={12} fill="white" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 relative">
                <div
                  onClick={() => !loading && fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 transition-all group ${loading ? 'border-cyan-500/50 bg-cyan-500/5 cursor-wait' : 'border-white/10 cursor-pointer hover:bg-white/5 hover:border-white/20'}`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setSelectedFile(file);
                    }}
                    className="hidden"
                  />
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${loading ? 'bg-cyan-500/20 animate-pulse' : 'bg-white/5 group-hover:scale-110'}`}>
                    <CheckCircle2 className={loading ? 'text-cyan-400' : 'text-slate-500 group-hover:text-emerald-400'} size={20} />
                  </div>
                  <div className="text-center">
                    <p className="text-[11px] font-bold text-white mb-0.5">
                      {loading ? <span className="text-cyan-400 animate-pulse">Initializing Smart Diagnostic...</span> : (selectedFile ? <span className="text-emerald-400">{selectedFile.name} Ready</span> : <><span className="text-cyan-400">Click to choose a file</span> or drag and drop</>)}
                    </p>
                    <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">
                      {loading ? 'Reading and Auditing Source Code' : 'Supports all major languages'}
                    </p>
                  </div>
                </div>

                {/* Bottom-Right Diagnostic Trigger */}
                <div className="absolute right-0 -bottom-16 flex justify-end">
                  <button
                    type="submit"
                    disabled={loading || !selectedFile}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed text-white font-black text-[9px] uppercase tracking-widest py-1.5 px-4 rounded-md transition-all shadow-lg flex items-center gap-2 active:scale-95 whitespace-nowrap"
                  >
                    <CheckCircle2 size={12} fill="currentColor" className="text-emerald-950" />
                    Diagnose Source Code
                  </button>
                </div>
              </div>
            )}
          </form>
        </section>

        {/* Padding adjustment for the button below */}
        <div className="h-14" />

        {/* Board View */}
        <section className="flex flex-col lg:flex-row gap-2.5 flex-1 min-h-0">
          {/* List Sidebar: Project-Based Workspaces */}
          <div className="w-[180px] flex flex-col gap-3 overflow-y-auto pr-0.5 custom-scrollbar">
            <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest px-1">Projects / Workspaces</h3>
            
            {(() => {
              const filteredRuns = runs.filter(run => {
                const isSnippet = run.repo_url === 'Code Snippet Debugging';
                return activeMode === 'snippet' ? isSnippet : !isSnippet;
              });

              // Group runs by repository URL
              const groups: { [key: string]: AnalysisRun[] } = {};
              filteredRuns.forEach(run => {
                const repo = run.repo_url;
                if (!groups[repo]) groups[repo] = [];
                groups[repo].push(run);
              });

              return Object.entries(groups).map(([repoUrl, repoRuns]) => {
                const repoName = repoUrl === 'Code Snippet Debugging' ? 'Snippets' : (repoUrl.split('/').pop()?.replace('.git', '') || 'Project');
                
                return (
                  <div key={repoUrl} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 px-1 mb-0.5">
                      <div className="w-1 h-1 rounded-full bg-cyan-500/50" />
                      <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter truncate">{repoName}</span>
                    </div>
                    
                    {repoRuns.map(run => (
                      <div
                        key={run.id} onClick={() => setActiveItemId(run.id)}
                        className={`cursor-pointer rounded-md p-2 border flex flex-col gap-1 transition-all group/item ${activeItemId === run.id ? 'bg-white/10 border-white/20' : 'bg-white/5 border-white/5 hover:border-white/10'}`}
                      >
                        <div className="flex justify-between items-start">
                          <span className="text-[9px] text-white font-bold truncate max-w-[80%]">
                            {new Date(run.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <button onClick={(e) => { 
                            e.stopPropagation(); 
                            fetch(`${API_URL}/api/analyses/${run.id}`, { method: 'DELETE' }).then(() => {
                              const vaultRaw = localStorage.getItem('ai-qa-local-vault');
                              if (vaultRaw) {
                                const vault = JSON.parse(vaultRaw);
                                const newVault = vault.filter((v: any) => v.id !== run.id);
                                localStorage.setItem('ai-qa-local-vault', JSON.stringify(newVault));
                              }
                              fetchHistory();
                            }); 
                          }} className="text-slate-500 opacity-0 group-hover/item:opacity-100 hover:text-red-400 transition-all"><Trash2 size={8} /></button>
                        </div>
                        <div className={`text-[7px] uppercase font-black px-1.5 py-0.5 rounded border self-start ${
                          (run.status === 'COMPLETED' || run.status === 'TESTS_GENERATED' || run.status === 'RUNNING_TESTS') ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                          run.status === 'FAILED' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                          'bg-cyan-500/10 text-cyan-400 border-cyan-500/20 animate-pulse'
                        }`}>
                          {run.status.replace('_', ' ')}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              });
            })()}
          </div>

          {/* Detailed Report */}
          <div className="flex-1 glass-panel border border-white/10 rounded-lg p-4 overflow-y-auto relative">
            <ErrorBoundary fallback={
              <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-3">
                <AlertCircle size={32} className="text-amber-500" />
                <p className="text-[10px] font-bold uppercase tracking-widest">Diagnostic Report Corrupted</p>
                <button onClick={() => window.location.reload()} className="text-[9px] bg-white/5 px-3 py-1 rounded hover:bg-white/10 transition-all border border-white/10">Try Recovery</button>
              </div>
            }>
            {!activeItem ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-40">
                <Terminal size={32} />
                <p className="text-[10px] font-bold mt-2 uppercase">Select a Report</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4 animate-fade-in" id="report-container">
                <header className="flex items-center justify-between border-b border-white/5 pb-2 text-white">
                  <div className="flex items-center gap-2">
                    <Terminal size={14} className="text-cyan-400" />
                    <h3 className="text-sm font-black">AI Diagnostic Report</h3>
                  </div>
                  <div className="flex items-center gap-2" data-html2canvas-ignore="true">
                    <button 
                      onClick={handleExportPDF}
                      disabled={isExporting}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${isExporting ? 'bg-indigo-500/5 text-indigo-500/50 border border-indigo-500/10 cursor-wait' : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-500/20'}`}
                    >
                      <Download size={12} className={isExporting ? "animate-bounce" : ""} />
                      {isExporting ? 'Generating PDF...' : 'Export PDF'}
                    </button>
                    <button onClick={() => setActiveItemId(null)}><ChevronRight size={14} /></button>
                  </div>
                </header>

                {/* Dynamic Metrics Grid */}
                {metrics && (
                  <div className="grid grid-cols-3 gap-2.5 animate-fade-in shrink-0">
                    {metrics.type === 'snippet' ? (
                      <>
                        <div className="bg-red-500/5 border border-red-500/10 p-2 rounded-lg text-center shadow-lg">
                          <span className="block text-[7px] text-red-400/70 uppercase font-black tracking-widest mb-0.5">Error Type</span>
                          <span className="text-sm font-black text-red-400 truncate px-1">{metrics.errorType}</span>
                        </div>
                        <div className="bg-amber-500/5 border border-amber-500/10 p-2 rounded-lg text-center shadow-lg">
                          <span className="block text-[7px] text-amber-500/70 uppercase font-black tracking-widest mb-0.5">Line Number</span>
                          <span className="text-sm font-black text-amber-400">{metrics.errorLine}</span>
                        </div>
                        <div className="bg-emerald-500/5 border border-emerald-500/10 p-2 rounded-lg text-center shadow-lg">
                          <span className="block text-[7px] text-emerald-400/70 uppercase font-black tracking-widest mb-0.5">Diagnostic Result</span>
                          <span className="text-sm font-black text-emerald-400">{metrics.hasFix ? 'Fixed' : 'Analyzed'}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex gap-2.5 animate-fade-in shrink-0 w-full">
                        <div className="flex-1 bg-slate-800/40 border border-white/5 p-2 rounded-lg text-center shadow-lg">
                          <span className="block text-[7px] text-slate-400 uppercase font-black tracking-widest mb-0.5">Execution Time</span>
                          <span className="text-sm font-black text-slate-200">{metrics.duration}s</span>
                        </div>
                        <div className="flex-1 bg-slate-800/30 border border-white/5 p-2 rounded-lg text-center shadow-lg overflow-hidden">
                          <span className="block text-[7px] text-slate-500 uppercase font-black tracking-widest mb-0.5">Framework Signature</span>
                          <span className="text-sm font-black text-cyan-400 truncate block px-1">{metrics.framework}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Classic Linear Report Content */}
                {activeItem.playwright_output && (
                  <div className="flex flex-col gap-2 animate-fade-in py-2">
                    <div className="prose-report-classic custom-scrollbar text-[13px] text-slate-300 leading-relaxed">
                      <ReactMarkdown
                        components={{
                          h1: ({ children }) => <h1 className="text-sm font-black text-white uppercase mt-4 mb-2 pb-1 border-b border-white/5 tracking-wider">{children}</h1>,
                          h2: ({ children }) => <h2 className="text-[13px] font-bold text-cyan-400 mt-6 mb-1">{children}</h2>,
                          h3: ({ children }) => {
                            const text = String(children);
                            // Robust detection for "Corrected Solution" regardless of emoji/number prefix
                            if (text.toLowerCase().includes("corrected solution")) {
                              return (
                                <div className="mt-8 mb-3 flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]" />
                                  <span className="text-[13px] font-black text-emerald-400 uppercase tracking-[0.2em]">Corrected Solution</span>
                                </div>
                              );
                            }
                            return (
                              <h3 className="text-[13px] font-black text-white mt-10 mb-5 flex items-center gap-3 group">
                                <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-300 group-hover:from-indigo-500/30 group-hover:to-purple-500/30 transition-all shadow-lg border border-white/5">
                                  <ChevronRight size={14} className="rotate-[-45deg] drop-shadow-[0_0_3px_rgba(129,140,248,0.5)]" strokeWidth={3} />
                                </span>
                                <span className="tracking-tight uppercase">{children.toString().replace(/[🚀📋🛠️🚩🔍💡🖥️✅⚙️]/g, '').trim()}</span>
                              </h3>
                            );
                          },
                          p: ({ children }) => <p className="mb-3 opacity-90">{children}</p>,
                          strong: ({ children }) => <strong className="text-cyan-300 font-bold">{children}</strong>,
                          ul: ({ children }) => <ul className="list-disc ml-5 mb-4 space-y-1 opacity-80">{children}</ul>,
                          code: ({ node, inline, className, children, ...props }: any) => {
                            const match = /language-(\w+)/.exec(className || '')
                            const codeString = String(children).replace(/\n$/, '');

                            // Check if this is likely the primary fix block (topmost or section 3)
                            const isFixBlock = !node.position?.start.line || node.position?.start.line < 30;

                            if (!inline && match) {
                              return (
                                <div className={`rounded-xl overflow-hidden my-6 border shadow-2xl transition-all ${isFixBlock ? 'border-emerald-500/20 bg-[#0d1414]/80 shadow-[0_0_50px_-15px_rgba(16,185,129,0.1)]' : 'border-white/10 bg-[#0d1117]'}`}>
                                  <div className={`px-5 py-3.5 flex items-center justify-between border-b ${isFixBlock ? 'border-emerald-500/10 bg-emerald-500/[0.03]' : 'border-white/5 bg-white/5'}`}>
                                    <div className="flex items-center gap-3">
                                      {isFixBlock ? <CheckCircle2 size={16} className="text-emerald-400" /> : <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{match[1]} output</div>}
                                      {isFixBlock && (
                                        <div>
                                          <p className="text-[11px] font-black text-emerald-400 uppercase tracking-[0.1em] leading-none">Corrected Solution</p>
                                          <p className="text-[8px] font-black text-emerald-500/40 uppercase tracking-widest mt-1">READY TO DEPLOY</p>
                                        </div>
                                      )}
                                    </div>
                                    <button
                                      onClick={() => copyToClipboard(codeString, codeString.substring(0, 20))}
                                      className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[9px] font-black uppercase tracking-[0.15em] transition-all active:scale-90 ${copiedId === codeString.substring(0, 20) ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/5 hover:bg-white/10 text-slate-400 border border-white/10'}`}
                                    >
                                      {copiedId === codeString.substring(0, 20) ? <ClipboardCheck size={12} /> : <Copy size={12} />}
                                      {copiedId === codeString.substring(0, 20) ? 'Copied' : 'Copy'}
                                    </button>
                                  </div>
                                  <SyntaxHighlighter
                                    {...props} children={codeString}
                                    style={codeTheme as any} language={match[1]} PreTag="div"
                                    customStyle={{ margin: 0, padding: '1.25rem', fontSize: '11px', lineHeight: '1.7', background: 'transparent' }}
                                  />
                                </div>
                              );
                            }
                            return (
                              <code className="bg-white/5 px-1 rounded text-cyan-300 font-mono text-xs" {...props}>{children}</code>
                            )
                          }
                        }}
                      >
                        {activeItem.playwright_output}
                      </ReactMarkdown>
                    </div>

                    {metrics?.executionLog && (
                      <details className="mt-4 border-t border-white/5 pt-3 group">
                        <summary className="cursor-pointer text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:text-cyan-400 transition-colors">Show Technical Trace</summary>
                        <div className="mt-2 bg-black/40 p-3 rounded border border-white/5 font-mono text-[9px] text-slate-400 max-h-40 overflow-y-auto custom-scrollbar">
                          <pre className="whitespace-pre-wrap">{metrics.executionLog}</pre>
                        </div>
                      </details>
                    )}
                  </div>
                )}

                {activeItem.test_code && (
                  <div className="mt-4 border-t border-white/5 pt-6 animate-fade-in">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Playwright Test Suite</h4>
                    <div className="rounded-lg overflow-hidden border border-white/10 shadow-2xl">
                      <SyntaxHighlighter
                        children={activeItem.test_code}
                        language="javascript"
                        style={codeTheme as any}
                        PreTag="div"
                        customStyle={{ margin: 0, padding: '1.25rem', fontSize: '11px', lineHeight: '1.7' }}
                      />
                    </div>
                  </div>
                )}

                {activeItem.cicd_code && (
                  <div className="mt-4 border-t border-white/5 pt-6 animate-fade-in">
                    <div className="flex items-center justify-between mb-2 px-1">
                      <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">CI/CD Pipeline Configuration</h4>
                      <button
                        onClick={() => copyToClipboard(activeItem.cicd_code || '', 'cicd')}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-[0.15em] transition-all active:scale-90 ${copiedId === 'cicd' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/5 hover:bg-white/10 text-slate-400 border border-white/10'}`}
                      >
                        {copiedId === 'cicd' ? <ClipboardCheck size={12} /> : <Copy size={12} />}
                        {copiedId === 'cicd' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="rounded-lg overflow-hidden border border-white/10 shadow-2xl">
                      <SyntaxHighlighter
                        children={activeItem.cicd_code}
                        language="yaml"
                        style={codeTheme as any}
                        PreTag="div"
                        customStyle={{ margin: 0, padding: '1.25rem', fontSize: '11px', lineHeight: '1.7' }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
            </ErrorBoundary>
          </div>
        </section>

        {/* Pricing Modal */}
        {showPricing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="max-w-2xl w-full bg-[#0c111d] border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row animate-in zoom-in-95 duration-300">
              <div className="flex-1 p-8 border-r border-white/5 bg-gradient-to-br from-white/[0.02] to-transparent">
                <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center mb-6">
                  <Bot size={20} className="text-indigo-400" />
                </div>
                <h3 className="text-2xl font-black text-white mb-2 tracking-tight">Scale Quality Assurance</h3>
                <p className="text-slate-400 text-sm mb-6 leading-relaxed">The AI QA Agent is free for individual snippets. Upgrade to unlock full repository diagnostics and CI/CD automation.</p>
                
                <ul className="space-y-3">
                  {[
                    'Autonomous Playwright Test Generation',
                    'Strategic Focus (Surgical Audits)',
                    'Agentic Self-Healing Loop',
                    'CI/CD Pipeline (.github/workflows) Export',
                    'Private Repository Analysis (Secure PAT)'
                  ].map((feature, i) => (
                    <li key={i} className="flex items-center gap-3 text-slate-300 text-[11px] font-medium">
                      <div className="w-4 h-4 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <Check size={10} className="text-emerald-500" />
                      </div>
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="w-[280px] bg-white/[0.01] p-8 flex flex-col justify-center gap-6">
                <div className="text-center">
                  <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-2 block">Founder Edition</span>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-black text-white">$49</span>
                    <span className="text-slate-500 text-sm">/mo</span>
                  </div>
                </div>
                
                <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-3 rounded-xl transition-all active:scale-95 shadow-lg shadow-indigo-500/20 text-xs uppercase tracking-widest">
                  Start 14-Day Trial
                </button>
                
                <p className="text-[9px] text-slate-600 text-center font-medium italic">Secure checkout via Stripe. No credit card required to start.</p>
                
                <button 
                  onClick={() => setShowPricing(false)}
                  className="mt-4 text-[10px] font-black text-slate-500 uppercase tracking-widest hover:text-white transition-all"
                >
                  Maybe Later
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Reusable High-Fidelity Code Theme (Classic Dark)
const codeTheme = {
  'comment': { color: '#6a737d', fontStyle: 'italic' },
  'keyword': { color: '#d73a49', fontWeight: 'bold' },
  'string': { color: '#9ecbff' },
  'function': { color: '#b392f0' },
  'number': { color: '#79b8ff' },
  'operator': { color: '#79b8ff' },
  'class-name': { color: '#f97583' },
  'constant': { color: '#79b8ff' },
  'attr-name': { color: '#ffab70' },
  'property': { color: '#79b8ff' },
  'boolean': { color: '#79b8ff' },
  'code[class*="language-"]': { color: '#c9d1d9', fontFamily: 'JetBrains Mono, monospace' },
  'pre[class*="language-"]': { background: '#0d1117' }
};
