import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, encodeAbiParameters } from 'viem';
import { HOMA_CORE_ADDRESS, HOMA_CORE_ABI } from '../contracts/abi';

export interface Project {
  id: number;
  name: string;
  wallet: string;
  targetAmount: bigint;
  currentAmount: bigint;
  isCompleted: boolean;
  isOpen: boolean;
}

export interface LotteryStatus {
  pool: bigint;
  nextDraw: bigint;
  users: bigint;
}

export interface UserAccumulation {
  cents: bigint;
  tickets: bigint;
  total: bigint;
}

export function useHomaCore(address?: `0x${string}`) {
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const { data: lotteryStatus, refetch: refetchLottery } = useReadContract({
    address: HOMA_CORE_ADDRESS,
    abi: HOMA_CORE_ABI,
    functionName: 'getLotteryStatus',
  });

  const { data: projectCount, refetch: refetchProjectCount } = useReadContract({
    address: HOMA_CORE_ADDRESS,
    abi: HOMA_CORE_ABI,
    functionName: 'getProjectCount',
  });

  const { data: globalRankings, refetch: refetchGlobalRankings } = useReadContract({
    address: HOMA_CORE_ADDRESS,
    abi: HOMA_CORE_ABI,
    functionName: 'getGlobalRankings',
  });

  const { data: roundRankings, refetch: refetchRoundRankings } = useReadContract({
    address: HOMA_CORE_ADDRESS,
    abi: HOMA_CORE_ABI,
    functionName: 'getRoundRankings',
  });

  const { data: userAccumulation, refetch: refetchUserAccumulation } = useReadContract({
    address: HOMA_CORE_ADDRESS,
    abi: HOMA_CORE_ABI,
    functionName: 'getUserAccumulation',
    args: address ? [address] : undefined,
    query: { enabled: !!address }
  });

  const { data: pendingWinnings, refetch: refetchPendingWinnings } = useReadContract({
    address: HOMA_CORE_ADDRESS,
    abi: HOMA_CORE_ABI,
    functionName: 'checkWinnings',
    args: address ? [address] : undefined,
    query: { enabled: !!address }
  });

  const donate = async (
    projectId: number,
    ethAmount: string,
    participateInLottery: boolean,
    usdCents: number,
    gameAdapter?: string,
    gameData?: { level: number; score: number; gameId?: string }
  ) => {
    let encodedGameData: `0x${string}` = '0x';
    
    if (gameData && gameAdapter) {
      encodedGameData = encodeAbiParameters(
        [{ type: 'uint256' }, { type: 'uint256' }, { type: 'string' }],
        [BigInt(gameData.score), BigInt(gameData.level), gameData.gameId || 'unknown']
      );
    }

    writeContract({
      address: HOMA_CORE_ADDRESS,
      abi: HOMA_CORE_ABI,
      functionName: 'donate',
      args: [
        BigInt(projectId),
        participateInLottery,
        BigInt(usdCents),
        (gameAdapter || '0x0000000000000000000000000000000000000000') as `0x${string}`,
        encodedGameData
      ],
      value: parseEther(ethAmount)
    });
  };

  const claimWinnings = () => {
    writeContract({
      address: HOMA_CORE_ADDRESS,
      abi: HOMA_CORE_ABI,
      functionName: 'claimWinnings',
    });
  };

  const refetchAll = () => {
    refetchLottery();
    refetchProjectCount();
    refetchGlobalRankings();
    refetchRoundRankings();
    if (address) {
      refetchUserAccumulation();
      refetchPendingWinnings();
    }
  };

  return {
    lotteryStatus: lotteryStatus as [bigint, bigint, bigint] | undefined,
    projectCount: projectCount as bigint | undefined,
    globalRankings,
    roundRankings,
    userAccumulation: userAccumulation as [bigint, bigint, bigint] | undefined,
    pendingWinnings: pendingWinnings as bigint | undefined,
    donate,
    claimWinnings,
    isPending,
    isConfirming,
    isSuccess,
    error,
    txHash: hash,
    refetchAll,
    reset
  };
}

export function useProject(projectId: number) {
  const { data, refetch } = useReadContract({
    address: HOMA_CORE_ADDRESS,
    abi: HOMA_CORE_ABI,
    functionName: 'getProject',
    args: [BigInt(projectId)],
  });

  return {
    project: data as [string, string, bigint, bigint, boolean, boolean] | undefined,
    refetch
  };
}
