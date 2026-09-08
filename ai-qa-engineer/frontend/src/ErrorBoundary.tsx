// ============================================================================
// COMPONENT: ERROR BOUNDARY (CRASH RESILIENCE & FALLBACK UI)
// This file implements a standard React Error Boundary class component.
// In React, uncaught rendering errors in any component unmount the entire tree.
// This component catches runtime exceptions during rendering, displays
// an informative glassmorphic recovery screen with the error signature,
// and offers one-click "Reload" and "Home" actions without crashing the whole app.
// ============================================================================

// Import React base classes and lifecycle types for class-based components.
// WHAT: `Component` is the base class for React class components; `ErrorInfo` and `ReactNode` are TypeScript types.
// WHY: React Error Boundaries must be class components because `componentDidCatch` has no hook equivalent in React.
// HOW: Extended by the `ErrorBoundary` class below.
import React, { Component, ErrorInfo, ReactNode } from 'react';

// Import icons from lucide-react for the error recovery UI card.
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';

// ----------------------------------------------------------------------------
// TYPES / INTERFACES
// ----------------------------------------------------------------------------

// Interface defining props accepted by ErrorBoundary.
// WHAT: `children` are the child components wrapped inside; `fallback` is an optional custom JSX UI.
// WHY: Gives flexibility to provide a localized error widget or use the default full-page error view.
interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

// Interface defining the internal state of ErrorBoundary.
// WHAT: Tracks whether an error has been caught (`hasError`) and the caught `Error` object.
// WHY: Controls whether to render the normal child tree or the fallback error view.
interface State {
  hasError: boolean;
  error: Error | null;
}

// ----------------------------------------------------------------------------
// ERROR BOUNDARY CLASS IMPLEMENTATION
// ----------------------------------------------------------------------------

class ErrorBoundary extends Component<Props, State> {
  // Initial component state: no error present.
  public state: State = {
    hasError: false,
    error: null,
  };

  // Static lifecycle method invoked after an error has been thrown by a descendant component.
  // WHAT: Receives the thrown error and returns an updated state object.
  // WHY: React calls this method during the "render" phase to update state and trigger fallback UI rendering.
  // HOW: Updates `hasError` to true and captures the error object.
  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  // Lifecycle method invoked after an error has been caught by the boundary.
  // WHAT: Receives the error and errorInfo containing the component stack trace.
  // WHY: Used for side effects, error logging to external services, or debugging in the browser console.
  // HOW: Logs the error and stack trace to standard browser console.
  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  // Resets error state and refreshes the browser page.
  // WHAT: Sets state back to no-error and triggers `window.location.reload()`.
  // WHY: Allows the user to quickly retry and reload fresh state.
  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  // Resets error state and navigates back to the root application URL.
  // WHAT: Sets state to no-error and redirects browser to `/`.
  // WHY: Returns the user to a safe landing view if a specific route or view was corrupted.
  private handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  // Main render method of the ErrorBoundary component.
  public render() {
    // If an uncaught error was detected in the child component tree:
    if (this.state.hasError) {
      // If a custom fallback was provided via props, render that instead.
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default glassmorphic error recovery card.
      return (
        <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-slate-900/50 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl text-center animate-in fade-in zoom-in duration-300">
            {/* Warning Icon Badge */}
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/20">
              <AlertTriangle className="text-red-500" size={40} />
            </div>
            
            {/* Header and Explanation */}
            <h1 className="text-2xl font-black text-white mb-3 tracking-tight">System Interrupted</h1>
            <p className="text-slate-400 text-sm mb-8 leading-relaxed">
              An unexpected error occurred while processing the request. The diagnostic engine remains stable, but this specific view needs to be reset.
            </p>

            {/* Error Signature Diagnostic Box */}
            <div className="bg-black/40 rounded-lg p-4 mb-8 border border-white/5 text-left overflow-hidden">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Error Signature</p>
              <code className="text-[11px] text-red-400/80 font-mono break-all line-clamp-2">
                {this.state.error?.message || 'Unknown Diagnostic Exception'}
              </code>
            </div>

            {/* Recovery Action Buttons */}
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

    // When no error has occurred, render the child component tree normally.
    return this.props.children;
  }
}

// Export ErrorBoundary as default export for use in main.tsx and App.tsx.
export default ErrorBoundary;
