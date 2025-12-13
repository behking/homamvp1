import { useState, useEffect } from 'react';

export function useEthPrice() {
  const [ethPrice, setEthPrice] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
        );
        const data = await response.json();
        setEthPrice(data.ethereum.usd);
        setError(null);
      } catch (err) {
        setError('Failed to fetch ETH price');
        console.error('Error fetching ETH price:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  const ethToUsd = (ethAmount: number): number => {
    return ethAmount * ethPrice;
  };

  const usdToEth = (usdAmount: number): number => {
    if (ethPrice === 0) return 0;
    return usdAmount / ethPrice;
  };

  return { ethPrice, loading, error, ethToUsd, usdToEth };
}
