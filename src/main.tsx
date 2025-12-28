import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { BrowserRouter } from "react-router-dom";

const basename = import.meta.env.BASE_URL;

// Global error handler for uncaught errors
window.onerror = (message, source, lineno, colno, error) => {
  try {
    const errorLogs = JSON.parse(localStorage.getItem('app_error_logs') || '[]');
    const newError = {
      id: crypto.randomUUID(),
      type: 'client',
      message: String(message),
      details: `Source: ${source}:${lineno}:${colno}`,
      stack: error?.stack,
      created_at: new Date().toISOString(),
    };
    localStorage.setItem('app_error_logs', JSON.stringify([newError, ...errorLogs].slice(0, 200)));
  } catch (e) {
    // Ignore localStorage errors
  }
};

// Global handler for unhandled promise rejections
window.onunhandledrejection = (event) => {
  try {
    const errorLogs = JSON.parse(localStorage.getItem('app_error_logs') || '[]');
    const newError = {
      id: crypto.randomUUID(),
      type: 'client',
      message: event.reason?.message || String(event.reason) || 'Unhandled promise rejection',
      stack: event.reason?.stack,
      created_at: new Date().toISOString(),
    };
    localStorage.setItem('app_error_logs', JSON.stringify([newError, ...errorLogs].slice(0, 200)));
  } catch (e) {
    // Ignore localStorage errors
  }
};

// Fix for stuck dialogs that make page appear greyed out
// Close any stuck overlays on page load
window.addEventListener('load', () => {
  setTimeout(() => {
    // Remove any stuck dialog overlays
    const stuckOverlays = document.querySelectorAll('[data-radix-dialog-overlay]');
    stuckOverlays.forEach(overlay => {
      const dialog = overlay.closest('[data-radix-portal]');
      if (dialog) {
        const content = dialog.querySelector('[data-radix-dialog-content]');
        // If overlay exists but content is missing or hidden, remove the overlay
        if (!content || content.getAttribute('data-state') !== 'open') {
          overlay.remove();
        }
      }
    });
  }, 500);
});

// Global escape key handler to close any open dialogs
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Close any open Radix dialogs
    const openDialogs = document.querySelectorAll('[data-radix-dialog-content][data-state="open"]');
    if (openDialogs.length > 0) {
      // Dispatch escape event to close dialogs
      const escapeEvent = new KeyboardEvent('keydown', { 
        key: 'Escape', 
        code: 'Escape',
        keyCode: 27,
        bubbles: true,
        cancelable: true
      });
      document.body.dispatchEvent(escapeEvent);
    }
  }
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
