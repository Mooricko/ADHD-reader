import React from 'react';
import { safeStorage } from '../utils/safeStorage';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ADHD Reader caught an uncaught render error:', error, errorInfo);
  }

  private handleResetState = () => {
    try {
      safeStorage.clearAll();
    } catch {
      // Ignore
    }
    this.setState({ hasError: false, error: null });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0f1117] text-slate-100 flex items-center justify-center p-6 select-none font-sans">
          <div className="max-w-md w-full bg-[#161a23] border border-slate-800/80 rounded-2xl p-6 shadow-2xl space-y-5 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 text-xl font-bold">
              !
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-100 tracking-tight">
                ADHD Reader Recovered
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                A temporary display or state glitch occurred. Your reader has been safely paused to prevent loss of focus.
              </p>
            </div>

            {this.state.error?.message && (
              <div className="text-left bg-slate-900/80 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-400 overflow-x-auto max-h-24">
                {this.state.error.message}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <button
                id="error-boundary-retry-button"
                onClick={this.handleRetry}
                className="w-full py-2.5 px-4 bg-red-500 hover:bg-red-600 active:scale-[0.99] text-white text-sm font-medium rounded-xl transition shadow-lg shadow-red-500/20"
              >
                Try Re-rendering
              </button>

              <button
                id="error-boundary-reset-button"
                onClick={this.handleResetState}
                className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition"
              >
                Reset Saved State & Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
