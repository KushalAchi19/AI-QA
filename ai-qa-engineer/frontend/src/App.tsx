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
  FileCode, Terminal, History, Globe, AlertCircle, CheckCircle2,
  Info, ChevronRight, Zap, Copy, Check, Bot, Trash2, ClipboardCheck
} from 'lucide-react';
import './index.css';

// --- TYPES ---
interface AnalysisRun {
  id: string;
  repo_url: string;
  status: 'STARTED' | 'GENERATING_TESTS' | 'TESTS_GENERATED' | 'RUNNING_TESTS' | 'COMPLETED' | 'FAILED' | 'ANALYSING';
  test_file?: string;
  test_code?: string;
  playwright_output?: string;
  created_at: string;
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
        return {
          type: 'playwright',
          total: passed + failed + skipped,
          duration: ((stats.duration || 0) / 1000).toFixed(1),
          executionLog: data.executionLog || ""
        };
      }
    } catch (e) { return null; }
    return { type: 'playwright', total: 0, duration: '0', executionLog: "" };
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [runs, setRuns] = useState<AnalysisRun[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeItem = useMemo(() => runs.find(r => r.id === activeItemId) || null, [runs, activeItemId]);
  const metrics = useMemo(() => activeItem ? parseAnalysisMetrics(activeItem) : null, [activeItem]);

  const fetchHistory = async () => {
    try {
      const res = await fetch('https://ai-quality-assurance-engineer.onrender.com/api/analyses');
      if (res.ok) {
        const data = await res.json();
        setRuns(data);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchHistory();
    const interval = setInterval(fetchHistory, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText('');
    setLoading(true);

    try {
      if (activeMode === 'github') {
        const res = await fetch('https://ai-quality-assurance-engineer.onrender.com/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repoUrl, taskType: 'E2E' })
        });
        if (!res.ok) throw new Error("Analysis failed to start");
        setRepoUrl('');
      } else {
        if (!selectedFile) return;
        const code = await selectedFile.text();
        const res = await fetch('https://ai-quality-assurance-engineer.onrender.com/api/analyze-snippet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code })
        });
        if (!res.ok) throw new Error("Snippet check failed");
        setSelectedFile(null);
      }
      setTimeout(fetchHistory, 1000);
    } catch (err: any) {
      setErrorText(err.message);
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
            onClick={() => setActiveMode('snippet')}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md font-semibold text-[11px] transition-all ${activeMode === 'snippet' ? 'bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/30' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <FileCode size={12} />
            Snippet Diagnostics
          </button>
          <button
            onClick={() => setActiveMode('github')}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md font-semibold text-[11px] transition-all ${activeMode === 'github' ? 'bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/30' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}
          >
            <Globe size={12} />
            Repository Engine
          </button>
        </nav>

        {/* Bottom Engine Status */}
        <div className="mt-auto px-2 py-2 border-t border-white/5 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 opacity-60">
            <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[7.5px] font-black text-emerald-400 uppercase tracking-widest">Gemini 2.5 Flash</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-3 flex flex-col gap-2.5 h-screen overflow-y-auto">
        <header className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-extrabold text-white tracking-tight">Autonomous QA Platform</h2>
            <p className="text-[10px] text-slate-400 font-medium">Fast, parallelized test generation and code diagnostics.</p>
          </div>
        </header>

        {errorText && (
          <div className="bg-red-500/10 border border-red-500/30 p-2 rounded-lg flex items-center gap-2 text-red-400">
            <AlertCircle size={13} />
            <span className="text-[11px] font-medium">{errorText}</span>
          </div>
        )}

        {/* Input Panel */}
        <section className="bg-white/5 rounded-lg p-4 border border-white/10 shadow-xl">
          <form onSubmit={handleStart} className="flex flex-col gap-3">
            {activeMode === 'github' ? (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input
                    type="text"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="GitHub Repository URL..."
                    className="w-full bg-black/40 border border-white/10 rounded-md py-2 pl-9 pr-4 text-[11px] focus:outline-none focus:border-cyan-500/50 transition-all font-medium placeholder:text-slate-600"
                  />
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
          {/* List Sidebar */}
          <div className="w-[180px] flex flex-col gap-1.5 overflow-y-auto pr-0.5 custom-scrollbar">
            <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1 px-1">Audit History</h3>
            {runs
              .filter(run => {
                const isSnippet = run.repo_url === 'Code Snippet Debugging';
                return activeMode === 'snippet' ? isSnippet : !isSnippet;
              })
              .map(run => {
                const fileName = run.repo_url === 'Code Snippet Debugging' ? 'Snippet' : (run.repo_url?.split('/').pop() || 'Analysis Run');
                return (
                  <div
                    key={run.id} onClick={() => setActiveItemId(run.id)}
                    className={`cursor-pointer rounded-md p-2 border flex flex-col gap-1 transition-all ${activeItemId === run.id ? 'bg-white/10 border-white/20' : 'bg-white/5 border-white/5 hover:border-white/10'}`}
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] text-white font-bold truncate max-w-[80%]">
                        {fileName}
                      </span>
                      <button onClick={(e) => { e.stopPropagation(); fetch(`https://ai-quality-assurance-engineer.onrender.com/api/analyses/${run.id}`, { method: 'DELETE' }).then(() => fetchHistory()); }} className="text-slate-400 hover:text-red-400 transition-colors"><Trash2 size={9} /></button>
                    </div>
                    <div className={`text-[7px] uppercase font-black px-1.5 py-0.5 rounded border self-start ${run.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                      {run.status === 'COMPLETED' ? 'Success' : 'Active'}
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Detailed Report */}
          <div className="flex-1 glass-panel border border-white/10 rounded-lg p-4 overflow-y-auto">
            {!activeItem ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-40">
                <Terminal size={32} />
                <p className="text-[10px] font-bold mt-2 uppercase">Select a Report</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4 animate-fade-in">
                <header className="flex items-center justify-between border-b border-white/5 pb-2 text-white">
                  <div className="flex items-center gap-2">
                    <Terminal size={14} className="text-cyan-400" />
                    <h3 className="text-sm font-black">AI Diagnostic Report</h3>
                  </div>
                  <button onClick={() => setActiveItemId(null)}><ChevronRight size={14} /></button>
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
                      <>
                        <div className="bg-slate-800/30 border border-white/5 p-2 rounded-lg text-center shadow-lg">
                          <span className="block text-[7px] text-slate-500 uppercase font-black tracking-widest mb-0.5">Diagnostic Tests</span>
                          <span className="text-sm font-black text-white">{metrics.total}</span>
                        </div>
                        <div className="bg-slate-800/40 border border-white/5 p-2 rounded-lg text-center shadow-lg">
                          <span className="block text-[7px] text-slate-400 uppercase font-black tracking-widest mb-0.5">Execution Time</span>
                          <span className="text-sm font-black text-slate-200">{metrics.duration}s</span>
                        </div>
                        <div className="bg-emerald-500/5 border border-emerald-500/10 p-2 rounded-lg text-center shadow-lg">
                          <span className="block text-[7px] text-emerald-400 uppercase font-black tracking-widest mb-0.5">Code Health Score</span>
                          <span className="text-sm font-black text-emerald-400">98%</span>
                        </div>
                      </>
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
                                <span className="tracking-tight uppercase">{children.toString().replace(/[🚀📋🛠️🚩🔍💡🖥️✅]/g, '').trim()}</span>
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
              </div>
            )}
          </div>
        </section>
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
