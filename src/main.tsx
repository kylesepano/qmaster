import { Component, StrictMode } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppProvider } from "./hooks/useApp";
import { AppRoutes } from "./routes/AppRoutes";
import "./styles.css";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
  }
  render() {
    return this.state.failed ? (
      <div className="not-found">
        <h1>Something interrupted play.</h1>
        <p>Reload Qmaster to reconnect to your saved workspace.</p>
        <button
          className="btn primary"
          onClick={() => window.location.reload()}
        >
          Reload Qmaster
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AppProvider>
          <AppRoutes />
        </AppProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
