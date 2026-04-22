import { useState, useEffect } from 'react';

/**
 * LiveFlow Component — SqueezeOS Pro Model
 * TWO FEEDS:
 *   1. DISCOVERY TAPE — constantly rotating market-discovered setups
 *   2. CONVICTION PLAYS — AMC, GME, IWM 0DTE with full strike/date/action
 */
export default function LiveFlow({ onTickerClick }) {
  const [setups, setSetups] = useState([]);
  const [convictions, setConvictions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Poll both feeds
  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [flowRes, convRes] = await Promise.all([
          fetch('http://localhost:3001/api/flow'),
          fetch('http://localhost:3001/api/conviction')
        ]);
        const flowData = await flowRes.json();
        const convData = await convRes.json();
        
        if (flowData.setups) setSetups(flowData.setups);
        if (convData.plays) setConvictions(convData.plays);
      } catch (err) {
        console.error("Feed fetch failed:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, 5000); // 5s refresh
    return () => clearInterval(interval);
  }, []);

  // Calculate staleness (dim after 60s, remove visual after 120s)
  const getStaleness = (timestamp) => {
    const age = Date.now() - new Date(timestamp).getTime();
    if (age > 120000) return 'stale';
    if (age > 60000) return 'aging';
    return 'fresh';
  };

  return (
    <div className="live-flow">
      {/* ── DISCOVERY TAPE ── */}
      <div className="flow-section">
        <div className="flow-header">
          <div className="status-dot pulsing"></div>
          <h3>DISCOVERY TAPE</h3>
          <span className="source-label">{setups.length} ACTIVE</span>
        </div>
        
        <div className="flow-list">
          {loading && setups.length === 0 && (
            <div className="flow-empty">
              <div className="spinner-sm"></div>
              Siphoning market movers ($2-$50)...
            </div>
          )}
          
          {setups.length === 0 && !loading && (
            <div className="flow-empty">
              Scanning for budget-range setups...
            </div>
          )}

          <div className="ticker-track">
            {setups.map((setup, idx) => (
              <div 
                key={`${setup.ticker}-${setup.strike}-${setup.side}-${idx}`} 
                className={`flow-item ${setup.side?.toLowerCase()} ${setup.grade?.startsWith('A') ? 'premium' : ''} ${getStaleness(setup.timestamp)}`}
                onClick={() => onTickerClick(setup.ticker)}
              >
                <div className="flow-item-top">
                  <span className="ticker">${setup.ticker}</span>
                  <div className="setup-meta">
                    <span className={`grade-tag ${setup.grade?.toLowerCase()}`}>{setup.grade}</span>
                    <span className="time">{setup.strike} {setup.side}</span>
                  </div>
                </div>
                
                <div className="flow-item-mid">
                  <span className="underlying-price">${setup.price} • {setup.change > 0 ? '+' : ''}{setup.change?.toFixed(2)}%</span>
                </div>

                <div className="flow-item-bottom">
                   <span className="contract-details">EXP: {setup.expiration}</span>
                   <span className="volume-label">SCORE: {setup.score}</span>
                </div>
                
                <div className="source-branding">SOURCE: {setup.source}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── CONVICTION PLAYS (AMC / GME / IWM 0DTE) ── */}
      <div className="flow-section conviction-section">
        <div className="flow-header conviction-header">
          <div className="status-dot conviction-dot"></div>
          <h3>CONVICTION PLAYS</h3>
          <span className="source-label conviction-label">AMC / GME / IWM 0DTE</span>
        </div>

        <div className="conviction-list">
          {convictions.length === 0 && (
            <div className="flow-empty">
              Scanning conviction tickers for actionable setups...
            </div>
          )}

          {convictions.map((play, idx) => (
            <div 
              key={`conv-${play.ticker}-${play.strike}-${idx}`}
              className={`conviction-card ${play.category?.toLowerCase()}`}
              onClick={() => onTickerClick(play.ticker)}
            >
              <div className="conviction-top">
                <span className="conviction-ticker">{play.ticker}</span>
                <span className={`conviction-action ${play.action?.includes('CALL') ? 'call' : 'put'}`}>
                  {play.action}
                </span>
              </div>
              <div className="conviction-details">
                <span className="conviction-strike">STRIKE: ${play.strike}</span>
                <span className="conviction-exp">EXP: {play.expiration}</span>
                <span className={`grade-tag ${play.grade?.toLowerCase()}`}>{play.grade} ({play.score})</span>
              </div>
              <div className="conviction-greeks">
                <span>Δ {play.delta?.toFixed(3)}</span>
                <span>Θ {play.theta?.toFixed(3)}</span>
                <span>IV {(play.iv * 100)?.toFixed(1)}%</span>
                <span>VOL {play.vol?.toLocaleString()}</span>
              </div>
              <div className="conviction-price">
                ${play.price} • {play.change > 0 ? '+' : ''}{play.change?.toFixed(2)}%
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
