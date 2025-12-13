import { useState, useEffect, useCallback } from 'react';
import { useAccount, useReadContracts, useSwitchChain, useChainId, usePublicClient } from 'wagmi';
import { formatEther, parseAbiItem } from 'viem';
import { useHomaCore } from '../hooks/useHomaCore';
import { useEthPrice } from '../hooks/useEthPrice';
import { HOMA_CORE_ADDRESS, HOMA_CORE_ABI } from '../contracts/abi';

interface DonationEvent {
  txHash: string;
  projectId: number;
  ethAmount: bigint;
  usdCents: number;
  sourceApp: string;
  blockNumber: bigint;
}

const SONEIUM_MINATO_CHAIN_ID = 1946;

interface ProjectData {
  id: number;
  name: string;
  wallet: string;
  targetAmount: bigint;
  currentAmount: bigint;
  isCompleted: boolean;
  isOpen: boolean;
}

interface CharityPanelProps {
  onBack: () => void;
}

type TabType = 'dashboard' | 'projects' | 'lottery' | 'history' | 'leaderboard';

export function CharityPanel({ onBack }: CharityPanelProps) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { ethPrice, ethToUsd } = useEthPrice();
  const publicClient = usePublicClient();
  
  const isCorrectNetwork = chainId === SONEIUM_MINATO_CHAIN_ID;
  const {
    lotteryStatus,
    projectCount,
    globalRankings,
    roundRankings,
    userAccumulation,
    pendingWinnings,
    donate,
    claimWinnings,
    isPending,
    isConfirming,
    isSuccess,
    txHash,
    refetchAll
  } = useHomaCore(address);

  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [leaderboardMode, setLeaderboardMode] = useState<'global' | 'round'>('global');
  const [selectedProject, setSelectedProject] = useState(0);
  const [selectedProjectDetail, setSelectedProjectDetail] = useState(0);
  const [ethAmount, setEthAmount] = useState(() => {
    return '0.001';
  });
  const [charityOnly, setCharityOnly] = useState(false);
  const [ethAmountInitialized, setEthAmountInitialized] = useState(false);
  const [countdown, setCountdown] = useState('00:00:00');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [history, setHistory] = useState<DonationEvent[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyFetched, setHistoryFetched] = useState(false);

  const WINNER_PERCENTAGES = [50, 30, 20];

  const projectCalls = projectCount ? Array.from({ length: Number(projectCount) }, (_, i) => ({
    address: HOMA_CORE_ADDRESS as `0x${string}`,
    abi: HOMA_CORE_ABI,
    functionName: 'getProject' as const,
    args: [BigInt(i)]
  })) : [];

  const { data: projectsData } = useReadContracts({
    contracts: projectCalls,
    query: { enabled: projectCalls.length > 0 }
  });

  useEffect(() => {
    if (projectsData) {
      const loadedProjects: ProjectData[] = [];
      projectsData.forEach((result: { status: string; result?: unknown }, i: number) => {
        if (result.status === 'success' && result.result) {
          const [name, wallet, targetAmount, currentAmount, isCompleted, isOpen] = result.result as [string, string, bigint, bigint, boolean, boolean];
          loadedProjects.push({
            id: i,
            name: name || `Project ${i + 1}`,
            wallet,
            targetAmount,
            currentAmount,
            isCompleted,
            isOpen
          });
        }
      });
      setProjects(loadedProjects);
      if (loadedProjects.length > 0 && selectedProject === 0) {
        const firstOpenProject = loadedProjects.find(p => p.isOpen);
        if (firstOpenProject) {
          setSelectedProject(firstOpenProject.id);
        }
        setSelectedProjectDetail(loadedProjects[0].id);
      }
    }
  }, [projectsData, selectedProject]);

  useEffect(() => {
    if (!lotteryStatus) return;
    
    const updateCountdown = () => {
      const nextDraw = Number(lotteryStatus[1]) * 1000;
      const now = Date.now();
      const diff = nextDraw - now;
      
      if (diff <= 0) {
        setCountdown('00:00:00');
        return;
      }
      
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      if (days > 0) {
        setCountdown(`${days}d ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      } else {
        setCountdown(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [lotteryStatus]);

  useEffect(() => {
    if (isSuccess) {
      refetchAll();
      setShowConfirmModal(false);
    }
  }, [isSuccess, refetchAll]);

  useEffect(() => {
    if (!ethAmountInitialized && ethPrice > 0) {
      const oneUsdInEth = 1 / ethPrice;
      setEthAmount(oneUsdInEth.toFixed(6));
      setEthAmountInitialized(true);
    }
  }, [ethPrice, ethAmountInitialized]);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!publicClient || !address || !isConnected || historyFetched) return;
      
      setIsLoadingHistory(true);
      try {
        const currentBlock = await publicClient.getBlockNumber();
        const fromBlock = currentBlock > 50000n ? currentBlock - 50000n : 0n;
        
        const logs = await publicClient.getLogs({
          address: HOMA_CORE_ADDRESS,
          event: parseAbiItem('event DonationReceived(address indexed donor, uint256 projectId, uint256 ethAmount, uint256 usdCents, string sourceApp)'),
          args: { donor: address },
          fromBlock,
          toBlock: 'latest'
        });
        
        const events: DonationEvent[] = logs.map(log => ({
          txHash: log.transactionHash,
          projectId: Number(log.args.projectId || 0),
          ethAmount: log.args.ethAmount || 0n,
          usdCents: Number(log.args.usdCents || 0),
          sourceApp: log.args.sourceApp || '',
          blockNumber: log.blockNumber
        })).reverse();
        
        setHistory(events);
        setHistoryFetched(true);
      } catch (err) {
        console.error('Failed to fetch donation history:', err);
      } finally {
        setIsLoadingHistory(false);
      }
    };
    
    if (activeTab === 'history' && isConnected && address && !historyFetched) {
      fetchHistory();
    }
  }, [activeTab, isConnected, address, publicClient, historyFetched]);

  const handleDonate = useCallback(() => {
    const usdValue = ethToUsd(parseFloat(ethAmount));
    const usdCents = Math.floor(usdValue * 100);
    donate(selectedProject, ethAmount, !charityOnly, usdCents);
    setShowConfirmModal(false);
  }, [donate, selectedProject, ethAmount, charityOnly, ethToUsd]);

  const handleClaim = () => {
    if (pendingWinnings && pendingWinnings > 0n) {
      claimWinnings();
    }
  };

  const usdValue = ethToUsd(parseFloat(ethAmount) || 0);
  const ticketCount = Math.floor(usdValue);
  const isSubDollar = usdValue < 1 && usdValue > 0;

  const formatRankings = (rankings: unknown): { rank: number; wallet: string; amount: string }[] => {
    if (!rankings || !Array.isArray(rankings)) return [];
    return rankings
      .filter((r: { wallet: string }) => r.wallet !== '0x0000000000000000000000000000000000000000')
      .map((r: { wallet: string; totalAmount: bigint }, i: number) => ({
        rank: i + 1,
        wallet: r.wallet,
        amount: formatEther(r.totalAmount)
      }));
  };

  const getProjectProgress = (project: ProjectData) => {
    if (project.targetAmount === 0n) return 0;
    return Number((project.currentAmount * 100n) / project.targetAmount);
  };

  const lotteryPool = lotteryStatus ? parseFloat(formatEther(lotteryStatus[0])) : 0;

  return (
    <div className="charity-container">
      <header className="charity-header">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <div className="logo">HOMA</div>
        <div className="wallet-badge">
          {isConnected ? `${address?.slice(0, 6)}...` : 'Not Connected'}
        </div>
      </header>

      <main className="charity-content">
        {activeTab === 'dashboard' && (
          <>
            {isConnected && userAccumulation && (
              <div className="user-status-card">
                <div className="status-item">
                  <span className="status-value">{Number(userAccumulation[1])}</span>
                  <span className="status-label">Tickets</span>
                </div>
                <div className="status-item">
                  <span className="status-value">{Number(userAccumulation[0]) % 100}¢</span>
                  <span className="status-label">Accumulated</span>
                </div>
                <div className="status-item">
                  <span className="status-value" style={{ color: '#fbbf24' }}>{100 - (Number(userAccumulation[0]) % 100)}¢</span>
                  <span className="status-label" style={{ color: '#fbbf24' }}>Next Ticket</span>
                </div>
              </div>
            )}

            <div className="stats-grid">
              <div className="stat-box charity-stat" onClick={() => setActiveTab('projects')}>
                <span className="stat-value">{projects.filter(p => p.isOpen).length}</span>
                <span className="stat-label">Active Projects</span>
              </div>
              <div className="stat-box lottery-stat" onClick={() => setActiveTab('lottery')}>
                <span className="stat-value">
                  {lotteryPool.toFixed(4)} ETH
                </span>
                <span className="stat-label">Lottery Pool</span>
              </div>
            </div>

            <div className="timer-card">
              <p className="timer-label">Next Lottery Draw</p>
              <p className="countdown">{countdown}</p>
            </div>

            <div className="donation-card">
              <div className="donation-header">
                <h3>Donation Panel</h3>
                <span className="ticket-rate">1 Ticket = $1 USD</span>
              </div>

              <select 
                className="project-select"
                value={selectedProject}
                onChange={(e) => setSelectedProject(Number(e.target.value))}
              >
                {projects.filter(p => p.isOpen).length > 0 ? (
                  projects.filter(p => p.isOpen).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({parseFloat(formatEther(p.currentAmount)).toFixed(2)} / {parseFloat(formatEther(p.targetAmount)).toFixed(2)} ETH)
                    </option>
                  ))
                ) : (
                  <option value={0}>Loading projects...</option>
                )}
              </select>

              <div className="amount-input-wrapper">
                <span className="currency-label">ETH</span>
                <input
                  type="number"
                  className="amount-input"
                  value={ethAmount}
                  onChange={(e) => setEthAmount(e.target.value)}
                  step="0.0001"
                  min="0"
                  inputMode="decimal"
                />
              </div>

              <div className="usd-info">
                <span>≈ ${usdValue.toFixed(2)}</span>
                <span>1 ETH = ${ethPrice.toFixed(0)}</span>
              </div>

              <input
                type="range"
                className="amount-slider"
                min="0"
                max="0.1"
                step="0.0001"
                value={ethAmount}
                onChange={(e) => setEthAmount(e.target.value)}
              />

              <div className="ticket-display">
                <span>Tickets earned:</span>
                <span className="ticket-badge">{ticketCount}</span>
              </div>

              {isSubDollar && !charityOnly && (
                <div className="warning-message">
                  <span className="warning-icon">⚠️</span>
                  <span>Amount under $1 will be <strong>accumulated</strong> until it reaches $1 for a ticket.</span>
                </div>
              )}

              <div className="distribution-bar">
                {charityOnly ? (
                  <div className="bar-segment charity-segment" style={{ width: '100%' }}>
                    100% Charity
                  </div>
                ) : (
                  <>
                    <div className="bar-segment charity-segment" style={{ width: '60%' }}>60%</div>
                    <div className="bar-segment lottery-segment" style={{ width: '30%' }}>30%</div>
                    <div className="bar-segment treasury-segment" style={{ width: '10%' }}>10%</div>
                  </>
                )}
              </div>

              <label className="charity-only-toggle">
                <input
                  type="checkbox"
                  checked={charityOnly}
                  onChange={(e) => setCharityOnly(e.target.checked)}
                />
                <div className="toggle-content">
                  <span className="toggle-title">Charity Only</span>
                  <span className="toggle-desc">100% to charity (no lottery)</span>
                </div>
              </label>

              {!isCorrectNetwork ? (
                <button 
                  className="donate-btn switch-network-btn"
                  onClick={() => switchChain({ chainId: SONEIUM_MINATO_CHAIN_ID })}
                >
                  Switch to Soneium
                </button>
              ) : (
                <button 
                  className="donate-btn"
                  onClick={() => setShowConfirmModal(true)}
                  disabled={!isConnected || isPending || isConfirming || parseFloat(ethAmount) <= 0}
                >
                  {isPending || isConfirming ? 'Processing...' : 'PAY & DONATE'}
                </button>
              )}

              {isSuccess && txHash && (
                <div className="success-message">
                  <p>✅ Donation successful!</p>
                  <a 
                    href={`https://soneium-minato.blockscout.com/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="tx-link"
                  >
                    View Transaction ↗
                  </a>
                </div>
              )}
            </div>

            {pendingWinnings && pendingWinnings > 0n && (
              <div className="winnings-card">
                <p>You have unclaimed winnings!</p>
                <p className="winnings-amount">{formatEther(pendingWinnings)} ETH</p>
                <button className="claim-btn" onClick={handleClaim}>
                  Claim Now
                </button>
              </div>
            )}
          </>
        )}

        {activeTab === 'projects' && (
          <div className="projects-section">
            <div className="section-card">
              <h3>📂 Project Details</h3>
              
              <select 
                className="project-select"
                value={selectedProjectDetail}
                onChange={(e) => setSelectedProjectDetail(Number(e.target.value))}
              >
                {projects.length > 0 ? (
                  projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({parseFloat(formatEther(p.currentAmount)).toFixed(2)} / {parseFloat(formatEther(p.targetAmount)).toFixed(2)} ETH)
                    </option>
                  ))
                ) : (
                  <option value={0}>Select a project...</option>
                )}
              </select>

              {projects.find(p => p.id === selectedProjectDetail) && (
                <div className="project-info">
                  <div className="project-image">
                    <img 
                      src="https://placehold.co/600x400/002D62/3BE9F3?text=Project+Image" 
                      alt="Project" 
                      className="project-placeholder-img"
                    />
                  </div>
                  <h2 className="project-name">{projects.find(p => p.id === selectedProjectDetail)?.name}</h2>
                  <p className="project-description">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.
                  </p>
                  <p className="project-wallet">
                    {projects.find(p => p.id === selectedProjectDetail)?.wallet.slice(0, 10)}...
                    {projects.find(p => p.id === selectedProjectDetail)?.wallet.slice(-8)}
                  </p>
                  <div className="social-links">
                    <a href="#" className="social-icon" title="Telegram">✈️</a>
                    <a href="#" className="social-icon" title="Instagram">📷</a>
                    <a href="#" className="social-icon" title="Website">🌐</a>
                  </div>
                </div>
              )}

              <div className="budget-section">
                <h4>Budget Status</h4>
                <div className="project-list">
                  {projects.map((project) => (
                    <div key={project.id} className="project-item">
                      <div className="project-item-header">
                        <span className="project-item-name">{project.name}</span>
                        <span className={`project-status ${project.isCompleted ? 'completed' : project.isOpen ? 'open' : 'closed'}`}>
                          {project.isCompleted ? '✓ Complete' : project.isOpen ? 'Active' : 'Closed'}
                        </span>
                      </div>
                      <div className="progress-bar">
                        <div 
                          className="progress-fill" 
                          style={{ width: `${Math.min(getProjectProgress(project), 100)}%` }}
                        ></div>
                      </div>
                      <div className="project-item-stats">
                        <span>{formatEther(project.currentAmount)} ETH</span>
                        <span>{getProjectProgress(project)}%</span>
                        <span>{formatEther(project.targetAmount)} ETH</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'lottery' && (
          <div className="lottery-section">
            <div className="section-card lottery-main">
              <h3>🎰 Lottery Pool</h3>
              <p className="countdown-big">{countdown}</p>
              <p className="pool-display">
                Total Pool: <span className="pool-amount">{lotteryPool.toFixed(4)} ETH</span>
              </p>
              <p className="lottery-users">
                {lotteryStatus ? `${Number(lotteryStatus[2])} participants this round` : 'Loading...'}
              </p>
              
              <div className="winners-section">
                <h4>🏆 Prize Distribution</h4>
                <table className="winners-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Prize %</th>
                      <th>Est. Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {WINNER_PERCENTAGES.map((pct, i) => (
                      <tr key={i}>
                        <td>
                          <span className={`rank-badge rank-${i + 1}`}>{i + 1}</span>
                        </td>
                        <td>{pct}%</td>
                        <td>~{(lotteryPool * pct / 100).toFixed(4)} ETH</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="lottery-info-box">
                <p>Winners are selected randomly based on tickets earned from donations. Each $1 donated = 1 lottery ticket.</p>
              </div>

              {!isConnected ? (
                <div className="connect-prompt">Connect wallet to check your winnings</div>
              ) : (
                <>
                  <div className="winnings-status">
                    <div className="winnings-label">Your Unclaimed Winnings</div>
                    <div className="winnings-value">
                      {pendingWinnings !== undefined ? (
                        pendingWinnings > 0n ? (
                          <span className="has-winnings">{formatEther(pendingWinnings)} ETH</span>
                        ) : (
                          <span className="no-winnings-text">0 ETH</span>
                        )
                      ) : (
                        <span>Loading...</span>
                      )}
                    </div>
                  </div>

                  {pendingWinnings !== undefined && pendingWinnings > 0n && (
                    <div className="winner-alert">
                      <p>🎉 Congratulations! You won!</p>
                      <p className="win-amount">{formatEther(pendingWinnings)} ETH</p>
                      <button 
                        className="claim-btn" 
                        onClick={handleClaim}
                        disabled={isPending || isConfirming}
                      >
                        {isPending || isConfirming ? 'Claiming...' : 'Claim Prize'}
                      </button>
                    </div>
                  )}

                  {pendingWinnings !== undefined && pendingWinnings === 0n && (
                    <p className="no-winnings">Keep donating to earn more tickets!</p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="history-section">
            <div className="section-card">
              <h3>📜 Transaction History</h3>
              {!isConnected ? (
                <p className="connect-prompt">Connect wallet to view your donation history</p>
              ) : isLoadingHistory ? (
                <div className="history-loading">
                  <p>Loading your donation history...</p>
                </div>
              ) : (
                <div className="history-list">
                  {history.length === 0 ? (
                    <p className="history-note">
                      No donations found in recent blocks. Make your first donation to see it here!
                    </p>
                  ) : (
                    <div className="history-items">
                      {history.map((event, index) => {
                        const isGame = event.sourceApp.toLowerCase().includes('runner') || 
                                       event.sourceApp.toLowerCase().includes('snake') || 
                                       event.sourceApp.toLowerCase().includes('tetris');
                        const icon = isGame ? '🎮' : '🎗️';
                        const projectName = projects.find(p => p.id === event.projectId)?.name || `Project ${event.projectId}`;
                        const title = event.sourceApp || projectName;
                        
                        return (
                          <div key={`${event.txHash}-${index}`} className="history-item">
                            <span className="history-icon">{icon}</span>
                            <div className="history-details">
                              <span className="history-title">{title}</span>
                              <span className="history-project">{projectName}</span>
                            </div>
                            <div className="history-amount">
                              <span className="history-eth">{parseFloat(formatEther(event.ethAmount)).toFixed(4)} ETH</span>
                              <span className="history-usd">${(event.usdCents / 100).toFixed(2)}</span>
                            </div>
                            <a 
                              href={`https://soneium-minato.blockscout.com/tx/${event.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="history-view-btn"
                            >
                              View
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {address && (
                    <a 
                      href={`https://soneium-minato.blockscout.com/address/${address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="explorer-link"
                    >
                      View all on Explorer ↗
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'leaderboard' && (
          <div className="leaderboard-section">
            <div className="section-card">
              <h3>🏆 Top Donors</h3>
              <div className="lb-tabs">
                <button 
                  className={`lb-tab ${leaderboardMode === 'global' ? 'active' : ''}`}
                  onClick={() => setLeaderboardMode('global')}
                >
                  🌍 All Time
                </button>
                <button 
                  className={`lb-tab ${leaderboardMode === 'round' ? 'active' : ''}`}
                  onClick={() => setLeaderboardMode('round')}
                >
                  🔥 This Month
                </button>
              </div>

              <div className="leaderboard-list">
                {formatRankings(leaderboardMode === 'global' ? globalRankings : roundRankings).length > 0 ? (
                  formatRankings(leaderboardMode === 'global' ? globalRankings : roundRankings).map((entry) => (
                    <div key={entry.rank} className="leaderboard-item">
                      <span className={`rank rank-${entry.rank}`}>{entry.rank}</span>
                      <span className="donor-address">
                        {entry.wallet.slice(0, 6)}...{entry.wallet.slice(-4)}
                      </span>
                      <span className="donor-amount">{parseFloat(entry.amount).toFixed(4)} ETH</span>
                    </div>
                  ))
                ) : (
                  <p className="no-data">No donors yet this period</p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <nav className="bottom-nav">
        <button 
          className={`nav-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <span className="nav-icon">🏠</span>
          <span className="nav-label">Home</span>
        </button>
        <button 
          className={`nav-btn ${activeTab === 'projects' ? 'active' : ''}`}
          onClick={() => setActiveTab('projects')}
        >
          <span className="nav-icon">📂</span>
          <span className="nav-label">Projects</span>
        </button>
        <button 
          className={`nav-btn ${activeTab === 'lottery' ? 'active' : ''}`}
          onClick={() => setActiveTab('lottery')}
        >
          <span className="nav-icon">🎰</span>
          <span className="nav-label">Lottery</span>
        </button>
        <button 
          className={`nav-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <span className="nav-icon">📜</span>
          <span className="nav-label">History</span>
        </button>
        <button 
          className={`nav-btn ${activeTab === 'leaderboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('leaderboard')}
        >
          <span className="nav-icon">🏆</span>
          <span className="nav-label">Leaders</span>
        </button>
      </nav>

      {showConfirmModal && (
        <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Confirm Donation</h2>
            <div className="modal-amount">
              <p className="modal-eth">{ethAmount} ETH</p>
              <p className="modal-usd">${usdValue.toFixed(2)}</p>
            </div>
            <div className="modal-breakdown">
              {charityOnly ? (
                <div className="breakdown-row">
                  <span>Charity (100%)</span>
                  <span>${usdValue.toFixed(2)}</span>
                </div>
              ) : (
                <>
                  <div className="breakdown-row">
                    <span>Charity (60%)</span>
                    <span>${(usdValue * 0.6).toFixed(2)}</span>
                  </div>
                  <div className="breakdown-row">
                    <span>Lottery Pool (30%)</span>
                    <span>${(usdValue * 0.3).toFixed(2)}</span>
                  </div>
                  <div className="breakdown-row">
                    <span>Treasury (10%)</span>
                    <span>${(usdValue * 0.1).toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>
            <p className="modal-warning">⚠️ This transaction is non-refundable</p>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setShowConfirmModal(false)}>Cancel</button>
              <button className="modal-confirm" onClick={handleDonate}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
