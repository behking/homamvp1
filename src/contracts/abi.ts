export const HOMA_CORE_ADDRESS = "0xfB31727f1AAeE47262A9F837438e2c26D0AB9EE6";
export const RUNNER_ADAPTER_ADDRESS = "0xD30ce72062dB14603729992629384435b069c44f";
export const GAME_ADAPTER_ADDRESS = "0x0555cB543B4C711685605e6bc77326e9210a53a8";
export const HOMA_IDENTITY_ADDRESS = "0x0000000000000000000000000000000000000000";

export const HOMA_CORE_ABI = [
  {
    type: "function",
    name: "donate",
    inputs: [
      { name: "_projectId", type: "uint256" },
      { name: "_participateInLottery", type: "bool" },
      { name: "_usdCents", type: "uint256" },
      { name: "_gameAdapter", type: "address" },
      { name: "_gameData", type: "bytes" }
    ],
    outputs: [],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "getLotteryStatus",
    inputs: [],
    outputs: [
      { name: "pool", type: "uint256" },
      { name: "nextDraw", type: "uint256" },
      { name: "users", type: "uint256" }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getProjectCount",
    inputs: [],
    outputs: [{ type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getProject",
    inputs: [{ name: "_id", type: "uint256" }],
    outputs: [
      { name: "name", type: "string" },
      { name: "wallet", type: "address" },
      { name: "targetAmount", type: "uint256" },
      { name: "currentAmount", type: "uint256" },
      { name: "isCompleted", type: "bool" },
      { name: "isOpen", type: "bool" }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getGlobalRankings",
    inputs: [],
    outputs: [
      {
        type: "tuple[10]",
        components: [
          { name: "wallet", type: "address" },
          { name: "totalAmount", type: "uint256" }
        ]
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getRoundRankings",
    inputs: [],
    outputs: [
      {
        type: "tuple[10]",
        components: [
          { name: "wallet", type: "address" },
          { name: "totalAmount", type: "uint256" }
        ]
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "checkWinnings",
    inputs: [{ name: "_user", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "claimWinnings",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "winnerPercentages",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getUserAccumulation",
    inputs: [{ name: "_user", type: "address" }],
    outputs: [
      { name: "cents", type: "uint256" },
      { name: "tickets", type: "uint256" },
      { name: "total", type: "uint256" }
    ],
    stateMutability: "view"
  },
  {
    type: "event",
    name: "DonationReceived",
    inputs: [
      { name: "donor", type: "address", indexed: true },
      { name: "projectId", type: "uint256", indexed: false },
      { name: "ethAmount", type: "uint256", indexed: false },
      { name: "usdCents", type: "uint256", indexed: false },
      { name: "sourceApp", type: "string", indexed: false }
    ]
  },
  {
    type: "event",
    name: "LotteryWinner",
    inputs: [
      { name: "winner", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "rank", type: "uint256", indexed: false }
    ]
  }
] as const;

export const RUNNER_ADAPTER_ABI = [
  {
    type: "function",
    name: "getPlayerStats",
    inputs: [{ name: "player", type: "address" }],
    outputs: [
      { name: "level", type: "uint256" },
      { name: "score", type: "uint256" }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getLeaderboard",
    inputs: [],
    outputs: [
      {
        type: "tuple[10]",
        components: [
          { name: "player", type: "address" },
          { name: "score", type: "uint256" },
          { name: "level", type: "uint256" }
        ]
      }
    ],
    stateMutability: "view"
  }
] as const;
