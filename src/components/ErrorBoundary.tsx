import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Last-resort guard so the user never sees a solid grey/blank screen when
 * something throws during render. Common on web refresh / mobile PWA where
 * a transient hydration error would otherwise leave the page empty.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[ErrorBoundary] caught:", error, info);
  }

  handleReload = () => {
    try { sessionStorage.clear(); } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="fixed inset-0 z-[10000] flex flex-col items-center justify-center px-6 text-center"
          style={{ backgroundColor: "#96725e", color: "#fff8ee" }}
        >
          <div className="text-5xl mb-4">🧸</div>
          <h1 className="text-xl font-bold mb-2">Cubbly hit a snag</h1>
          <p className="text-sm opacity-80 mb-6 max-w-sm">
            Something unexpected happened. A quick reload usually sorts it out.
          </p>
          <button
            onClick={this.handleReload}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold transition-transform hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, hsl(32, 80%, 55%), hsl(20, 75%, 50%))",
              color: "white",
              boxShadow: "0 6px 20px hsla(32, 80%, 50%, 0.35)",
            }}
          >
            Reload Cubbly
          </button>
          {this.state.error && (
            <details className="mt-6 text-xs opacity-60 max-w-md">
              <summary className="cursor-pointer">Details</summary>
              <pre className="mt-2 text-left whitespace-pre-wrap break-all">
                {this.state.error.message}
              </pre>
            </details>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
