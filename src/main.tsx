import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './ui/App';
import { buildBlueMatrixModule } from './game/scenarios';
import { getWorld, loadGame, publish } from './game/store';
import '@xyflow/react/dist/style.css';
import './ui/styles.css';

if (!loadGame()) {
  buildBlueMatrixModule(getWorld());
  publish();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
