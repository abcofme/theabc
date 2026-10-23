import { Component } from 'react';
import { CircleAlert, RotateCcw } from './components/ClayIcon';

export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error('ErrorBoundary caught an error', error, errorInfo);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="ui-card w-full max-w-lg">
          <CircleAlert size={28} className="text-[#E5C398] mb-4" aria-hidden="true" />
          <h1 className="text-xl font-bold mb-3">Не удалось открыть приложение</h1>
          <p className="ui-secondary mb-6">Попробуй перезагрузить страницу. Сохраненные записи и результаты останутся на месте.</p>
          <button type="button" onClick={() => window.location.reload()} className="ui-button ui-button--primary"><RotateCcw size={20} /> Перезагрузить</button>
          <details className="ui-disclosure ui-muted mt-6">
            <summary className="py-3">Технические подробности</summary>
            <pre className="whitespace-pre-wrap break-words mt-3">{this.state.error?.toString()}{'\n'}{this.state.errorInfo?.componentStack}</pre>
          </details>
        </div>
      </div>
    );
  }
}
