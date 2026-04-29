import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import LiveFlow from './components/LiveFlow';
import './index.css'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const API_URL = import.meta.env.PROD ? '' : 'http://localhost:3001';

function App() {
  const [page, setPage] = useState('dashboard');
  const [ticker, setTicker] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('totalScore');
  const [sortDir, setSortDir] = useState('desc');
  const [tier, setTier] = useState('elite');
  const [byokKeys, setByokKeys] = useState(() => {
    try { return JSON.parse(localStorage.getItem('og_byok') || '{}'); } catch { return {}; }
  });
  const [scanHistory, setScanHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('og_history') || '[]'); } catch { return []; }
  });
  const [selectedContract, setSelectedContract] = useState(null);
  const [thesis, setThesis] = useState(null);
  const [thesisLoading, setThesisLoading] = useState(false);
  const [userId, setUserId] = useState(() => {
    let id = localStorage.getItem('og_uid');
    if (!id) {
      id = 'user_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('og_uid', id);
    }
    return id;
  });

  // Handle Stripe Success Redirect
  useEffect(() => {
    // ENFORCED ELITE TIER FOR LOCAL SYSTEM
    setTier('elite');
    localStorage.setItem('og_tier', 'elite');
    
    const params = new URLSearchParams(window.location.search);
    if (params.get('session_id')) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const saveByokKeys = (keys) => {
    setByokKeys(keys);
    localStorage.setItem('og_byok', JSON.stringify(keys));
  };

  const fetchThesis = async (contract) => {
    setThesisLoading(true);
    setSelectedContract(contract);
    setThesis(null);
    try {
      const res = await fetch(`${API_URL}/api/thesis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract, underlyingPrice: results.underlyingPrice, apiKey: byokKeys.openaiKey })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setThesis(data.thesis);
    } catch (e) {
      setThesis(`❌ Error: ${e.message}`);
    } finally {
      setThesisLoading(false);
    }
  };

  const scan = useCallback(async (t) => {
    const scanTicker = t || ticker;
    if (!scanTicker.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: scanTicker, tier, byokConfig: byokKeys, userId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      setResults(data);
      const hist = [{ ticker: data.ticker, price: data.underlyingPrice, time: new Date().toLocaleTimeString(), topGrade: data.results[0]?.grade }, ...scanHistory.slice(0, 9)];
      setScanHistory(hist);
      localStorage.setItem('og_history', JSON.stringify(hist));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [ticker, tier, byokKeys, scanHistory]);

  const handleKey = (e) => { if (e.key === 'Enter') scan(); };

  // Auto-refresh: re-scan the current ticker every 30s so the right side stays current
  useEffect(() => {
    if (!results || !results.ticker) return;
    const interval = setInterval(() => {
      scan(results.ticker);
    }, 30000);
    return () => clearInterval(interval);
  }, [results?.ticker, tier, byokKeys]);

  const filtered = results?.results?.filter(r => {
    if (filter === 'calls') return r.type === 'call';
    if (filter === 'puts') return r.type === 'put';
    if (filter === 'a-grade') return r.totalScore >= 83;
    if (filter === 'itm') return r.inTheMoney;
    return true;
  }).sort((a, b) => {
    const val = sortDir === 'desc' ? b[sortBy] - a[sortBy] : a[sortBy] - b[sortBy];
    return val;
  }) || [];

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const gradeClass = (grade) => {
    if (grade.startsWith('A')) return 'A';
    if (grade.startsWith('B')) return 'B';
    if (grade.startsWith('C')) return 'C';
    if (grade.startsWith('D')) return 'D';
    return 'F';
  };

  return (
    <>
      <header className="header">
        <div className="header-brand">
          <div className="logo">MY OPTIONS GRADER</div>
          <div className="sub">by ScriptMasterLabs</div>
        </div>
        <nav className="header-nav">
          <button className={`nav-btn ${page === 'dashboard' ? 'active' : ''}`} onClick={() => setPage('dashboard')}>Scanner</button>
          <button className={`nav-btn ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}>Settings</button>
          <div className="nav-badge elite">💎 ELITE ACCESS</div>
        </nav>
      </header>

      <main className="main">
        <div className="workstation-container">
          <aside className="sidebar">
            <LiveFlow onTickerClick={(t) => { setTicker(t); scan(t); }} />
          </aside>
          <section className="terminal">
            {page === 'dashboard' && <Dashboard {...{ 
              ticker, setTicker, scan, handleKey, loading, error, results, filtered, filter, setFilter, sortBy, sortDir, toggleSort, gradeClass, tier, scanHistory,
              fetchThesis, selectedContract, setSelectedContract, thesis, thesisLoading, setPage
            }} />}
            {page === 'settings' && <Settings byokKeys={byokKeys} saveByokKeys={saveByokKeys} />}
            {page === 'pricing' && <Pricing userId={userId} API_URL={API_URL} />}
          </section>
        </div>
      </main>

      <footer className="footer">
        My Options Grader v2.0 — <a href="https://www.scriptmasterlabs.com" target="_blank" rel="noopener">ScriptMasterLabs™</a> — www.scriptmasterlabs.com
      </footer>
    </>
  );
}

function Dashboard({ ticker, setTicker, scan, handleKey, loading, error, results, filtered, filter, setFilter, sortBy, sortDir, toggleSort, gradeClass, tier, scanHistory, fetchThesis, selectedContract, setSelectedContract, thesis, thesisLoading, setPage }) {
  return (
    <>
      <div className="scan-bar">
        <input className="scan-input" placeholder="SPY" value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} onKeyDown={handleKey} maxLength={5} />
        <button className={`scan-btn ${loading ? 'loading' : ''}`} onClick={() => scan()} disabled={loading || !ticker.trim()}>
          {loading ? '⏳ Scanning...' : '🔍 SCAN & GRADE'}
        </button>
      </div>

      {error && <div style={{ background: 'rgba(255,68,68,0.1)', border: '1px solid #FF4444', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#FF4444', fontSize: '0.85rem' }}>⚠ {error}</div>}

      {results && (
        <>
          <div className="stats-bar">
            <div className="stat-card"><div className="label">Ticker</div><div className="value blue">${results.ticker}</div></div>
            <div className="stat-card"><div className="label">Price</div><div className="value">${results.underlyingPrice?.toFixed(2)}</div></div>
            <div className="stat-card"><div className="label">Contracts</div><div className="value green">{results.totalContracts}</div></div>
            <div className="stat-card"><div className="label">Active Data Source</div><div className="value source-badge">{results.source}</div></div>
          </div>

          <ChainChart results={results} filtered={filtered} />


          <div className="filters">
            {['all', 'calls', 'puts', 'a-grade', 'itm'].map(f => (
              <button key={f} className={`filter-chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'a-grade' ? 'A+ / A Only' : f === 'itm' ? 'In-The-Money' : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          <div className="results-table">
            <table>
              <thead>
                <tr>
                  <th className="sortable" onClick={() => toggleSort('totalScore')}>Grade {sortBy === 'totalScore' ? (sortDir === 'desc' ? '↓' : '↑') : ''}</th>
                  <th>Score</th>
                  <th>Type</th>
                  <th className="sortable" onClick={() => toggleSort('strike')}>Strike {sortBy === 'strike' ? (sortDir === 'desc' ? '↓' : '↑') : ''}</th>
                  <th>Exp</th>
                  <th>DTE</th>
                  <th className="sortable" onClick={() => toggleSort('lastPrice')}>Price {sortBy === 'lastPrice' ? (sortDir === 'desc' ? '↓' : '↑') : ''}</th>
                  <th>Bid / Ask</th>
                  <th className="sortable" onClick={() => toggleSort('delta')}>Delta</th>
                  <th>IV</th>
                  <th>Vol</th>
                  <th>AI Thesis</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={i} className={`grade-${gradeClass(r.grade).toLowerCase()}`}>
                    <td><span className={`grade-badge ${gradeClass(r.grade)}`}>{r.grade}</span></td>
                    <td>{r.totalScore}<div className="score-bar"><div className="score-bar-fill" style={{ width: `${r.totalScore}%`, background: r.gradeColor }} /></div></td>
                    <td><span className={`type-badge ${r.type}`}>{r.type.toUpperCase()}</span></td>
                    <td>${r.strike?.toFixed(2)}</td>
                    <td style={{ fontSize: '0.75rem' }}>{r.expiration ? new Date(r.expiration).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                    <td>{r.dte}d</td>
                    <td>${r.lastPrice?.toFixed(2)}</td>
                    <td style={{ fontSize: '0.75rem' }}>${r.bid?.toFixed(2)} / ${r.ask?.toFixed(2)}</td>
                    <td style={{ color: r.delta >= 0 ? '#00E676' : '#FF5252' }}>{r.delta?.toFixed(3)}</td>
                    <td>{(r.impliedVolatility * 100)?.toFixed(1)}%</td>
                    <td>{r.volume?.toLocaleString()}</td>
                    <td>
                      <button className="thesis-btn" onClick={() => fetchThesis(r)}>
                        Institutional Thesis
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedContract && (
            <ThesisModal 
              contract={selectedContract} 
              thesis={thesis} 
              loading={thesisLoading} 
              onClose={() => setSelectedContract(null)} 
            />
          )}

          {results.limited && (
            <div className="upgrade-banner">
              <h3>🔒 {results.hiddenCount} more contracts hidden</h3>
              <p>Upgrade to {tier === 'free' ? 'Starter' : 'Pro'} to see more results and unlock advanced filters.</p>
              <button className="cta-btn" onClick={() => setPage('pricing')}>⚡ Unlock Full Results</button>
            </div>
          )}
        </>
      )}

      {!results && !loading && (
        <div className="empty-state">
          <div className="icon">🎯</div>
          <h2>Awaiting Market Target</h2>
          <p>Enter any optionable stock symbol to get every contract graded A+ through F based on real-time institutional factors.</p>
        </div>
      )}

      {loading && <div className="loading-spinner" />}
    </>
  );
}

function ChainChart({ results, filtered }) {
  const chartData = useMemo(() => {
    // Sort by strike for chart
    const sorted = [...filtered].sort((a, b) => a.strike - b.strike);
    return {
      labels: sorted.map(s => `$${s.strike}`),
      datasets: [
        {
          label: 'Total Score',
          data: sorted.map(s => s.totalScore),
          borderColor: '#39FF14',
          backgroundColor: 'rgba(57, 255, 20, 0.1)',
          fill: true,
          tension: 0.4
        },
        {
          label: 'IV %',
          data: sorted.map(s => s.impliedVolatility * 100),
          borderColor: '#00D4FF',
          borderDash: [5, 5],
          tension: 0.4
        }
      ]
    };
  }, [filtered]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top', labels: { color: '#8888AA', font: { size: 10 } } },
      tooltip: { mode: 'index', intersect: false }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#555570', font: { size: 9 } } },
      y: { grid: { color: 'rgba(42, 42, 58, 0.5)' }, ticks: { color: '#555570', font: { size: 9 } } }
    }
  };

  return (
    <div className="chart-container">
      <Line data={chartData} options={options} />
    </div>
  );
}

function ThesisModal({ contract, thesis, loading, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Institutional Trade Thesis — {contract.contractSymbol}</h3>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="loading-spinner" />
          ) : (
            <div className="thesis-text">
              {thesis?.split('\n').map((line, i) => (
                <p key={i} style={{ marginBottom: line.trim() ? '0.5rem' : '1rem', color: line.startsWith('-') || line.match(/^\d\./) ? 'var(--neon-green)' : 'inherit' }}>
                  {line}
                </p>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Generated by Elite AI Engine • ScriptMasterLabs™</p>
        </div>
      </div>
    </div>
  );
}

function Settings({ byokKeys, saveByokKeys }) {
  const [testResults, setTestResults] = useState({});
  const [schwabCode, setSchwabCode] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const updateScreen = (key, val) => saveByokKeys({ ...byokKeys, [key]: val });

  const connectSchwab = async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/schwab/url`);
      const data = await res.json();
      if (data.url) window.open(data.url, '_blank');
      setIsConnecting(true);
    } catch (e) { alert('Failed to get Auth URL'); }
  };

  const handleSchwabCallback = async () => {
    if (!schwabCode) return;
    setTestResults(r => ({ ...r, schwab: 'testing' }));
    try {
      // Parse code if they paste the whole URL
      let code = schwabCode;
      if (code.includes('code=')) {
        code = new URLSearchParams(new URL(code).search).get('code');
      }
      
      const res = await fetch(`${API_URL}/api/auth/schwab/callback`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });
      const data = await res.json();
      if (data.success) {
        setTestResults(r => ({ ...r, schwab: 'success' }));
        updateScreen('schwabToken', data.tokens.access_token);
        setIsConnecting(false);
        setSchwabCode('');
      } else throw new Error(data.error);
    } catch (e) {
      setTestResults(r => ({ ...r, schwab: 'failed: ' + e.message }));
    }
  };

  const testKey = async (provider, key) => {
    if (!key) return;
    setTestResults(r => ({ ...r, [provider]: 'testing' }));
    try {
      const res = await fetch(`${API_URL}/api/validate-key`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key })
      });
      const data = await res.json();
      setTestResults(r => ({ ...r, [provider]: data.valid ? 'success' : 'failed: ' + data.message }));
    } catch (e) {
      setTestResults(r => ({ ...r, [provider]: 'error' }));
    }
  };

  return (
    <div className="settings-page">
      <h2 style={{ marginBottom: '1.5rem' }}>⚙ Settings — BYOK (Bring Your Own Keys)</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        The grader works out of the box with Yahoo Finance (free). Add your own API keys below for premium data with real-time Greeks, faster scans, and more expirations.
      </p>

      <div className="settings-section">
        <h3>📊 Market Data Providers</h3>
        
        {/* Schwab OAuth Section */}
        <div className="key-input-group" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
          <label>Charles Schwab <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>— Real-time Greeks, Volatility, and Institutional Streams</span></label>
          <div className="key-input-row" style={{ marginTop: '0.5rem' }}>
            <button className={`nav-btn upgrade ${testResults.schwab === 'success' ? 'success' : ''}`} onClick={connectSchwab} style={{ width: 'auto', padding: '0 1.5rem' }}>
              {testResults.schwab === 'success' ? '✓ Schwab Connected' : '🔑 Login to Schwab (OAuth2)'}
            </button>
            {isConnecting && (
              <div style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
                <input className="key-input" placeholder="Paste Auth Code (or Callback URL) here..." value={schwabCode} onChange={e => setSchwabCode(e.target.value)} />
                <button className="test-btn" onClick={handleSchwabCallback}>Authorize</button>
              </div>
            )}
          </div>
          {testResults.schwab?.startsWith('failed') && <div style={{ color: '#FF5252', fontSize: '0.8rem', marginTop: '0.5rem' }}>⚠ {testResults.schwab}</div>}
        </div>

        {[
          { id: 'polygonKey', label: 'Polygon.io API Key', provider: 'polygon', desc: 'Real-time market data — free tier available' },
          { id: 'tradierKey', label: 'Tradier API Key', provider: 'tradier', desc: 'Free developer account — real options data with Greeks' },
          { id: 'alpacaKey', secretId: 'alpacaSecret', label: 'Alpaca API Key & Secret', provider: 'alpaca', desc: 'Market data backup — paper or live' }
        ].map(({ id, secretId, label, provider, desc }) => (
          <div className="key-input-group" key={id}>
            <label>{label} <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>— {desc}</span></label>
            <div className="key-input-row" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input className="key-input" type="password" placeholder={secretId ? "Key ID..." : "Paste API key..."} value={byokKeys[id] || ''} onChange={e => updateScreen(id, e.target.value)} />
              {secretId && (
                <input className="key-input" type="password" placeholder="Secret Key..." value={byokKeys[secretId] || ''} onChange={e => updateScreen(secretId, e.target.value)} />
              )}
              <button className={`test-btn ${testResults[provider] === 'success' ? 'success' : ''}`} onClick={() => testKey(provider, secretId ? { keyId: byokKeys[id], secret: byokKeys[secretId] } : byokKeys[id])}>
                {testResults[provider] === 'testing' ? '...' : testResults[provider] === 'success' ? '✓ Connected' : 'Test'}
              </button>
            </div>
            {testResults[provider]?.startsWith('failed') && <div style={{ color: '#FF5252', fontSize: '0.8rem', marginTop: '0.2rem' }}>⚠ {testResults[provider]}</div>}
          </div>
        ))}
      </div>


      <div className="settings-section">
        <h3>🤖 AI Provider (for Trade Thesis — Elite tier)</h3>
        <div className="key-input-group">
          <label>OpenAI API Key <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none' }}>— Generates AI trade thesis for each contract</span></label>
          <div className="key-input-row">
            <input className="key-input" type="password" placeholder="sk-..." value={byokKeys.openaiKey || ''} onChange={e => updateScreen('openaiKey', e.target.value)} />
          </div>
        </div>
      </div>

      <div style={{ marginTop: '1rem', padding: '1rem', background: 'var(--bg-card)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          🔒 Your keys are stored locally in your browser. They are <strong>never</strong> stored on our servers. Keys are sent directly to the data provider on each scan.
        </p>
      </div>
    </div>
  );
}

function Pricing({ userId, API_URL }) {
  const [loading, setLoading] = useState(null);
  const tiers = [
    { id: 'starter', name: 'Starter', price: '$19', features: ['5 scans per day', '10 results per scan', '6-factor grade + score', 'Basic filters', 'BYOK key support'], disabled: ['CSV export', 'AI trade thesis', 'Multi-leg strategies'] },
    { id: 'pro', name: 'Pro', price: '$49', featured: true, features: ['Unlimited scans', 'Full options chain', 'Advanced filters', 'CSV export', '6-factor breakdown', 'BYOK key support'], disabled: ['AI trade thesis', 'Multi-leg strategies'] },
    { id: 'elite', name: 'Elite', price: '$149', features: ['Everything in Pro', 'AI trade thesis (BYOK)', 'Multi-leg strategy suggestions', 'Priority data refresh', 'Institutional-grade analytics', 'BYOK key support', 'Email alerts (coming soon)'], disabled: [] }
  ];

  const handleUpgrade = async (tierId) => {
    setLoading(tierId);
    try {
      const res = await fetch(`${API_URL}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, tier: tierId })
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else throw new Error(data.error);
    } catch (e) {
      alert('Checkout error: ' + e.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.6rem', marginBottom: '0.5rem' }}>Choose Your Edge</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Every trade starts with knowing the grade. Stop guessing.</p>
      </div>
      <div className="pricing-grid">
        {tiers.map(t => (
          <div key={t.name} className={`pricing-card ${t.featured ? 'featured' : ''}`}>
            <div className="tier-name">{t.name}</div>
            <div className="price">{t.price}<span>/mo</span></div>
            <ul className="features">
              {t.features.map((f, i) => <li key={i}>{f}</li>)}
              {t.disabled.map((f, i) => <li key={`d-${i}`} className="disabled">{f}</li>)}
            </ul>
            <button className="buy-btn" onClick={() => handleUpgrade(t.id)} disabled={loading}>
              {loading === t.id ? '⏳ Connecting...' : `Get ${t.name}`}
            </button>
          </div>
        ))}
      </div>
      <div style={{ textAlign: 'center', marginTop: '2rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
        ScriptMasterLabs™ • www.scriptmasterlabs.com • Cancel anytime
      </div>
    </div>
  );
}

export default App
