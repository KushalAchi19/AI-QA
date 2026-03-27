import { useState, useEffect } from 'react';
import './index.css';

// Type definitions
interface AnalysisRun {
  id: number;
  repo_url: string;
  status: string;
  test_file?: string;
  test_code?: string;
  playwright_output?: string;
  created_at: string;
}

function App() {
  const [repoUrl, setRepoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState<AnalysisRun[]>([]);
  const [activeItem, setActiveItem] = useState<AnalysisRun | null>(null);

  const fetchRuns = async () => {
    try {
        const res = await fetch('http://localhost:5000/api/analyses');
        const data = await res.json();
        setRuns(data);
    } catch (e) {
        console.error("Backend not reachable");
    }
  };

  useEffect(() => {
    fetchRuns();
    const interval = setInterval(fetchRuns, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleStartAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl) return;

    setLoading(true);
    try {
      await fetch('http://localhost:5000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl, taskType: 'E2E' })
      });
      setRepoUrl('');
      // Optimistic refresh
      setTimeout(fetchRuns, 1000);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-slate-200 flex overflow-hidden">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 glass-panel border-r border-slate-700/50 flex flex-col p-6 m-4 rounded-2xl hidden md:flex">
         <div className="flex items-center gap-3 mb-12">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>
            </div>
            <h1 className="font-bold text-xl tracking-tight text-white">QA Agent</h1>
         </div>
         <nav className="flex flex-col gap-3 flex-1">
            <a href="#" className="flex items-center gap-3 px-4 py-3 rounded-lg bg-indigo-500/10 text-indigo-400 font-medium transition-all hover:bg-indigo-500/20">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
               Dashboard
            </a>
            <a href="#" className="flex items-center gap-3 px-4 py-3 rounded-lg text-slate-400 font-medium transition-all hover:bg-slate-800 hover:text-white">
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
               Automations
            </a>
         </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 md:p-10 flex flex-col gap-8 h-screen overflow-y-auto">
        
        {/* Header Section */}
        <header className="flex flex-col gap-2">
            <h2 className="text-3xl font-bold text-white tracking-tight">Autonomous Platform</h2>
            <p className="text-slate-400">Generate, execute, and analyze Playwright test suites using Google Gemini.</p>
        </header>

        {/* Action Panel */}
        <section className="glass-panel rounded-2xl p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
            
            <form onSubmit={handleStartAnalysis} className="relative z-10 flex flex-col gap-4 max-w-2xl">
                <label className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Target GitHub Repository</label>
                <div className="flex flex-col md:flex-row gap-4">
                    <input 
                      type="url" 
                      required
                      placeholder="https://github.com/owner/repository"
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      className="flex-1 bg-slate-900/50 border border-slate-700/50 rounded-xl px-5 py-4 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all text-white placeholder-slate-500 shadow-inner"
                    />
                    <button 
                      type="submit" 
                      disabled={loading}
                      className={`px-8 py-4 rounded-xl font-bold text-white shadow-lg transition-all duration-300 flex items-center justify-center gap-2
                        ${loading ? 'bg-slate-700 cursor-not-allowed' : 'bg-gradient-to-r from-cyan-500 to-indigo-600 hover:shadow-cyan-500/25 hover:scale-[1.02] active:scale-[0.98]'}`}
                    >
                        {loading && <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                        {loading ? 'Initializing Agent...' : 'Generate Test Suite'}
                    </button>
                </div>
            </form>
        </section>

        {/* Recent Runs and Execution Details */}
        <section className="flex flex-col lg:flex-row gap-6 h-full">
            {/* Run List */}
            <div className="w-full lg:w-1/3 flex flex-col gap-4">
               <h3 className="text-xl font-semibold text-white mb-2">History</h3>
               {runs.length === 0 && <p className="text-slate-500 italic text-sm">No tests run yet. Initialize one above.</p>}
               {runs.map(run => (
                   <div 
                     key={run.id} 
                     onClick={() => setActiveItem(run)}
                     className={`cursor-pointer transition-all rounded-xl p-5 border flex flex-col gap-3
                        ${activeItem?.id === run.id ? 'glass-panel border-cyan-500/50 shadow-lg shadow-cyan-500/10' : 'bg-slate-800/40 border-slate-700/30 hover:bg-slate-800/60'}
                        ${(run.status === 'STARTED' || run.status === 'RUNNING_TESTS') ? 'pulsing-border border-indigo-500/50' : ''}
                     `}
                   >
                       <div className="flex justify-between items-start">
                           <span className="font-mono text-xs text-slate-400 bg-slate-900 px-2 py-1 rounded truncate max-w-[70%]">
                               {run.repo_url.replace('https://github.com/', '')}
                           </span>
                           <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full 
                              ${run.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' : 
                                run.status === 'FAILED' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'}`}>
                               {run.status.replace('_', ' ')}
                           </span>
                       </div>
                       <p className="text-xs text-slate-500">{new Date(run.created_at).toLocaleString()}</p>
                   </div>
               ))}
            </div>

            {/* Run Details Panel */}
            <div className="flex-1 glass-panel rounded-2xl p-6 overflow-y-auto">
                {!activeItem ? (
                     <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-60">
                         <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="9" x2="15" y1="9" y2="9"/><line x1="9" x2="15" y1="15" y2="15"/></svg>
                         <p>Select a history item to view generated test code & results.</p>
                     </div>
                ) : (
                    <div className="flex flex-col gap-6 animate-fade-in">
                        <div className="flex items-center justify-between border-b border-slate-700/50 pb-4">
                            <h3 className="text-xl font-bold text-white tracking-tight">Active Suite Details</h3>
                            <button onClick={() => setActiveItem(null)} className="text-slate-400 hover:text-white transition-colors">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        
                        {activeItem.test_code && (
                            <div className="flex flex-col gap-2">
                                <span className="text-sm font-semibold text-cyan-400 px-1 decoration-dashed underline underline-offset-4">Generated Playwright Scenario</span>
                                <div className="bg-[#0d121c] rounded-xl p-4 overflow-x-auto shadow-inner border border-slate-800">
                                    <pre className="text-sm text-emerald-300 font-mono">
                                        <code>{activeItem.test_code}</code>
                                    </pre>
                                </div>
                            </div>
                        )}

                        {activeItem.playwright_output && (
                            <div className="flex flex-col gap-2 mt-4">
                                <span className="text-sm font-semibold text-indigo-400 px-1 decoration-dashed underline underline-offset-4">Execution Telemetry</span>
                                <div className="bg-[#0d121c] rounded-xl p-4 overflow-x-auto shadow-inner border border-slate-800">
                                    <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap">
                                        {activeItem.playwright_output}
                                    </pre>
                                </div>
                            </div>
                        )}
                        
                        {(!activeItem.test_code && !activeItem.playwright_output) && (
                            <div className="flex h-32 items-center justify-center">
                                 <span className="flex items-center gap-2 text-amber-500 font-medium animate-pulse">
                                     <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10" strokeWidth="4" className="opacity-25"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                     AI is analyzing codebase...
                                 </span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>

      </main>
    </div>
  )
}

export default App;
