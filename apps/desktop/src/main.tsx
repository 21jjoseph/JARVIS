import { createRoot } from 'react-dom/client';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Dashboard } from './dashboard/Dashboard';
import { Overlay } from './components/Overlay';
import './styles.css';
class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    console.error('21 interface failed. Restart the application.');
  }
  render() {
    return this.state.error ? (
      <div className="fatal-error" role="alert">
        21 could not render. Restart the application.
      </div>
    ) : (
      this.props.children
    );
  }
}
const overlay = location.hash === '#overlay';
document.documentElement.classList.toggle('overlay-html', overlay);
document.body.classList.toggle('overlay-body', overlay);
createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>{overlay ? <Overlay /> : <Dashboard />}</ErrorBoundary>,
);
