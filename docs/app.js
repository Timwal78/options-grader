/**
 * LETHAL SUITE | Dashboard Orchestrator
 * (c) 2026 ScriptMasterLabs™
 */

const SERVICES = [
    { id: 's3', name: 'S3 Engine', url: 'https://order-flow-radar-production.up.railway.app/health' },
    { id: 'grader', name: 'Options Grader', url: 'https://my-options-grader-production.up.railway.app/api/health' },
    { id: 'omega', name: 'Argus Omega', url: 'https://lively-fascination-production-41fa.up.railway.app/health' },
    { id: 'echo', name: 'Echo Forge', url: 'https://echo-forge-production.up.railway.app/health' }
];

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
    startClock();
    pollHealth();
    setInterval(pollHealth, 10000); // Check every 10s
    
    // Initial delay for signal tape simulation
    setTimeout(simulateSignals, 2000);
});

/**
 * Polls the health of all hardened services
 */
async function pollHealth() {
    for (const service of SERVICES) {
        const indicator = document.getElementById(`health-${service.id}`);
        const statusText = document.getElementById(`status-${service.id}`);
        
        try {
            // Using a timeout for the fetch to avoid hanging the UI
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 3000);
            
            const response = await fetch(service.url, { signal: controller.signal });
            clearTimeout(id);
            
            if (response.ok) {
                const data = await response.json();
                updateServiceUI(service.id, true, data);
            } else {
                updateServiceUI(service.id, false);
            }
        } catch (error) {
            updateServiceUI(service.id, false);
        }
    }
}

/**
 * Updates the card UI based on health status
 */
function updateServiceUI(id, isOnline, data = null) {
    const indicator = document.getElementById(`health-${id}`);
    const statusText = document.getElementById(`status-${id}`);
    const card = document.getElementById(`card-${id}`);

    if (isOnline) {
        indicator.className = 'indicator online';
        statusText.innerText = 'ONLINE';
        statusText.style.color = '#00ff88';
        
        // Dynamic metric injection
        if (data) {
            if (id === 's3' && data.engine) {
                document.getElementById('metrics-s3-state').innerText = data.status.toUpperCase();
            }
            if (id === 'omega' && data.status) {
                document.getElementById('metrics-omega-fusion').innerText = 'STABLE ✅';
            }
        }
    } else {
        indicator.className = 'indicator offline';
        statusText.innerText = 'OFFLINE';
        statusText.style.color = '#ff3e3e';
    }
}

/**
 * Injects mock institutional signals into the tape for demo purposes
 */
function simulateSignals() {
    const feed = document.getElementById('signal-feed');
    feed.innerHTML = ''; // Clear placeholder

    const mocks = [
        { ticker: 'GME', grade: 'A+', desc: 'Gamma Expansion Pattern identified. Parity confirm.', time: 'Just Now' },
        { ticker: 'IWM', grade: 'A', desc: '0DTE Ignition Detected. Structural Sweep Target: 215.42', time: '2m ago' },
        { ticker: 'NVDA', grade: 'B+', desc: 'Volatility Squeeze Alignment. Post-confirmation required.', time: '5m ago' }
    ];

    mocks.forEach((sig, index) => {
        setTimeout(() => {
            addSignalToTape(sig);
        }, index * 800);
    });
}

function addSignalToTape(sig) {
    const feed = document.getElementById('signal-feed');
    const item = document.createElement('div');
    item.className = 'signal-item';
    
    // Grade color logic
    const gradeColor = sig.grade.startsWith('A') ? '#00ff88' : '#0088ff';
    
    item.innerHTML = `
        <div class="sig-ticker">${sig.ticker}</div>
        <div class="sig-grade" style="color: ${gradeColor}">${sig.grade}</div>
        <div class="sig-desc">${sig.desc}</div>
        <div class="sig-time">${sig.time}</div>
    `;
    
    feed.prepend(item);
    
    // Limit tape to 10 items
    if (feed.children.length > 10) {
        feed.removeChild(feed.lastChild);
    }
}

/**
 * Dashboard Clock
 */
function startClock() {
    const clockEl = document.getElementById('clock');
    function update() {
        const now = new Date();
        clockEl.innerText = now.toISOString().split('T')[1].split('.')[0] + ' UTC';
    }
    update();
    setInterval(update, 1000);
}
