import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@typechain/hardhat';

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY || '0x' + 'ac'.repeat(32);

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    localhost: {
      url: 'http://127.0.0.1:8545',
      accounts: [DEPLOYER_KEY],
    },
    polygonEdge: {
      url: 'http://127.0.0.1:8545',
      accounts: [DEPLOYER_KEY],
      chainId: 100,
      gasPrice: 0,
    },
  },
  typechain: {
    outDir: 'typechain-types',
    target: 'ethers-v6',
  },
};

export default config;
