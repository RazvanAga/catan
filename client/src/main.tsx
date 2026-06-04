import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './socket'; // establishes the connection and wires server pushes into the store
import './ui.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
