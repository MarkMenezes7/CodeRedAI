import React from 'react';
import ReactDOM from 'react-dom/client';

import "@/styles/globals.css";
import { App } from './App';
import { AuthProvider } from "@shared/providers/AuthContext";
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);
