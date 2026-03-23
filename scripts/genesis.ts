import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.resolve(__dirname, '..', 'data', 'polygon-edge');
const NODE_DIR = path.join(DATA_DIR, 'node1');
const GENESIS_PATH = path.join(DATA_DIR, 'genesis.json');

function run(cmd: string): string {
  console.log(`> ${cmd}`);
  return execSync(cmd, { encoding: 'utf-8' }).trim();
}

async function main() {
  if (fs.existsSync(GENESIS_PATH)) {
    console.log('Genesis file already exists at', GENESIS_PATH);
    console.log('Delete it to regenerate.');
    return;
  }

  fs.mkdirSync(NODE_DIR, { recursive: true });

  console.log('--- Generating node secrets ---');
  run(`polygon-edge secrets init --data-dir ${NODE_DIR}`);

  const secretsOutput = run(`polygon-edge secrets output --data-dir ${NODE_DIR} --json`);
  const secrets = JSON.parse(secretsOutput);
  const validatorAddress = secrets.address;
  const nodeId = secrets.node_id;

  console.log('Validator:', validatorAddress);
  console.log('Node ID:', nodeId);

  console.log('--- Generating genesis ---');
  run(
    [
      'polygon-edge genesis',
      '--consensus ibft',
      `--ibft-validators-prefix-path ${NODE_DIR}/consensus`,
      `--bootnode /ip4/127.0.0.1/tcp/10001/p2p/${nodeId}`,
      `--premine ${validatorAddress}:1000000000000000000000`,
      '--block-gas-limit 10000000',
      '--chain-id 100',
      `--dir ${GENESIS_PATH}`,
    ].join(' '),
  );

  console.log('Genesis file created at', GENESIS_PATH);
}

main().catch((err) => {
  console.error('Genesis generation failed:', err);
  process.exit(1);
});
