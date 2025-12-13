import { useAccount, useConnect, useDisconnect } from 'wagmi';

interface MenuProps {
  onNavigate: (page: 'menu' | 'charity' | 'runner' | 'snake' | 'tetris') => void;
}

export function Menu({ onNavigate }: MenuProps) {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const handleConnect = () => {
    const injectedConnector = connectors.find((c: { id: string }) => c.id === 'injected');
    if (injectedConnector) {
      connect({ connector: injectedConnector });
    }
  };

  return (
    <div className="menu-container">
      <div className="menu-header">
        <h1 className="menu-title">HOMA</h1>
        <p className="menu-subtitle">Transparent Charity Gaming Platform</p>
      </div>

      <div className="wallet-section">
        {!isConnected ? (
          <button onClick={handleConnect} className="connect-button">
            Connect Wallet
          </button>
        ) : (
          <div className="connected-wallet">
            <div className="wallet-info">
              <div className="status-indicator"></div>
              <div>
                <p className="wallet-label">Connected</p>
                <p className="wallet-address">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </p>
              </div>
            </div>
            <button onClick={() => disconnect()} className="disconnect-button">
              Disconnect
            </button>
          </div>
        )}
      </div>

      <button className="hero-charity-btn" onClick={() => onNavigate('charity')}>
        <div className="hero-charity-icon">
          <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </div>
        <div className="hero-charity-text">
          <span className="hero-charity-title">Charity Hub</span>
          <span className="hero-charity-desc">Donate & Join Lottery for Prizes</span>
        </div>
        <div className="hero-charity-arrow">
          <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
          </svg>
        </div>
      </button>

      <div className="games-section">
        <h2 className="games-section-title">Mini Games</h2>
        <div className="mini-games-grid">
          <button className="mini-game-btn runner-btn" onClick={() => onNavigate('runner')}>
            <span className="mini-game-icon">🎮</span>
            <span className="mini-game-name">Runner</span>
          </button>

          <button className="mini-game-btn snake-btn" onClick={() => onNavigate('snake')}>
            <span className="mini-game-icon">🐍</span>
            <span className="mini-game-name">Snake</span>
          </button>

          <button className="mini-game-btn tetris-btn" onClick={() => onNavigate('tetris')}>
            <span className="mini-game-icon">🧱</span>
            <span className="mini-game-name">Tetris</span>
          </button>

          <button className="mini-game-btn coming-soon-btn" disabled>
            <span className="mini-game-icon">
              <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
            </span>
            <span className="mini-game-name">Coming Soon</span>
          </button>
        </div>
      </div>

      <div className="menu-footer">
        <p>Built on Soneium Minato Testnet</p>
      </div>
    </div>
  );
}
