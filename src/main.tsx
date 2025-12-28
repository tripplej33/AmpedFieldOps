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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
