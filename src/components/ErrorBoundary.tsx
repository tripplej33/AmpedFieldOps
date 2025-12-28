import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
    this.setState({ errorInfo });

    // Log to localStorage for the error log panel to pick up
    try {
      const errorLogs = JSON.parse(localStorage.getItem('app_error_logs') || '[]');
      const newError = {
        id: crypto.randomUUID(),
        type: 'client',
        message: error.message,
        details: `Component Stack: ${errorInfo.componentStack}`,
        stack: error.stack,
        created_at: new Date().toISOString(),
      };
      localStorage.setItem('app_error_logs', JSON.stringify([newError, ...errorLogs].slice(0, 200)));
    } catch (e) {
      // Ignore localStorage errors
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="max-w-lg w-full p-6 border-destructive/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-destructive/10 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <div>
                <h2 className="text-lg font-bold">Something went wrong</h2>
                <p className="text-sm text-muted-foreground">
                  An unexpected error occurred
                </p>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-3 mb-4">
              <p className="text-sm font-mono text-destructive/80">
                {this.state.error?.message || 'Unknown error'}
              </p>
            </div>

            <div className="flex gap-2">
              <Button onClick={() => window.location.href = '/'} variant="outline" className="flex-1">
                Go to Dashboard
              </Button>
              <Button onClick={this.handleReload} className="flex-1">
                <RefreshCw className="w-4 h-4 mr-2" />
                Reload Page
              </Button>
            </div>

            {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
              <details className="mt-4">
                <summary className="text-xs text-muted-foreground cursor-pointer">
                  Stack trace (dev only)
                </summary>
                <pre className="text-xs mt-2 p-2 bg-muted rounded overflow-x-auto">
                  {this.state.error?.stack}
                </pre>
              </details>
            )}
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
