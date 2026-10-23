require("@nomicfoundation/hardhat-toolbox");

/**
 * Atlas Flux — Layer 4 (Blockchain Audit Ledger)
 * Hardhat config. Defaults to the built-in in-memory network for the
 * hackathon demo; a `feederTestnet` entry is stubbed for whichever
 * public/permissioned testnet the team ends up deploying to.
 */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      // Default local network used for tests + the pipeline demo.
    },
    // feederTestnet: {
    //   url: process.env.RPC_URL || "",
    //   accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    // },
  },
};
