import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-slate-900/50 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl text-center animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/20">
              <AlertTriangle className="text-red-500" size={40} />
            </div>
            
            <h1 className="text-2xl font-black text-white mb-3 tracking-tight">System Interrupted</h1>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed">
              An unexpected error occurred while processing the request. The diagnostic engine remains stable, but this specific view needs to be reset.
            </p>

            <div className="bg-black/40 rounded-lg p-4 mb-8 border border-white/5 text-left overflow-hidden">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Error Signature</p>
              <code className="text-[11px] text-red-400/80 font-mono break-all line-clamp-2">
                {this.state.error?.message || 'Unknown Diagnostic Exception'}
              </code>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={this.handleReset}
                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-xl transition-all active:scale-95 shadow-lg shadow-indigo-500/20"
              >
                <RefreshCcw size={18} />
                <span>Reload</span>
              </button>
              <button
                onClick={this.handleGoHome}
                className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-slate-300 font-bold py-3 px-4 rounded-xl border border-white/10 transition-all active:scale-95"
              >
                <Home size={18} />
                <span>Home</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
