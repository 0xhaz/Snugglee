/**
 * Stage-1 spike bench (architecture.md §6).
 *
 * A HARNESS, NOT A SECOND APP. Ugly on purpose. One page per pipeline stage,
 * no routing, no state library, no design system. Every hour spent making this
 * pretty is an hour not spent on the player, which is where the entire craft
 * budget belongs (design.md §11).
 *
 * Throwaway: Stage 2 (Aug 1-10) rebuilds against the real backend, because
 * simulating the backend validates a fiction.
 */
import { useEffect, useState } from 'react';

import { api, type KeyHealth } from './api';
import type { CostEntry } from './costs';
import Spike01 from './panels/Spike01';
import Story from './panels/Story';
import Voice from './panels/Voice';

type Tab = 'spike01' | 'story' | 'voice';

export default function App() {
  const [tab, setTab] = useState<Tab>('spike01');
  const [costs, setCosts] = useState<CostEntry[]>([]);
  const [health, setHealth] = useState<KeyHealth | null>(null);
  const [healthErr, setHealthErr] = useState('');

  useEffect(() => {
    api.health().then(setHealth).catch((e) => setHealthErr(String(e)));
  }, []);

  const addCost = (e: CostEntry) => setCosts((c) => [...c, e]);
  const total = costs.reduce((s, c) => s + c.usd, 0);

  return (
    <div className="app">
      <header>
        <h1>Snugglee — Stage 1 spike bench</h1>
        <div className="keys">
          {healthErr ? (
            <span className="bad">proxy down: {healthErr}</span>
          ) : health ? (
            <>
              <span className={health.keys.gemini ? 'ok' : 'bad'}>
                gemini {health.keys.gemini ? '✓' : '✗'}
              </span>
              <span className={health.keys.minimax ? 'ok' : 'bad'}>
                minimax {health.keys.minimax ? '✓' : '✗'}
              </span>
              <span className={health.keys.cartesia ? 'ok' : 'bad'}>
                cartesia {health.keys.cartesia ? '✓' : '✗'}
              </span>
            </>
          ) : (
            <span>checking…</span>
          )}
        </div>
      </header>

      {health && !health.keys.gemini ? (
        <div className="verdict bad">
          <b>No GEMINI_API_KEY.</b> Copy <code>harness/.env.example</code> to{' '}
          <code>harness/.env.local</code> and fill it in, then restart the dev server.
          SPIKE-01 and SPK-03 both need it.
        </div>
      ) : null}

      <nav>
        <button className={tab === 'spike01' ? 'sel' : ''} onClick={() => setTab('spike01')}>
          SPIKE-01 · images (GATING)
        </button>
        <button className={tab === 'story' ? 'sel' : ''} onClick={() => setTab('story')}>
          SPK-03 · story + safety
        </button>
        <button className={tab === 'voice' ? 'sel' : ''} onClick={() => setTab('voice')}>
          O-02 · voice A/B
        </button>
      </nav>

      <main>
        {tab === 'spike01' ? <Spike01 onCost={addCost} /> : null}
        {tab === 'story' ? <Story onCost={addCost} /> : null}
        {tab === 'voice' ? <Voice onCost={addCost} /> : null}
      </main>

      <footer>
        <div className="row">
          <b>Measured spend this session: ${total.toFixed(4)}</b>
          <span className="hint">
            architecture.md §6 — O-03 pack pricing is downstream of measured COGS, not the
            modelled table in §4.
          </span>
          <button onClick={() => setCosts([])} disabled={!costs.length}>
            clear
          </button>
          <button
            onClick={() => {
              const rows = ['at,stage,model,detail,usd']
                .concat(
                  costs.map(
                    (c) =>
                      `${new Date(c.at).toISOString()},"${c.stage}","${c.model}","${c.detail}",${c.usd}`,
                  ),
                )
                .join('\n');
              const url = URL.createObjectURL(new Blob([rows], { type: 'text/csv' }));
              const a = document.createElement('a');
              a.href = url;
              a.download = 'snugglee-measured-cogs.csv';
              a.click();
              URL.revokeObjectURL(url);
            }}
            disabled={!costs.length}
          >
            export CSV
          </button>
        </div>
        {costs.length ? (
          <table>
            <tbody>
              {costs
                .slice()
                .reverse()
                .map((c, i) => (
                  <tr key={i}>
                    <td>{c.stage}</td>
                    <td>{c.model}</td>
                    <td className="hint">{c.detail}</td>
                    <td>${c.usd.toFixed(5)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : null}
      </footer>
    </div>
  );
}
