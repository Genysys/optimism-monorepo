import '../../setup'

/* External Imports */
import {
  BigNumber,
  HashFunction,
  keccak256,
  ZERO,
  ONE,
  TWO,
  THREE,
  TestUtils,
  getLogger,
} from '@eth-optimism/core-utils'
import * as assert from 'assert'

/* Internal Imports */
import {
  SparseMerkleTreeImpl,
  MerkleTree,
  MerkleTreeInclusionProof,
  MerkleUpdate,
  SparseMerkleTree,
  DB,
  newInMemoryDB,
} from '../../../src'

const log = getLogger('merkle-tree', true)

const hashBuffer: Buffer = Buffer.alloc(64)
const hashFunction: HashFunction = keccak256
const bufferHashFunction: (buffer: Buffer) => Buffer = (buff: Buffer) =>
  Buffer.from(hashFunction(buff.toString('hex')), 'hex')
const zeroHash: Buffer = bufferHashFunction(SparseMerkleTreeImpl.emptyBuffer)

const verifyEmptyTreeWithDepth = async (
  tree: SparseMerkleTree,
  key: BigNumber,
  depth: number
): Promise<void> => {
  let zeroHashParent: Buffer = zeroHash
  const siblings: Buffer[] = []
  for (let i = depth - 2; i >= 0; i--) {
    siblings.push(zeroHashParent)
    zeroHashParent = bufferHashFunction(
      hashBuffer.fill(zeroHashParent, 0, 32).fill(zeroHashParent, 32)
    )
  }

  const inclusionProof: MerkleTreeInclusionProof = {
    rootHash: await tree.getRootHash(),
    key,
    value: SparseMerkleTreeImpl.emptyBuffer,
    siblings,
  }

  assert(
    await tree.verifyAndStore(inclusionProof),
    'Unable to verify inclusion proof on empty tree when it should be valid.'
  )
}

const createAndVerifyEmptyTreeDepthWithDepth = async (
  db: DB,
  key: BigNumber,
  depth: number
): Promise<SparseMerkleTreeImpl> => {
  const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
    db,
    undefined,
    depth,
    hashFunction
  )

  await verifyEmptyTreeWithDepth(tree, key, depth)
  return tree
}

const getRootHashOnlyHashingWithEmptySiblings = (
  leafValue: Buffer,
  key: BigNumber,
  treeHeight: number
): Buffer => {
  let zeroHashParent: Buffer = zeroHash
  let hash: Buffer = bufferHashFunction(leafValue)

  for (let depth = treeHeight - 2; depth >= 0; depth--) {
    const left: boolean = key
      .shiftLeft(depth)
      .shiftRight(treeHeight - 2)
      .mod(TWO)
      .equals(ZERO)
    hash = left
      ? bufferHashFunction(
          hashBuffer.fill(hash, 0, 32).fill(zeroHashParent, 32)
        )
      : bufferHashFunction(
          hashBuffer.fill(zeroHashParent, 0, 32).fill(hash, 32)
        )

    zeroHashParent = bufferHashFunction(
      hashBuffer.fill(zeroHashParent, 0, 32).fill(zeroHashParent, 32)
    )
  }

  return hash
}

