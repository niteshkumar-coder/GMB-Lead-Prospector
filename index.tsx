
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const container = document.getElementById('root');

if (!container) {
  throw new Error("Root element not found");
}

try {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error) {
  console.error("Mounting error:", error);
  container.innerHTML = `
    <div style="display: flex; justify-content: center; align-items: center; height: 100vh; font-family: system-ui; text-align: center;">
      <div>
        <h1 style="color: #ef4444;">App failed to load</h1>
        <p style="color: #64748b;">Please check the browser console for errors.</p>
        <button onclick="location.reload()" style="padding: 8px 16px; background: #4f46e5; color: white; border: none; border-radius: 6px; cursor: pointer;">Retry</button>
      </div>
    </div>
  `;
}
