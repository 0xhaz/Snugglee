import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import './index.css';

/**
 * Deliberately NOT wrapped in <StrictMode>.
 *
 * StrictMode double-invokes effects in development. Every call this bench makes
 * costs real money and is logged for the O-03 pricing decision, so double
 * invocation would both double the bill and corrupt the measured COGS figure
 * that architecture.md §6 exists to produce.
 */
createRoot(document.getElementById('root')!).render(<App />);
