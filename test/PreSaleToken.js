/* global artifacts:false, contract:false, describe: false, it:false */

const assert = require('assert')

const PreSaleToken = artifacts.require('./PreSaleToken.sol')

contract('PreSaleToken', accounts => {
  describe('ownership', () => {
    it(`should not be transferrable by non-owner`, async () => {
      const [owner, nonOwner] = accounts
      const token = await PreSaleToken.new(owner)
      try {
        await token.transferOwnership(nonOwner, { from: nonOwner })
        assert.fail(`Non-owner managed to transfer ownership`)
      } catch (err) {
        // Great!
      }
    })

    it(`should be transferrable by owner`, async () => {
      const [owner, nonOwner] = accounts
      const token = await PreSaleToken.new(owner)
      await token.transferOwnership(nonOwner, { from: owner })
      const newOwner = await token.owner.call()
      assert.strictEqual(newOwner, nonOwner)
    })
  })

  describe('minting', () => {
    it(`should not be allowed by non-owner`, async () => {
      const [owner, nonOwner] = accounts
      const token = await PreSaleToken.new(owner)
      try {
        await token.mint(nonOwner, 10000, { from: nonOwner })
        assert.fail(`Non-owner managed to mint tokens`)
      } catch (err) {
        // Expected
      }
    })

    it(`should be allowed by owner`, async () => {
      const [owner, recipient] = accounts
      const token = await PreSaleToken.new(owner)
      const totalSupplyBefore = await token.totalSupply.call()
      assert.strictEqual(totalSupplyBefore.toNumber(), 0)
      const balanceBefore = await token.balanceOf.call(recipient)
      assert.strictEqual(balanceBefore.toNumber(), 0)
      await token.mint(recipient, 42, { from: owner })
      const balanceAfter = await token.balanceOf.call(recipient)
      assert.strictEqual(balanceAfter.toNumber(), 42)
      const totalSupplyAfter = await token.totalSupply.call()
      assert.strictEqual(totalSupplyAfter.toNumber(), 42)
    })

    it(`should not allow 0 tokens to be minted`, async () => {
      const [owner] = accounts
      const token = await PreSaleToken.new(owner)
      try {
        await token.mint(owner, 0, { from: owner })
        assert.fail(`Managed to mint 0 tokens`)
      } catch (err) {
        // Great!
      }
    })

    it(`should increase total supply`, async () => {
      const [owner, recipient] = accounts
      const token = await PreSaleToken.new(owner)
      const totalSupplyBefore = await token.totalSupply.call()
      assert.strictEqual(totalSupplyBefore.toNumber(), 0)
      await token.mint(recipient, 10, { from: owner })
      const totalSupplyAfter1 = await token.totalSupply.call()
      assert.strictEqual(totalSupplyAfter1.toNumber(), 10)
      await token.mint(recipient, 5, { from: owner })
      const totalSupplyAfter2 = await token.totalSupply.call()
      assert.strictEqual(totalSupplyAfter2.toNumber(), 15)
    })

    it(`should not be allowed after minting finishes`, async () => {
      const [owner] = accounts
      const token = await PreSaleToken.new(owner)
      await token.finishMinting({ from: owner })
      try {
        await token.mint(owner, 10000, { from: owner })
        assert.fail(`Managed to mint tokens after minting finished`)
      } catch (err) {
        // Great!
      }
    })
  })

  describe('burning', () => {
    it(`should not be allowed by non-owner`, async () => {
      const [owner, nonOwner] = accounts
      const token = await PreSaleToken.new(owner)
      try {
        await token.mint(nonOwner, 100, { from: owner })
        await token.burn(nonOwner, 50, { from: nonOwner })
        assert.fail(`Non-owner managed to burn tokens`)
      } catch (err) {
        // Expected
      }
    })

    it(`should be allowed by owner`, async () => {
      const [owner] = accounts
      const token = await PreSaleToken.new(owner)
      await token.mint(owner, 100, { from: owner })
      await token.burn(owner, 50, { from: owner })
    })

    it(`should be limited by account balance`, async () => {
      const [owner, nonOwner] = accounts
      const token = await PreSaleToken.new(owner)
      try {
        await token.mint(nonOwner, 100, { from: owner })
        await token.burn(nonOwner, 50, { from: owner })
        await token.burn(nonOwner, 51, { from: owner })
        assert.fail(`Managed to burn more more tokens than available`)
      } catch (err) {
        // Expected
      }
    })

    it(`should not allow 0 tokens to be burned`, async () => {
      const [owner] = accounts
      const token = await PreSaleToken.new(owner)
      await token.mint(owner, 10, { from: owner })
      try {
        await token.burn(owner, 0, { from: owner })
        assert.fail(`Managed to burn 0 tokens`)
      } catch (err) {
        // Great!
      }
    })

    it(`should decrease total supply`, async () => {
      const [owner, recipient] = accounts
      const token = await PreSaleToken.new(owner)
      await token.mint(recipient, 20, { from: owner })
      const totalSupplyBefore = await token.totalSupply.call()
      assert.strictEqual(totalSupplyBefore.toNumber(), 20)
      await token.burn(recipient, 10, { from: owner })
      const totalSupplyAfter1 = await token.totalSupply.call()
      assert.strictEqual(totalSupplyAfter1.toNumber(), 10)
      await token.burn(recipient, 3, { from: owner })
      const totalSupplyAfter2 = await token.totalSupply.call()
      assert.strictEqual(totalSupplyAfter2.toNumber(), 7)
    })

    it(`should decrease balance`, async () => {
      const [owner, recipient] = accounts
      const token = await PreSaleToken.new(owner)
      await token.mint(recipient, 20, { from: owner })
      const balanceBefore = await token.balanceOf.call(recipient)
      assert.strictEqual(balanceBefore.toNumber(), 20)
      await token.burn(recipient, 10, { from: owner })
      const balanceAfter1 = await token.balanceOf.call(recipient)
      assert.strictEqual(balanceAfter1.toNumber(), 10)
      await token.burn(recipient, 3, { from: owner })
      const balanceAfter2 = await token.balanceOf.call(recipient)
      assert.strictEqual(balanceAfter2.toNumber(), 7)
    })

    it(`should not be allowed after minting finishes`, async () => {
      const [owner] = accounts
      const token = await PreSaleToken.new(owner)
      await token.mint(owner, 10000, { from: owner })
      await token.finishMinting({ from: owner })
      try {
        await token.burn(owner, 10000, { from: owner })
        assert.fail(`Managed to burn tokens after minting finished`)
      } catch (err) {
        // Great!
      }
    })
  })
})
