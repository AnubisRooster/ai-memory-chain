import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const rpcUrl = 'http://127.0.0.1:8545';
  const privKey = '0x' + fs.readFileSync(
    path.resolve(__dirname, '..', 'data', 'polygon-edge', 'node1', 'consensus', 'validator.key'),
    'utf-8',
  ).trim();

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  console.log('Connected to chain:', network.chainId.toString());

  const wallet = new ethers.Wallet(privKey, provider);
  console.log('Deployer:', wallet.address);
  console.log('Balance:', ethers.formatEther(await provider.getBalance(wallet.address)), 'ETH');

  const artifactPath = path.resolve(__dirname, '..', 'artifacts', 'contracts', 'AIMemoryStorage.sol', 'AIMemoryStorage.json');
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

  console.log('Deploying (legacy tx)...');
  const contract = await factory.deploy({ gasLimit: 5_000_000, gasPrice: 1_000_000_000, type: 0 });
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log('AIMemoryStorage deployed to:', address);

  const deploymentInfo = {
    address,
    deployer: wallet.address,
    network: network.name,
    chainId: Number(network.chainId),
    timestamp: new Date().toISOString(),
  };

  const outPath = path.resolve(__dirname, '..', 'deployment.json');
  fs.writeFileSync(outPath, JSON.stringify(deploymentInfo, null, 2));
  console.log('Deployment info written to', outPath);
}

main().catch((err) => {
  console.error('Deploy failed:', err.message || err);
  process.exit(1);
});