describe('SparseMerkleTreeImpl', () => {
  let db: DB
  beforeEach(() => {
    db = newInMemoryDB()
  })

  describe('Constructor', () => {
    it('should construct without error', async () => {
      await SparseMerkleTreeImpl.create(db)
    })

    it('accepts a non-empty root hash', async () => {
      await SparseMerkleTreeImpl.create(db, Buffer.alloc(32).fill('root', 0))
    })

    it('throws if root is not 32 bytes', async () => {
      await TestUtils.assertThrowsAsync(async () => {
        await SparseMerkleTreeImpl.create(db, Buffer.alloc(31).fill('root', 0))
      }, assert.AssertionError)
    })

    it('throws if height is < 0', async () => {
      await TestUtils.assertThrowsAsync(async () => {
        await SparseMerkleTreeImpl.create(db, undefined, -1)
      }, assert.AssertionError)
    })
  })

  describe('verifyAndStore', () => {
    it('verifies empty root', async () => {
      await createAndVerifyEmptyTreeDepthWithDepth(db, ZERO, 2)
    })

    it('verifies 3-level empty root', async () => {
      await createAndVerifyEmptyTreeDepthWithDepth(db, ZERO, 3)
    })
    it('verifies 4-level empty root', async () => {
      await createAndVerifyEmptyTreeDepthWithDepth(db, ZERO, 4)
    })

    it('verifies empty root with key of 1', async () => {
      await createAndVerifyEmptyTreeDepthWithDepth(db, ONE, 2)
    })

    it('verifies 3-level empty root with key of 1', async () => {
      await createAndVerifyEmptyTreeDepthWithDepth(db, ONE, 3)
    })
    it('verifies 4-level empty root with key of 1', async () => {
      await createAndVerifyEmptyTreeDepthWithDepth(db, ONE, 4)
    })

    it('fails on invalid proof for empty root', async () => {
      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        undefined,
        2,
        hashFunction
      )

      const inclusionProof: MerkleTreeInclusionProof = {
        rootHash: await tree.getRootHash(),
        key: ZERO,
        value: Buffer.from('this will fail.'),
        siblings: [bufferHashFunction(SparseMerkleTreeImpl.emptyBuffer)],
      }

      assert(
        !(await tree.verifyAndStore(inclusionProof)),
        'Should have failed on invalid proof for empty root but did not'
      )
    })

    it('verifies non-empty root', async () => {
      const value: Buffer = Buffer.from('non-empty')
      const root: Buffer = bufferHashFunction(
        hashBuffer
          .fill(bufferHashFunction(value), 0, 32)
          .fill(bufferHashFunction(SparseMerkleTreeImpl.emptyBuffer), 32)
      )

      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        root,
        2,
        hashFunction
      )

      const inclusionProof: MerkleTreeInclusionProof = {
        rootHash: await tree.getRootHash(),
        key: ZERO,
        value,
        siblings: [bufferHashFunction(SparseMerkleTreeImpl.emptyBuffer)],
      }

      assert(
        await tree.verifyAndStore(inclusionProof),
        'Should have verified non-empty root but did not.'
      )
    })

    it('verifies non-empty root with key of 1', async () => {
      const value: Buffer = Buffer.from('non-empty')
      const root: Buffer = bufferHashFunction(
        hashBuffer
          .fill(bufferHashFunction(SparseMerkleTreeImpl.emptyBuffer), 0, 32)
          .fill(bufferHashFunction(value), 32)
      )

      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        root,
        2,
        hashFunction
      )

      const inclusionProof: MerkleTreeInclusionProof = {
        rootHash: await tree.getRootHash(),
        key: ONE,
        value,
        siblings: [bufferHashFunction(SparseMerkleTreeImpl.emptyBuffer)],
      }

      assert(
        await tree.verifyAndStore(inclusionProof),
        'Should have verified non-empty root but did not.'
      )
    })

    it('fails verifying invalid non-empty root', async () => {
      const value: Buffer = Buffer.from('non-empty')
      const root: Buffer = bufferHashFunction(
        hashBuffer
          .fill(bufferHashFunction(value), 0, 32)
          .fill(bufferHashFunction(SparseMerkleTreeImpl.emptyBuffer), 32)
      )

      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        root,
        2,
        hashFunction
      )

      const inclusionProof: MerkleTreeInclusionProof = {
        rootHash: await tree.getRootHash(),
        key: ZERO,
        value: Buffer.from('not the right value'),
        siblings: [bufferHashFunction(SparseMerkleTreeImpl.emptyBuffer)],
      }

      assert(
        !(await tree.verifyAndStore(inclusionProof)),
        'Did not fail when verifying an invalid non-zero root.'
      )
    })
  })

  describe('verifyAndStorePartiallyEmptyPath', () => {
    it('verifies and stores partially empty path sharing 0 populated ancestor other than root', async () => {
      const tree: SparseMerkleTreeImpl = await createAndVerifyEmptyTreeDepthWithDepth(
        db,
        ZERO,
        3
      )

      const value: Buffer = Buffer.from('zero leaf value')
      assert(await tree.update(ZERO, value), 'update should have succeeded!')

      assert(
        await tree.verifyAndStorePartiallyEmptyPath(TWO),
        'Verify and store should have worked for partially empty path 2'
      )
    })

    it('verifies and stores partially empty path sharing 1 populated ancestor other than root', async () => {
      const tree: SparseMerkleTreeImpl = await createAndVerifyEmptyTreeDepthWithDepth(
        db,
        ZERO,
        4
      )

      const value: Buffer = Buffer.from('zero leaf value')
      assert(await tree.update(ZERO, value), 'update should have succeeded!')

      assert(
        await tree.verifyAndStorePartiallyEmptyPath(TWO),
        'Verify and store should have worked for partially empty path 2'
      )
    })
  })

  describe('update', () => {
    it('updates empty tree', async () => {
      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        undefined,
        3,
        hashFunction
      )
      const value: Buffer = Buffer.from('much better value')
      assert(await tree.update(ZERO, value))

      const root: Buffer = getRootHashOnlyHashingWithEmptySiblings(
        value,
        ZERO,
        3
      )
      assert(
        root.equals(await tree.getRootHash()),
        'Root hashes do not match after update'
      )
    })

    it('updates empty tree at key 1', async () => {
      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        undefined,
        3,
        hashFunction
      )

      const value: Buffer = Buffer.from('much better value')
      assert(await tree.update(ONE, value))

      const root: Buffer = getRootHashOnlyHashingWithEmptySiblings(
        value,
        ONE,
        3
      )
      assert(
        root.equals(await tree.getRootHash()),
        'Root hashes do not match after update'
      )
    })

    it('updates empty tree at key 2', async () => {
      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        undefined,
        3,
        hashFunction
      )

      const value: Buffer = Buffer.from('much better value')
      assert(await tree.update(TWO, value))

      const root: Buffer = getRootHashOnlyHashingWithEmptySiblings(
        value,
        TWO,
        3
      )
      assert(
        root.equals(await tree.getRootHash()),
        'Root hashes do not match after update'
      )
    })

    it('updates empty tree at key 3', async () => {
      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        undefined,
        3,
        hashFunction
      )

      const value: Buffer = Buffer.from('much better value')
      assert(await tree.update(THREE, value))

      const root: Buffer = getRootHashOnlyHashingWithEmptySiblings(
        value,
        THREE,
        3
      )
      assert(
        root.equals(await tree.getRootHash()),
        'Root hashes do not match after update'
      )
    })

    it('updates empty tree at key 0 and 1 without verifying first', async () => {
      /*
              zh                    C                  F
             /  \                 /  \              /    \
           zh    zh     ->      B    zh     ->     E      zh
          /  \  /  \           /  \  /  \        /  \    /  \
        zh  zh  zh  zh        A  zh  zh  zh     A    D  zh  zh
      */

      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        undefined,
        3,
        hashFunction
      )
      const value: Buffer = Buffer.from('much better value')
      const valueHash: Buffer = bufferHashFunction(value)
      assert(await tree.update(ZERO, value))

      const root: Buffer = getRootHashOnlyHashingWithEmptySiblings(
        value,
        ZERO,
        3
      )
      assert(
        root.equals(await tree.getRootHash()),
        'Root hashes do not match after update'
      )

      // UPDATE ONE
      const secondValue: Buffer = Buffer.from('much better value 2')
      const secondValueHash: Buffer = bufferHashFunction(secondValue)

      assert(await tree.update(ONE, secondValue))

      let parentHash: Buffer = bufferHashFunction(
        hashBuffer.fill(valueHash, 0, 32).fill(secondValueHash, 32)
      )
      const zeroHashParent: Buffer = bufferHashFunction(
        hashBuffer.fill(zeroHash, 0, 32).fill(zeroHash, 32)
      )
      parentHash = bufferHashFunction(
        hashBuffer.fill(parentHash, 0, 32).fill(zeroHashParent, 32)
      )

      assert(
        parentHash.equals(await tree.getRootHash()),
        'Root hashes do not match after update 2'
      )
    })

    it('updates empty tree at key 0 and 2', async () => {
      /*
              zh                    C                  F
             /  \                 /  \              /    \
           zh    zh     ->      B    zh     ->     B      E
          /  \  /  \           /  \  /  \        /  \    /  \
        zh  zh  zh  zh        A  zh  zh  zh     A    zh  D  zh
      */

      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        undefined,
        3,
        hashFunction
      )

      const value: Buffer = Buffer.from('much better value')
      const valueHash: Buffer = bufferHashFunction(value)
      assert(await tree.update(ZERO, value))

      const root: Buffer = getRootHashOnlyHashingWithEmptySiblings(
        value,
        ZERO,
        3
      )
      assert(
        root.equals(await tree.getRootHash()),
        'Root hashes do not match after update'
      )

      // UPDATE TWO
      const secondValue: Buffer = Buffer.from('much better value 2')
      const secondValueHash: Buffer = bufferHashFunction(secondValue)

      assert(await tree.update(TWO, secondValue))

      let parentHash: Buffer = bufferHashFunction(
        hashBuffer.fill(secondValueHash, 0, 32).fill(zeroHash, 32)
      )
      const leftSubtreeSibling: Buffer = bufferHashFunction(
        hashBuffer.fill(valueHash, 0, 32).fill(zeroHash, 32)
      )
      parentHash = bufferHashFunction(
        hashBuffer.fill(leftSubtreeSibling, 0, 32).fill(parentHash, 32)
      )

      assert(
        parentHash.equals(await tree.getRootHash()),
        'Root hashes do not match after update'
      )
    })
  })

  describe('purgeOldNodes', () => {
    it('should recover previous state before purge', async () => {
      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        undefined,
        3,
        hashFunction
      )
      const originalValue: Buffer = Buffer.from('value')
      assert(await tree.update(ZERO, originalValue, false))

      const recoverableRoot: Buffer = await tree.getRootHash()
      log.info(`Recoverable root: ${recoverableRoot.toString('hex')}`)

      const newValue: Buffer = Buffer.from('much better value')
      assert(await tree.update(ZERO, newValue, false))

      const newRoot: Buffer = await tree.getRootHash()
      log.info(`New root: ${newRoot.toString('hex')}`)

      const newTree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        recoverableRoot,
        3,
        hashFunction
      )

      const recoveredValue: Buffer = await newTree.getLeaf(ZERO)
      assert(
        recoveredValue.equals(originalValue),
        `Value [${originalValue.toString()}] should have been recoverable but received: [${recoveredValue.toString()}]!`
      )
    })

    it('should not recover previous state after purge', async () => {
      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        undefined,
        3,
        hashFunction
      )
      const originalValue: Buffer = Buffer.from('value')
      assert(await tree.update(ZERO, originalValue, false))

      const recoverableRoot: Buffer = await tree.getRootHash()

      const newValue: Buffer = Buffer.from('much better value')
      assert(await tree.update(ZERO, newValue, false))

      await tree.purgeOldNodes()

      const newTree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        recoverableRoot,
        3,
        hashFunction
      )

      const recoveredValue: Buffer = await newTree.getLeaf(ZERO)
      assert(!recoveredValue, 'Value should not have been recoverable but was!')
    })

    it('should still have access to leaf after purge - 0', async () => {
      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        undefined,
        3,
        hashFunction
      )
      const value: Buffer = Buffer.from('value')
      assert(await tree.update(ZERO, value, false))

      await tree.purgeOldNodes()

      let leaf: Buffer
      try {
        leaf = await tree.getLeaf(ZERO)
      } catch (e) {
        assert.fail()
      }
      value.should.eql(leaf, 'Leaf not the expected value')
    })

    it('should still have access to leaf after purge - 0, 1, 2', async () => {
      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        undefined,
        3,
        hashFunction
      )
      const value: Buffer = Buffer.from('value')
      assert(await tree.update(ZERO, value, false))
      assert(await tree.update(ONE, value, false))
      assert(await tree.update(TWO, value, false))

      await tree.purgeOldNodes()

      let leaf0: Buffer
      let leaf1: Buffer
      let leaf2: Buffer
      try {
        leaf0 = await tree.getLeaf(ZERO)
        leaf1 = await tree.getLeaf(ONE)
        leaf2 = await tree.getLeaf(TWO)
      } catch (e) {
        assert.fail()
      }
      value.should.eql(leaf0, 'Leaf not the expected value')
      value.should.eql(leaf1, 'Leaf not the expected value')
      value.should.eql(leaf2, 'Leaf not the expected value')
    })

    it('should still have access to leaf after purge - 0 set with same value', async () => {
      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        undefined,
        3,
        hashFunction
      )
      const value: Buffer = Buffer.from('value')
      assert(await tree.update(ZERO, value, false))
      assert(await tree.update(ZERO, value, false))

      await tree.purgeOldNodes()

      let leaf: Buffer = Buffer.from('')
      try {
        leaf = await tree.getLeaf(ZERO)
      } catch (e) {
        assert.fail()
      }
      value.should.eql(leaf, 'Leaf not the expected value')
    })

    it('should still have access to leaf after purge - 0, 1, 2 set with same value', async () => {
      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        undefined,
        3,
        hashFunction
      )
      const value: Buffer = Buffer.from('value')
      assert(await tree.update(ZERO, value, false))
      assert(await tree.update(ONE, value, false))
      assert(await tree.update(TWO, value, false))

      assert(await tree.update(ZERO, value, false))
      assert(await tree.update(ONE, value, false))
      assert(await tree.update(TWO, value, false))

      await tree.purgeOldNodes()

      let leaf0: Buffer
      let leaf1: Buffer
      let leaf2: Buffer
      try {
        leaf0 = await tree.getLeaf(ZERO)
        leaf1 = await tree.getLeaf(ONE)
        leaf2 = await tree.getLeaf(TWO)
      } catch (e) {
        assert.fail()
      }
      value.should.eql(leaf0, 'Leaf not the expected value')
      value.should.eql(leaf1, 'Leaf not the expected value')
      value.should.eql(leaf2, 'Leaf not the expected value')
    })
  })

  describe('batchUpdate', () => {
    it('updates 2 values', async () => {
      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        undefined,
        3,
        hashFunction
      )

      const valueZero = Buffer.from('Zero')
      const valueOne = Buffer.from('One')

      assert(await tree.update(ZERO, valueZero), 'Initial update 0 failed')
      assert(await tree.update(ONE, valueOne), 'Initial update 1 failed')

      const proofZero: MerkleTreeInclusionProof = await tree.getMerkleProof(
        ZERO,
        valueZero
      )
      const proofOne: MerkleTreeInclusionProof = await tree.getMerkleProof(
        ONE,
        valueOne
      )

      const newValueZero: Buffer = Buffer.from('ZERO 0')
      const newValueOne: Buffer = Buffer.from('ONE 1')

      const updates: MerkleUpdate[] = []
      updates.push({
        key: proofZero.key,
        oldValue: proofZero.value,
        oldValueProofSiblings: proofZero.siblings,
        newValue: newValueZero,
      })

      updates.push({
        key: proofOne.key,
        oldValue: proofOne.value,
        oldValueProofSiblings: proofOne.siblings,
        newValue: newValueOne,
      })

      assert(await tree.batchUpdate(updates), 'Batch update failed')

      const newLeafZero: Buffer = await tree.getLeaf(
        ZERO,
        await tree.getRootHash()
      )
      const newLeafOne: Buffer = await tree.getLeaf(
        ONE,
        await tree.getRootHash()
      )

      assert(newLeafZero.equals(newValueZero), 'Updated leaf 0 does not match.')
      assert(newLeafOne.equals(newValueOne), 'Updated leaf 1 does not match.')
    })

    it('updates 3 values', async () => {
      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        undefined,
        3,
        hashFunction
      )

      const valueZero = Buffer.from('Zero')
      const valueOne = Buffer.from('One')
      const valueTwo = Buffer.from('Two')

      assert(await tree.update(ZERO, valueZero), 'Initial update 0 failed')
      assert(await tree.update(ONE, valueOne), 'Initial update 1 failed')
      assert(await tree.update(TWO, valueTwo), 'Initial update 2 failed')

      const proofZero: MerkleTreeInclusionProof = await tree.getMerkleProof(
        ZERO,
        valueZero
      )
      const proofOne: MerkleTreeInclusionProof = await tree.getMerkleProof(
        ONE,
        valueOne
      )
      const proofTwo: MerkleTreeInclusionProof = await tree.getMerkleProof(
        TWO,
        valueTwo
      )

      const newValueZero: Buffer = Buffer.from('ZERO 0')
      const newValueOne: Buffer = Buffer.from('ONE 1')
      const newValueTwo: Buffer = Buffer.from('TWO 2')

      const updates: MerkleUpdate[] = []
      updates.push({
        key: proofZero.key,
        oldValue: proofZero.value,
        oldValueProofSiblings: proofZero.siblings,
        newValue: newValueZero,
      })

      updates.push({
        key: proofOne.key,
        oldValue: proofOne.value,
        oldValueProofSiblings: proofOne.siblings,
        newValue: newValueOne,
      })

      updates.push({
        key: proofTwo.key,
        oldValue: proofTwo.value,
        oldValueProofSiblings: proofTwo.siblings,
        newValue: newValueTwo,
      })

      assert(await tree.batchUpdate(updates), 'Batch update failed')

      const newLeafZero: Buffer = await tree.getLeaf(
        ZERO,
        await tree.getRootHash()
      )
      const newLeafOne: Buffer = await tree.getLeaf(
        ONE,
        await tree.getRootHash()
      )
      const newLeafTwo: Buffer = await tree.getLeaf(
        TWO,
        await tree.getRootHash()
      )

      assert(newLeafZero.equals(newValueZero), 'Updated leaf 0 does not match.')
      assert(newLeafOne.equals(newValueOne), 'Updated leaf 1 does not match.')
      assert(newLeafTwo.equals(newValueTwo), 'Updated leaf 2 does not match.')
    })

    it('updates 4 values', async () => {
      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        undefined,
        3,
        hashFunction
      )

      const valueZero = Buffer.from('Zero')
      const valueOne = Buffer.from('One')
      const valueTwo = Buffer.from('Two')
      const valueThree = Buffer.from('Three')

      assert(await tree.update(ZERO, valueZero), 'Initial update 0 failed')
      assert(await tree.update(ONE, valueOne), 'Initial update 1 failed')
      assert(await tree.update(TWO, valueTwo), 'Initial update 2 failed')
      assert(await tree.update(THREE, valueThree), 'Initial update 3 failed')

      const proofZero: MerkleTreeInclusionProof = await tree.getMerkleProof(
        ZERO,
        valueZero
      )
      const proofOne: MerkleTreeInclusionProof = await tree.getMerkleProof(
        ONE,
        valueOne
      )
      const proofTwo: MerkleTreeInclusionProof = await tree.getMerkleProof(
        TWO,
        valueTwo
      )
      const proofThree: MerkleTreeInclusionProof = await tree.getMerkleProof(
        THREE,
        valueThree
      )

      const newValueZero: Buffer = Buffer.from('ZERO 0')
      const newValueOne: Buffer = Buffer.from('ONE 1')
      const newValueTwo: Buffer = Buffer.from('TWO 2')
      const newValueThree: Buffer = Buffer.from('Three 3')

      const updates: MerkleUpdate[] = []
      updates.push({
        key: proofZero.key,
        oldValue: proofZero.value,
        oldValueProofSiblings: proofZero.siblings,
        newValue: newValueZero,
      })

      updates.push({
        key: proofOne.key,
        oldValue: proofOne.value,
        oldValueProofSiblings: proofOne.siblings,
        newValue: newValueOne,
      })

      updates.push({
        key: proofTwo.key,
        oldValue: proofTwo.value,
        oldValueProofSiblings: proofTwo.siblings,
        newValue: newValueTwo,
      })
      updates.push({
        key: proofThree.key,
        oldValue: proofThree.value,
        oldValueProofSiblings: proofThree.siblings,
        newValue: newValueThree,
      })

      assert(await tree.batchUpdate(updates), 'Batch update failed')

      const newLeafZero: Buffer = await tree.getLeaf(
        ZERO,
        await tree.getRootHash()
      )
      const newLeafOne: Buffer = await tree.getLeaf(
        ONE,
        await tree.getRootHash()
      )
      const newLeafTwo: Buffer = await tree.getLeaf(
        TWO,
        await tree.getRootHash()
      )
      const newLeafThree: Buffer = await tree.getLeaf(
        THREE,
        await tree.getRootHash()
      )

      assert(newLeafZero.equals(newValueZero), 'Updated leaf 0 does not match.')
      assert(newLeafOne.equals(newValueOne), 'Updated leaf 1 does not match.')
      assert(newLeafTwo.equals(newValueTwo), 'Updated leaf 2 does not match.')
      assert(
        newLeafThree.equals(newValueThree),
        'Updated leaf 3 does not match.'
      )
    })

    it('fails if one proof fails', async () => {
      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        undefined,
        3,
        hashFunction
      )

      const valueZero = Buffer.from('Zero')
      const valueOne = Buffer.from('One')
      const valueTwo = Buffer.from('Two')

      assert(await tree.update(ZERO, valueZero), 'Initial update 0 failed')
      assert(await tree.update(ONE, valueOne), 'Initial update 1 failed')
      assert(await tree.update(TWO, valueTwo), 'Initial update 2 failed')

      const proofZero: MerkleTreeInclusionProof = await tree.getMerkleProof(
        ZERO,
        valueZero
      )
      const proofOne: MerkleTreeInclusionProof = await tree.getMerkleProof(
        ONE,
        valueOne
      )
      const proofTwo: MerkleTreeInclusionProof = await tree.getMerkleProof(
        TWO,
        valueTwo
      )

      // will not match
      proofOne.value = bufferHashFunction(Buffer.from('zzzz'))

      const newValueZero: Buffer = Buffer.from('ZERO 0')
      const newValueOne: Buffer = Buffer.from('ONE 1')
      const newValueTwo: Buffer = Buffer.from('TWO 2')

      const updates: MerkleUpdate[] = []
      updates.push({
        key: proofZero.key,
        oldValue: proofZero.value,
        oldValueProofSiblings: proofZero.siblings,
        newValue: newValueZero,
      })

      updates.push({
        key: proofOne.key,
        oldValue: proofOne.value,
        oldValueProofSiblings: proofOne.siblings,
        newValue: newValueOne,
      })

      updates.push({
        key: proofTwo.key,
        oldValue: proofTwo.value,
        oldValueProofSiblings: proofTwo.siblings,
        newValue: newValueTwo,
      })

      assert(
        !(await tree.batchUpdate(updates)),
        'Batch update succeeded when it should have failed'
      )

      const newLeafZero: Buffer = await tree.getLeaf(
        ZERO,
        await tree.getRootHash()
      )
      const newLeafOne: Buffer = await tree.getLeaf(
        ONE,
        await tree.getRootHash()
      )
      const newLeafTwo: Buffer = await tree.getLeaf(
        TWO,
        await tree.getRootHash()
      )

      assert(
        newLeafZero.equals(valueZero),
        'Leaf 0 should not have been updated.'
      )
      assert(
        newLeafOne.equals(valueOne),
        'Leaf 1 should not have been updated.'
      )
      assert(
        newLeafTwo.equals(valueTwo),
        'Leaf 2 should not have been updated.'
      )
    })
  })

  describe('getMerkleProof', () => {
    it('gets empty merkle proof for existing empty leaf', async () => {
      const tree: MerkleTree = await createAndVerifyEmptyTreeDepthWithDepth(
        db,
        ZERO,
        3
      )
      const proof: MerkleTreeInclusionProof = await tree.getMerkleProof(
        ZERO,
        SparseMerkleTreeImpl.emptyBuffer
      )

      assert(proof.value.equals(SparseMerkleTreeImpl.emptyBuffer))
      assert(proof.key.equals(ZERO))
      assert(proof.siblings.length === 2)

      let hash: Buffer = zeroHash
      assert(proof.siblings[0].equals(hash))
      hash = bufferHashFunction(hashBuffer.fill(hash, 0, 32).fill(hash, 32))
      assert(proof.siblings[1].equals(hash))

      assert(proof.rootHash.equals(await tree.getRootHash()))
    })

    it('gets empty merkle proof for disconnected empty leaf', async () => {
      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        undefined,
        3,
        hashFunction
      )

      const proof: MerkleTreeInclusionProof = await tree.getMerkleProof(
        ZERO,
        SparseMerkleTreeImpl.emptyBuffer
      )

      assert(!!proof, 'Proof should not be undefined!')
      assert(proof.value.equals(SparseMerkleTreeImpl.emptyBuffer))
      assert(proof.key.equals(ZERO))
      assert(proof.siblings.length === 2)

      let hash: Buffer = zeroHash
      assert(proof.siblings[0].equals(hash))
      hash = bufferHashFunction(hashBuffer.fill(hash, 0, 32).fill(hash, 32))
      assert(proof.siblings[1].equals(hash))

      assert(proof.rootHash.equals(await tree.getRootHash()))
    })

    it('gets merkle proof for non-empty tree', async () => {
      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        undefined,
        3,
        hashFunction
      )
      const data: Buffer = Buffer.from('really great leaf data')
      await tree.update(ZERO, data)

      const proof: MerkleTreeInclusionProof = await tree.getMerkleProof(
        ZERO,
        data
      )

      assert(proof.value.equals(data))
      assert(proof.key.equals(ZERO))
      assert(proof.siblings.length === 2)

      let hash: Buffer = zeroHash
      assert(proof.siblings[0].equals(hash))
      hash = bufferHashFunction(hashBuffer.fill(hash, 0, 32).fill(hash, 32))
      assert(proof.siblings[1].equals(hash))

      assert(proof.rootHash.equals(await tree.getRootHash()))
    })

    it('gets merkle proof for disconnected empty leaf in non-empty tree', async () => {
      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        undefined,
        3,
        hashFunction
      )
      const zeroKeyData: Buffer = Buffer.from('really great leaf data')
      await tree.update(ZERO, zeroKeyData)

      const proof: MerkleTreeInclusionProof = await tree.getMerkleProof(
        TWO,
        SparseMerkleTreeImpl.emptyBuffer
      )

      assert(!!proof, 'Proof should not be undefined!')
      assert(proof.value.equals(SparseMerkleTreeImpl.emptyBuffer))
      assert(proof.key.equals(TWO))
      assert(proof.siblings.length === 2)

      assert(proof.siblings[0].equals(zeroHash))

      const hashData: Buffer = bufferHashFunction(zeroKeyData)
      const zeroAndOneParent = bufferHashFunction(
        hashBuffer.fill(hashData, 0, 32).fill(zeroHash, 32)
      )
      assert(proof.siblings[1].equals(zeroAndOneParent))

      assert(proof.rootHash.equals(await tree.getRootHash()))
    })

    it('gets merkle proof for non-empty siblings 0 & 1', async () => {
      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        undefined,
        3,
        hashFunction
      )

      const zeroData: Buffer = Buffer.from('ZERO 0')
      await tree.update(ZERO, zeroData)

      const sibs: Buffer[] = [bufferHashFunction(zeroData)]
      sibs.push(
        bufferHashFunction(hashBuffer.fill(zeroHash, 0, 32).fill(zeroHash, 32))
      )

      const oneData: Buffer = Buffer.from('ONE 1')
      assert(await tree.update(ONE, oneData), 'Updating data at ONE failed')

      // Check Proof for ZERO
      let proof: MerkleTreeInclusionProof = await tree.getMerkleProof(
        ZERO,
        zeroData
      )

      assert(proof.value.equals(zeroData))
      assert(proof.key.equals(ZERO))

      assert(proof.siblings.length === 2)
      let hash: Buffer = bufferHashFunction(oneData)
      assert(proof.siblings[0].equals(hash))
      hash = bufferHashFunction(
        hashBuffer.fill(zeroHash, 0, 32).fill(zeroHash, 32)
      )
      assert(proof.siblings[1].equals(hash))

      assert(proof.rootHash.equals(await tree.getRootHash()))

      // Check Proof for ONE
      proof = await tree.getMerkleProof(ONE, oneData)

      assert(proof.value.equals(oneData))
      assert(proof.key.equals(ONE))

      assert(proof.siblings.length === 2)
      hash = bufferHashFunction(zeroData)
      assert(proof.siblings[0].equals(hash))
      hash = bufferHashFunction(
        hashBuffer.fill(zeroHash, 0, 32).fill(zeroHash, 32)
      )
      assert(proof.siblings[1].equals(hash))
      assert(proof.rootHash.equals(await tree.getRootHash()))
    })

    it('gets merkle proof for non-empty siblings 0 & 2', async () => {
      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        undefined,
        3,
        hashFunction
      )

      const zeroData: Buffer = Buffer.from('ZERO 0')
      await tree.update(ZERO, zeroData)

      const sibs: Buffer[] = [zeroHash]
      sibs.push(
        bufferHashFunction(
          hashBuffer
            .fill(bufferHashFunction(zeroData), 0, 32)
            .fill(zeroHash, 32)
        )
      )

      const twoData: Buffer = Buffer.from('TWO 2')
      assert(await tree.update(TWO, twoData), 'Updating data at TWO failed')

      // Check Proof for ZERO
      let proof: MerkleTreeInclusionProof = await tree.getMerkleProof(
        ZERO,
        zeroData
      )

      assert(proof.value.equals(zeroData))
      assert(proof.key.equals(ZERO))

      assert(proof.siblings.length === 2)

      let hash: Buffer = zeroHash
      assert(proof.siblings[0].equals(hash))
      hash = bufferHashFunction(
        hashBuffer.fill(bufferHashFunction(twoData), 0, 32).fill(zeroHash, 32)
      )
      assert(proof.siblings[1].equals(hash))
      assert(proof.rootHash.equals(await tree.getRootHash()))

      // Check Proof for TWO
      proof = await tree.getMerkleProof(TWO, twoData)

      assert(proof.value.equals(twoData))
      assert(proof.key.equals(TWO))

      assert(proof.siblings.length === 2)

      hash = zeroHash
      assert(proof.siblings[0].equals(hash))
      hash = bufferHashFunction(
        hashBuffer.fill(bufferHashFunction(zeroData), 0, 32).fill(zeroHash, 32)
      )
      assert(proof.siblings[1].equals(hash))

      assert(proof.rootHash.equals(await tree.getRootHash()))
    })
  })

  describe('benchmarks', () => {
    const runUpdateTest = async (
      treeHeight: number,
      numUpdates: number,
      keyRange: number
    ): Promise<void> => {
      const tree: SparseMerkleTreeImpl = await SparseMerkleTreeImpl.create(
        db,
        undefined,
        treeHeight,
        hashFunction
      )

      const keyMap: Map<string, BigNumber> = new Map<string, BigNumber>()
      for (let i = 0; i < numUpdates; i++) {
        const key = new BigNumber(Math.floor(Math.random() * keyRange))

        if (keyMap.has(key.toString())) {
          i--
          continue
        }
        keyMap.set(key.toString(), key)
      }

      const keys = Array.from(keyMap.values())
      const startTime = +new Date()

      const dataToStore: Buffer = Buffer.from('yo what is gucci')
      const promises: Array<Promise<boolean>> = []
      for (let i = 0; i < numUpdates; i++) {
        promises.push(tree.update(keys[i], dataToStore))
      }

      await Promise.all(promises)

      const finishTime = +new Date()
      const durationInMiliseconds = finishTime - startTime
      // tslint:disable-next-line:no-console
      console.log(
        'Duration:',
        durationInMiliseconds,
        ', TPS: ',
        numUpdates / (durationInMiliseconds / 1_000.0)
      )
    }

    // it('updates: 100, treeHeight: 24, keyRange: 50,000', async () => {
    //   await runUpdateTest(24, 100, 50_000)
    // }).timeout(9000)
    //
    // it('updates: 100, treeHeight: 160, keyRange: 50,000', async () => {
    //   await runUpdateTest(160, 100, 50_000)
    // }).timeout(9000)
  })
})
