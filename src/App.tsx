import { useEffect, useState } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { Menu } from './components/Menu';
import { CharityPanel } from './components/CharityPanel';
import { HomaRunner } from './components/games/HomaRunner';
import { HomaSnake } from './components/games/HomaSnake';
import { NeonTetris } from './components/games/NeonTetris';

type Page = 'menu' | 'charity' | 'runner' | 'snake' | 'tetris';

function App() {
  const [isReady, setIsReady] = useState(false);
  const [currentPage, setCurrentPage] = useState<Page>('menu');

  useEffect(() => {
    async function initApp() {
      try {
        await sdk.actions.ready();
      } catch (error) {
        console.log('Running in development mode (not in Farcaster Frame)');
      }
      setIsReady(true);
    }

    initApp();
  }, []);

  if (!isReady) {
    return (
      <div className="loading-container">
        <div className="loader"></div>
        <p>Loading Homa...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      {currentPage === 'menu' && (
        <Menu onNavigate={setCurrentPage} />
      )}
      {currentPage === 'charity' && (
        <CharityPanel onBack={() => setCurrentPage('menu')} />
      )}
      {currentPage === 'runner' && (
        <HomaRunner onBack={() => setCurrentPage('menu')} />
      )}
      {currentPage === 'snake' && (
        <HomaSnake onBack={() => setCurrentPage('menu')} />
      )}
      {currentPage === 'tetris' && (
        <NeonTetris onBack={() => setCurrentPage('menu')} />
      )}
    </div>
  );
}

export default App;
