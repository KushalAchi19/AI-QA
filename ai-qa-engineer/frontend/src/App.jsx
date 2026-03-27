import { useState, useEffect, useRef } from 'react';
import './index.css';

function App() {
  const [activeMode, setActiveMode] = useState('snippet'); // 'github' or 'snippet'
  const [repoUrl, setRepoUrl] = useState('');
  
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [runs, setRuns] = useState([]);
  const [activeItem, setActiveItem] = useState(null);

  const fetchRuns = async () => {
    try {
        const res = await fetch('http://localhost:5000/api/analyses');
        const data = await res.json();
        setRuns(data);
    } catch (e) {
        console.warn("Backend not reachable for history polling");
    }
  };

  useEffect(() => {
    fetchRuns();
    const interval = setInterval(fetchRuns, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
        setSelectedFile(file);
        setErrorText(''); // clear previous errors
    }
  };

  const clearFile = () => {
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleStartAnalysis = async (e) => {
    e.preventDefault();
    setErrorText('');

    if (activeMode === 'github' && !repoUrl) return;
    if (activeMode === 'snippet' && !selectedFile) {
        setErrorText("You must select a file to upload first.");
        return;
    }

    setLoading(true);
    try {
      if (activeMode === 'github') {
          const res = await fetch('http://localhost:5000/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ repoUrl, taskType: 'E2E' })
          });
          if (!res.ok) throw new Error("Backend Error: " + await res.text());
          setRepoUrl('');
      } else {
          // Read File natively in browser and send raw source to Backend LLM
          const fileContents = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (e) => resolve(e.target.result);
              reader.onerror = () => reject("Failed to read the uploaded file.");
              reader.readAsText(selectedFile);
          });

          const res = await fetch('http://localhost:5000/api/analyze-snippet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: fileContents })
          });
          
          if (!res.ok) throw new Error("Backend Error: " + await res.text());
          
          // Clear file successfully
          clearFile();
      }
      setTimeout(fetchRuns, 1000);
    } catch (error) {
      console.error(error);
      setErrorText(error.message || "A network or system error occurred.");
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
            <button onClick={() => setActiveMode('snippet')} className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all font-medium ${activeMode === 'snippet' ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="m9 15 2 2 4-4"/></svg>
               Analyze Files
            </button>
            <button onClick={() => setActiveMode('github')} className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all font-medium ${activeMode === 'github' ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
               Repository Engine
            </button>
         </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 md:p-10 flex flex-col gap-8 h-screen overflow-y-auto">
        
        {/* Header Section */}
        <header className="flex flex-col gap-2">
            <h2 className="text-3xl font-bold text-white tracking-tight">Autonomous Platform</h2>
            <p className="text-slate-400">{activeMode === 'github' ? 'Generate and execute test suites from GitHub repositories.' : 'Upload broken code files (.py, .js, .cpp) to receive deep, enterprise-level AI bug fixes and exact corrected source code.'}</p>
        </header>

        {/* Global Error Banner */}
        {errorText && (
            <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-xl flex items-center gap-3 text-red-400 animate-fade-in">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
                <div className="font-semibold text-sm">System Alert:</div>
                <div className="text-sm">{errorText}</div>
            </div>
        )}

        {/* Action Panel */}
        <section className="glass-panel rounded-2xl p-8 relative overflow-hidden shrink-0">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
            
            <form onSubmit={handleStartAnalysis} className="relative z-10 flex flex-col gap-4">
                <label className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                    {activeMode === 'github' ? 'Target GitHub Repository' : 'Upload Source Code File'}
                </label>
                
                {activeMode === 'github' ? (
                     <div className="flex flex-col md:flex-row gap-4">
                        <input 
                          type="url" 
                          required
                          placeholder="https://github.com/owner/repository"
                          value={repoUrl}
                          onChange={(e) => setRepoUrl(e.target.value)}
                          className="flex-1 bg-slate-900/50 border border-slate-700/50 rounded-xl px-5 py-4 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all text-white placeholder-slate-500 shadow-inner"
                        />
                        <button type="submit" disabled={loading} className={`px-8 py-4 rounded-xl font-bold text-white shadow-lg transition-all duration-300 flex items-center justify-center gap-2 ${loading ? 'bg-slate-700 cursor-not-allowed' : 'bg-gradient-to-r from-cyan-500 to-indigo-600 hover:shadow-cyan-500/25 hover:scale-[1.02]'}`}>
                            {loading && <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full font-mono"></span>}
                            {loading ? 'Processing...' : 'Generate Tests'}
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        <div className="w-full flex items-center justify-center w-full">
                            <label htmlFor="dropzone-file" className={`flex flex-col items-center justify-center w-full p-4 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${selectedFile ? 'border-indigo-400 bg-indigo-500/10' : 'border-slate-600 bg-slate-800/20 hover:bg-slate-800/40 hover:border-slate-500'}`}>
                                <div className="flex flex-col items-center justify-center">
                                    <svg className={`w-8 h-8 mb-4 ${selectedFile ? 'text-indigo-400' : 'text-slate-400'}`} aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16">
                                        <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/>
                                    </svg>
                                    <p className="mb-2 text-sm text-slate-300 text-center">
                                        {selectedFile ? <span className="font-bold text-white">{selectedFile.name} ready</span> : <><span className="font-semibold text-cyan-400">Click to choose a file</span> or drag and drop</>}
                                    </p>
                                    <input 
                                        id="dropzone-file" 
                                        type="file" 
                                        className="mt-4 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-indigo-500/20 file:text-indigo-400 hover:file:bg-indigo-500/30 cursor-pointer" 
                                        ref={fileInputRef} 
                                        onChange={handleFileChange} 
                                    />
                                </div>
                            </label>
                        </div>
                        {selectedFile && (
                            <button type="submit" disabled={loading} className={`self-end px-10 py-4 rounded-xl font-bold text-white shadow-lg transition-all duration-300 flex items-center justify-center gap-2 ${loading ? 'bg-slate-700 cursor-not-allowed' : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:shadow-teal-500/25 hover:scale-[1.02]'}`}>
                                {loading && <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full font-mono"></span>}
                                {loading ? 'Running AI Diagnostics...' : 'Analyze Source File'}
                            </button>
                        )}
                    </div>
                )}
            </form>
        </section>

        {/* Recent Runs and Execution Details */}
        <section className="flex flex-col lg:flex-row gap-6 h-full min-h-[400px]">
            {/* Run List */}
            <div className="w-full lg:w-1/3 flex flex-col gap-4 overflow-y-auto pr-2">
               <h3 className="text-xl font-semibold text-white mb-2 sticky top-0 bg-[#0b0f19] py-2 z-10">Analysis History</h3>
               {runs.length === 0 && <p className="text-slate-500 italic text-sm">No analysis runs yet.</p>}
               {runs.map(run => (
                   <div 
                     key={run.id} 
                     onClick={() => setActiveItem(run)}
                     className={`cursor-pointer transition-all rounded-xl p-5 border flex flex-col gap-3
                        ${activeItem?.id === run.id ? 'glass-panel border-cyan-500/50 shadow-lg shadow-cyan-500/10' : 'bg-slate-800/40 border-slate-700/30 hover:bg-slate-800/60'}
                     `}
                   >
                       <div className="flex justify-between items-start">
                           <span className="font-mono text-xs text-slate-300 bg-slate-900 px-2 py-1 rounded truncate max-w-[70%] border border-slate-700">
                               {run.repo_url.replace('https://github.com/', '')}
                           </span>
                           <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full 
                              ${run.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 
                                run.status === 'FAILED' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'}`}>
                               {run.status.replace('_', ' ')}
                           </span>
                       </div>
                       <p className="text-xs text-slate-500">{new Date(run.created_at).toLocaleString()}</p>
                   </div>
               ))}
            </div>

            {/* Run Details Panel */}
            <div className="flex-1 glass-panel border border-slate-700/50 rounded-2xl p-6 overflow-y-auto">
                {!activeItem ? (
                     <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-60">
                         <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mb-4"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><line x1="9" x2="15" y1="9" y2="9"/><line x1="9" x2="15" y1="15" y2="15"/></svg>
                         <p>Select a history item to view isolated analysis.</p>
                     </div>
                ) : (
                    <div className="flex flex-col gap-6 animate-fade-in">
                        <div className="flex items-center justify-between border-b border-slate-700/50 pb-4">
                            <div className="flex items-center gap-3">
                               <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></div>
                               <h3 className="text-xl font-bold text-white tracking-tight">Enterprise Inspection Report</h3>
                            </div>
                            <button onClick={() => setActiveItem(null)} className="text-slate-400 hover:text-white transition-colors">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        
                        {activeItem.playwright_output && (
                            <div className="flex flex-col gap-2">
                                <span className="text-sm font-semibold text-emerald-400 px-1 decoration-dashed underline underline-offset-4">AI Diagnostic Trace & Corrected Source</span>
                                <div className="bg-[#0b0e14] rounded-xl p-5 overflow-x-auto shadow-inner border border-slate-800">
                                    <pre className="text-[13px] text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
                                        {activeItem.playwright_output}
                                    </pre>
                                </div>
                            </div>
                        )}
                        
                        {activeItem.status === 'FAILED' && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm font-mono mt-4">
                                Error connecting to LLM backend or analyzing file context. Please check API quotas.
                            </div>
                        )}
                        
                        {activeItem.test_code && (
                            <div className="flex flex-col gap-2 mt-4 opacity-75">
                                <span className="text-sm font-semibold text-slate-400 px-1 decoration-dashed underline underline-offset-4">Original Raw Upload</span>
                                <div className="bg-[#1e293b] rounded-xl p-4 overflow-x-auto shadow-inner border border-slate-700/50">
                                    <pre className="text-[12px] text-slate-400 font-mono">
                                        <code>{activeItem.test_code}</code>
                                    </pre>
                                </div>
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
