import { Component, type ReactNode } from 'react';
import { captureException } from '@arremate/observability';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  eventId?: string;
}

/**
 * Top-level React error boundary.
 *
 * Catches unhandled render/lifecycle errors, reports them via
 * {@link captureException} (which forwards to Sentry when configured), and
 * renders a generic fallback UI so the entire app doesn't go blank.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: { componentStack: string }): void {
    captureException(error, { componentStack: info.componentStack });
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-8 text-center">
            <p className="text-4xl mb-4">⚠️</p>
            <h1 className="text-xl font-bold text-gray-800 mb-2">Algo deu errado</h1>
            <p className="text-gray-500 text-sm mb-6">
              Ocorreu um erro inesperado. Nossa equipe foi notificada.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-brand-500 hover:bg-orange-600 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
            >
              Recarregar página
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
