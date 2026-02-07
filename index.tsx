
// 1. CRITICAL: Polyfill 'process' BEFORE any other imports.
// This prevents 'ReferenceError: process is not defined' when geminiService is loaded.
if (typeof window !== 'undefined') {
  (window as any).process = (window as any).process || { env: {} };
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const renderApp = () => {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    console.error("Critical: Could not find root element with id 'root'");
    return;
  }

  try {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } catch (error) {
    console.error("Failed to render React application:", error);
    rootElement.innerHTML = `
      <div style="padding: 40px; font-family: sans-serif; text-align: center; color: #334155;">
        <h2 style="color: #ef4444;">Application Crash</h2>
        <p>There was an error starting the application. This is likely due to a script loading issue.</p>
        <pre style="background: #f1f5f9; padding: 15px; border-radius: 8px; text-align: left; display: inline-block; margin-top: 20px;">${error instanceof Error ? error.message : String(error)}</pre>
        <div style="margin-top: 20px;">
          <button onclick="window.location.reload()" style="background: #4f46e5; color: white; padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer;">Reload Page</button>
        </div>
      </div>
    `;
  }
};

// Ensure DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderApp);
} else {
  renderApp();
}
