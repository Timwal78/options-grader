import { useState, useEffect } from 'react';

/**
 * LiveFlow Component
 * SQUEEZE OS: 100% FETCH / ZERO DEMO
 * Renders a real-time stream of vetted Grade A/A+ institutional setups.
 */
export default function LiveFlow({ onTickerClick }) {
  const [setups, setSetups] = useState([]);
  const [loading, setLoading] = useState(true);

  // Poll the Discovery Engine for real setups
  useEffect(() => {
    const fetchFlow = async () => {
      try {
        const res = await fetch('http://localhost:3001/api/flow');
        const data = await res.json();
        if (data.setups) {
          setSetups(data.setups);
        }
      } catch (err) {
        console.error("Flow fetch failed:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchFlow();
    const interval = setInterval(fetchFlow, 5000); // 5s refresh
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="live-flow">
      <div className="flow-header">
        <div className="status-dot pulsing"></div>
        <h3>MARKET DISCOVERY TAPE</h3>
        <span className="source-label">MANIFESTO ENGINE</span>
      </div>
      
      <div className="flow-list">
        {loading && setups.length === 0 && (
          <div className="flow-empty">
            <div className="spinner-sm"></div>
            Siphoning full market depth...
          </div>
        )}
        
        {setups.length === 0 && !loading && (
          <div className="flow-empty">
            Searching for institutional Grade A+ setups...
          </div>
        )}

        <div className="ticker-track">
          {[...setups, ...setups].map((setup, idx) => (
            <div 
              key={`${setup.ticker}-${setup.side}-${idx}`} 
              className={`flow-item ${setup.side.toLowerCase()} ${setup.grade.startsWith('A') ? 'premium' : ''}`}
              onClick={() => onTickerClick(setup.ticker)}
            >
              <div className="flow-item-top">
                <span className="ticker">${setup.ticker}</span>
                <div className="setup-meta">
                  <span className={`grade-tag ${setup.grade.toLowerCase()}`}>{setup.grade}</span>
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
  );
}

