
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
      <div style="padding: 20px; font-family: sans-serif; text-align: center;">
        <h2>Application Error</h2>
        <p>There was an error starting the application. Please check the console for details.</p>
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
