
import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import DonverseApp from './components/donverse/DonverseApp';
import { LangProvider } from './components/donverse/i18n';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <LangProvider>
      <DonverseApp />
    </LangProvider>
  </React.StrictMode>
);
