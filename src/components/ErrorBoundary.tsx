/**
 * ErrorBoundary — catches render-time errors in a component subtree and
 * shows a friendly recovery UI instead of a blank screen.
 *
 * Usage:
 *   <ErrorBoundary label="Agent Panel">
 *     <AgentPanel />
 *   </ErrorBoundary>
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  /** Human-readable label for the section — shown in the error card */
  label?: string;
  /** Optional custom fallback instead of the default error card */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Caught render error:', error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    const label = this.props.label ?? 'This section';
    const message = this.state.error?.message ?? 'Unknown error';

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: '2rem',
          gap: '1rem',
          color: 'rgba(255,255,255,0.7)',
        }}
      >
        <div
          style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.25)',
            borderRadius: '12px',
            padding: '1.5rem 2rem',
            maxWidth: 420,
            width: '100%',
            textAlign: 'center',
          }}
        >
          <div
            style={{ fontSize: 13, fontWeight: 600, color: 'rgba(239,68,68,0.9)', marginBottom: '0.5rem' }}
          >
            {label} crashed
          </div>
          <div
            style={{
              fontSize: 11,
              fontFamily: 'monospace',
              color: 'rgba(255,255,255,0.45)',
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 6,
              padding: '0.5rem 0.75rem',
              marginBottom: '1rem',
              wordBreak: 'break-all',
            }}
          >
            {message}
          </div>
          <button
            onClick={this.handleReset}
            style={{
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 6,
              color: 'rgba(239,68,68,0.9)',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
              padding: '0.4rem 1rem',
              letterSpacing: '0.04em',
            }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
