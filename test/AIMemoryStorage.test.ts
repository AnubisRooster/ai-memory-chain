import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('AIMemoryStorage', function () {
  async function deployFixture() {
    const [owner, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory('AIMemoryStorage');
    const contract = await Factory.deploy();
    await contract.waitForDeployment();
    return { contract, owner, other };
  }

  describe('Deployment', function () {
    it('should start with zero memories', async function () {
      const { contract } = await deployFixture();
      const count = await contract.getMemoryCount();
      expect(Number(count)).to.equal(0);
    });
  });

  describe('storeMemory', function () {
    it('should store a memory and increment count', async function () {
      const { contract } = await deployFixture();
      const hash = ethers.keccak256(ethers.toUtf8Bytes('test'));

      await contract.storeMemory('Test summary', 'QmTestCID', hash, [100, -200, 300]);

      const count = await contract.getMemoryCount();
      expect(Number(count)).to.equal(1);
    });

    it('should emit MemoryStored event with correct args', async function () {
      const { contract, owner } = await deployFixture();
      const hash = ethers.keccak256(ethers.toUtf8Bytes('event-test'));

      const tx = await contract.storeMemory('Event test', 'QmEventCID', hash, [1, -1]);
      const receipt = await tx.wait();

      const event = receipt!.logs
        .map((l: any) => {
          try { return contract.interface.parseLog({ topics: [...l.topics], data: l.data }); }
          catch { return null; }
        })
        .find((e: any) => e?.name === 'MemoryStored');

      expect(event).to.not.be.null;
      expect(Number(event!.args[0])).to.equal(0);
      expect(event!.args[1]).to.equal(owner.address);
      expect(event!.args[2]).to.equal('QmEventCID');
      expect(event!.args[3]).to.equal(hash);
      expect(Number(event!.args[4])).to.be.greaterThan(0);
    });

    it('should store multiple memories with sequential IDs', async function () {
      const { contract } = await deployFixture();
      const hash1 = ethers.keccak256(ethers.toUtf8Bytes('first'));
      const hash2 = ethers.keccak256(ethers.toUtf8Bytes('second'));

      const tx1 = await contract.storeMemory('First', 'QmFirst', hash1, [1]);
      const receipt1 = await tx1.wait();

      const tx2 = await contract.storeMemory('Second', 'QmSecond', hash2, [2]);
      const receipt2 = await tx2.wait();

      expect(Number(await contract.getMemoryCount())).to.equal(2);

      const parseEvent = (receipt: any) =>
        receipt!.logs
          .map((l: any) => {
            try { return contract.interface.parseLog({ topics: [...l.topics], data: l.data }); }
            catch { return null; }
          })
          .find((e: any) => e?.name === 'MemoryStored');

      expect(Number(parseEvent(receipt1)!.args[0])).to.equal(0);
      expect(Number(parseEvent(receipt2)!.args[0])).to.equal(1);
    });

    it('should record the correct author', async function () {
      const { contract, other } = await deployFixture();
      const hash = ethers.keccak256(ethers.toUtf8Bytes('author'));

      await contract.connect(other).storeMemory('Other author', 'QmOther', hash, []);

      const [, , , , , author] = await contract.getMemory(0);
      expect(author).to.equal(other.address);
    });

    it('should handle empty embedding', async function () {
      const { contract } = await deployFixture();
      const hash = ethers.keccak256(ethers.toUtf8Bytes('empty'));

      await contract.storeMemory('Empty embedding', 'QmEmpty', hash, []);

      const [, , , , embedding] = await contract.getMemory(0);
      expect(embedding).to.have.length(0);
    });

    it('should handle int16 boundary values', async function () {
      const { contract } = await deployFixture();
      const hash = ethers.keccak256(ethers.toUtf8Bytes('bounds'));

      await contract.storeMemory('Bounds test', 'QmBounds', hash, [32767, -32768, 0]);

      const [, , , , embedding] = await contract.getMemory(0);
      expect(Number(embedding[0])).to.equal(32767);
      expect(Number(embedding[1])).to.equal(-32768);
      expect(Number(embedding[2])).to.equal(0);
    });
  });

  describe('getMemory', function () {
    it('should return all stored fields', async function () {
      const { contract, owner } = await deployFixture();
      const hash = ethers.keccak256(ethers.toUtf8Bytes('fields'));

      await contract.storeMemory('All fields', 'QmAllFields', hash, [10, -20]);

      const [summary, timestamp, ipfsCID, sha256Hash, embedding, author] =
        await contract.getMemory(0);

      expect(summary).to.equal('All fields');
      expect(Number(timestamp)).to.be.greaterThan(0);
      expect(ipfsCID).to.equal('QmAllFields');
      expect(sha256Hash).to.equal(hash);
      expect(embedding.map(Number)).to.deep.equal([10, -20]);
      expect(author).to.equal(owner.address);
    });

    it('should revert for non-existent ID', async function () {
      const { contract } = await deployFixture();
      try {
        await contract.getMemory(999);
        expect.fail('Should have reverted');
      } catch (err: any) {
        expect(err.message).to.include('Memory does not exist');
      }
    });
  });

  describe('getMemorySummary', function () {
    it('should return summary and timestamp', async function () {
      const { contract } = await deployFixture();
      const hash = ethers.keccak256(ethers.toUtf8Bytes('summary'));

      await contract.storeMemory('Summary test', 'QmSum', hash, [1]);

      const [summary, timestamp] = await contract.getMemorySummary(0);
      expect(summary).to.equal('Summary test');
      expect(Number(timestamp)).to.be.greaterThan(0);
    });

    it('should revert for non-existent ID', async function () {
      const { contract } = await deployFixture();
      try {
        await contract.getMemorySummary(0);
        expect.fail('Should have reverted');
      } catch (err: any) {
        expect(err.message).to.include('Memory does not exist');
      }
    });
  });

  describe('getMemoryCount', function () {
    it('should track total count accurately', async function () {
      const { contract } = await deployFixture();
      expect(Number(await contract.getMemoryCount())).to.equal(0);

      const hash = ethers.keccak256(ethers.toUtf8Bytes('count'));
      await contract.storeMemory('A', 'QmA', hash, []);
      expect(Number(await contract.getMemoryCount())).to.equal(1);

      await contract.storeMemory('B', 'QmB', hash, []);
      expect(Number(await contract.getMemoryCount())).to.equal(2);

      await contract.storeMemory('C', 'QmC', hash, []);
      expect(Number(await contract.getMemoryCount())).to.equal(3);
    });
  });
});
