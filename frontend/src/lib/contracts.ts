export const CONTRACT_ADDRESSES = {
  SIGNAL_REGISTRY: (process.env.NEXT_PUBLIC_SIGNAL_REGISTRY_ADDRESS ?? "0x0") as `0x${string}`,
  SUBSCRIPTION_MANAGER: (process.env.NEXT_PUBLIC_SUBSCRIPTION_MANAGER_ADDRESS ?? "0x0") as `0x${string}`,
  MOCK_CONSUMER: (process.env.NEXT_PUBLIC_MOCK_CONSUMER_ADDRESS ?? "0x0") as `0x${string}`,
  USDG: "0x7E955252E15c84f5768B83c41a71F9eba181802F" as `0x${string}`,
} as const;

export const SIGNAL_REGISTRY_ABI = [
  {
    "type": "function", "name": "commitSignal", "stateMutability": "nonpayable",
    "inputs": [
      { "name": "ticker", "type": "string" },
      { "name": "price", "type": "uint256" },
      { "name": "timestamp", "type": "uint256" },
      { "name": "ipfsHash", "type": "bytes32" },
      { "name": "direction", "type": "uint8" },
      { "name": "sequenceNumber", "type": "uint256" },
      { "name": "keeperSignature", "type": "bytes" }
    ],
    "outputs": [{ "name": "", "type": "uint256" }]
  },
  {
    "type": "function", "name": "resolveSignal", "stateMutability": "nonpayable",
    "inputs": [
      { "name": "signalId", "type": "uint256" },
      { "name": "actualPrice", "type": "uint256" }
    ],
    "outputs": []
  },
  {
    "type": "function", "name": "getSignal", "stateMutability": "view",
    "inputs": [{ "name": "signalId", "type": "uint256" }],
    "outputs": [{
      "name": "", "type": "tuple",
      "components": [
        { "name": "id", "type": "uint256" },
        { "name": "ticker", "type": "string" },
        { "name": "price", "type": "uint256" },
        { "name": "timestamp", "type": "uint256" },
        { "name": "ipfsHash", "type": "bytes32" },
        { "name": "direction", "type": "uint8" },
        { "name": "sequenceNumber", "type": "uint256" },
        { "name": "keeperSignature", "type": "bytes" },
        { "name": "blockNumber", "type": "uint256" },
        { "name": "status", "type": "uint8" },
        { "name": "resolvedPrice", "type": "uint256" }
      ]
    }]
  },
  {
    "type": "function", "name": "signalCount", "stateMutability": "view",
    "inputs": [], "outputs": [{ "name": "", "type": "uint256" }]
  },
  {
    "type": "function", "name": "lastSequenceNumber", "stateMutability": "view",
    "inputs": [], "outputs": [{ "name": "", "type": "uint256" }]
  },
  {
    "type": "function", "name": "getAccuracyScore", "stateMutability": "view",
    "inputs": [],
    "outputs": [
      { "name": "correct", "type": "uint256" },
      { "name": "total", "type": "uint256" }
    ]
  },
  {
    "type": "event", "name": "SignalCommitted",
    "inputs": [
      { "name": "signalId", "type": "uint256", "indexed": true },
      { "name": "ticker", "type": "string", "indexed": false },
      { "name": "price", "type": "uint256", "indexed": false },
      { "name": "timestamp", "type": "uint256", "indexed": false },
      { "name": "ipfsHash", "type": "bytes32", "indexed": true },
      { "name": "direction", "type": "uint8", "indexed": false },
      { "name": "sequenceNumber", "type": "uint256", "indexed": false }
    ]
  },
  {
    "type": "event", "name": "SignalResolved",
    "inputs": [
      { "name": "signalId", "type": "uint256", "indexed": true },
      { "name": "correct", "type": "bool", "indexed": false },
      { "name": "actualPrice", "type": "uint256", "indexed": false }
    ]
  }
] as const;

export const SUBSCRIPTION_MANAGER_ABI = [
  {
    "type": "function", "name": "subscribe", "stateMutability": "nonpayable",
    "inputs": [], "outputs": []
  },
  {
    "type": "function", "name": "cancelSubscription", "stateMutability": "nonpayable",
    "inputs": [], "outputs": []
  },
  {
    "type": "function", "name": "isSubscriber", "stateMutability": "view",
    "inputs": [{ "name": "account", "type": "address" }],
    "outputs": [{ "name": "", "type": "bool" }]
  },
  {
    "type": "function", "name": "SUBSCRIPTION_FEE", "stateMutability": "view",
    "inputs": [], "outputs": [{ "name": "", "type": "uint256" }]
  },
  {
    "type": "event", "name": "Subscribed",
    "inputs": [
      { "name": "subscriber", "type": "address", "indexed": true },
      { "name": "fee", "type": "uint256", "indexed": false }
    ]
  },
  {
    "type": "event", "name": "SubscriptionCancelled",
    "inputs": [{ "name": "subscriber", "type": "address", "indexed": true }]
  }
] as const;

export const ERC20_ABI = [
  {
    "type": "function", "name": "approve", "stateMutability": "nonpayable",
    "inputs": [{ "name": "spender", "type": "address" }, { "name": "amount", "type": "uint256" }],
    "outputs": [{ "name": "", "type": "bool" }]
  },
  {
    "type": "function", "name": "allowance", "stateMutability": "view",
    "inputs": [{ "name": "owner", "type": "address" }, { "name": "spender", "type": "address" }],
    "outputs": [{ "name": "", "type": "uint256" }]
  },
  {
    "type": "function", "name": "balanceOf", "stateMutability": "view",
    "inputs": [{ "name": "account", "type": "address" }],
    "outputs": [{ "name": "", "type": "uint256" }]
  }
] as const;
