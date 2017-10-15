/* global artifacts:false, contract:false, describe: false, it:false */

const evm = require('./helpers/evm')
const {expect} = require('./helpers/chai')

const PreSaleToken = artifacts.require('./PreSaleToken.sol')

contract('PreSaleToken', accounts => {
  describe('ownership', () => {
    it(`should not be transferrable by non-owner`, async () => {
      const [owner, nonOwner] = accounts
      const token = await PreSaleToken.new({from: owner})
      await expect(token.transferOwnership(nonOwner, { from: nonOwner })).to.be.rejectedWith(evm.Throw)
    })

    it(`should be transferrable by owner`, async () => {
      const [owner, nonOwner] = accounts
      const token = await PreSaleToken.new({from: owner})
      await token.transferOwnership(nonOwner, {from: owner})
      await expect(token.owner.call()).to.eventually.equal(nonOwner)
    })

    it(`should not allow 0x0 as owner`, async () => {
      const [owner] = accounts
      const token = await PreSaleToken.new({from: owner})
      await expect(token.transferOwnership('0x0000000000000000000000000000000000000000', {from: owner})).to.be.rejectedWith(evm.Throw)
    })
  })

  describe('minting', () => {
    it(`should not be allowed by non-owner`, async () => {
      const [owner, nonOwner] = accounts
      const token = await PreSaleToken.new({from: owner})
      await expect(token.mint(nonOwner, 10000, { from: nonOwner })).to.be.rejectedWith(evm.Throw)
    })

    it(`should be allowed by owner`, async () => {
      const [owner, recipient] = accounts
      const token = await PreSaleToken.new({from: owner})
      await expect(token.totalSupply.call()).to.eventually.bignumber.equal(0)
      await expect(token.balanceOf.call(recipient)).to.eventually.bignumber.equal(0)
      await token.mint(recipient, 42, {from: owner})
      await expect(token.balanceOf.call(recipient)).to.eventually.bignumber.equal(42)
      await expect(token.totalSupply.call()).to.eventually.bignumber.equal(42)
    })

    it(`should not allow 0 tokens to be minted`, async () => {
      const [owner] = accounts
      const token = await PreSaleToken.new({from: owner})
      await expect(token.mint(owner, 0, {from: owner})).to.be.rejectedWith(evm.Throw)
    })

    it(`should increase total supply`, async () => {
      const [owner, recipient] = accounts
      const token = await PreSaleToken.new({from: owner})
      await expect(token.totalSupply.call()).to.eventually.bignumber.equal(0)
      await token.mint(recipient, 10, {from: owner})
      await expect(token.totalSupply.call()).to.eventually.bignumber.equal(10)
      await token.mint(recipient, 5, {from: owner})
      await expect(token.totalSupply.call()).to.eventually.bignumber.equal(15)
    })

    it(`should not be allowed after minting finishes`, async () => {
      const [owner] = accounts
      const token = await PreSaleToken.new({from: owner})
      await token.finishMinting({from: owner})
      await expect(token.mint(owner, 10000, {from: owner})).to.be.rejectedWith(evm.Throw)
    })
  })

  describe('burning', () => {
    it(`should not be allowed by non-owner`, async () => {
      const [owner, nonOwner] = accounts
      const token = await PreSaleToken.new({from: owner})
      await token.mint(nonOwner, 100, {from: owner})
      await expect(token.burn(nonOwner, 50, { from: nonOwner })).to.be.rejectedWith(evm.Throw)
    })

    it(`should be allowed by owner`, async () => {
      const [owner] = accounts
      const token = await PreSaleToken.new({from: owner})
      await token.mint(owner, 100, {from: owner})
      await token.burn(owner, 50, {from: owner})
    })

    it(`should be limited by account balance`, async () => {
      const [owner, nonOwner] = accounts
      const token = await PreSaleToken.new({from: owner})
      await token.mint(nonOwner, 100, {from: owner})
      await expect(token.burn(nonOwner, 50, {from: owner})).to.be.fulfilled
      await expect(token.burn(nonOwner, 51, {from: owner})).to.be.rejectedWith(evm.Throw)
    })

    it(`should not allow 0 tokens to be burned`, async () => {
      const [owner] = accounts
      const token = await PreSaleToken.new({from: owner})
      await token.mint(owner, 10, {from: owner})
      await expect(token.burn(owner, 0, {from: owner})).to.be.rejectedWith(evm.Throw)
    })

    it(`should decrease total supply`, async () => {
      const [owner, recipient] = accounts
      const token = await PreSaleToken.new({from: owner})
      await token.mint(recipient, 20, {from: owner})
      await expect(token.totalSupply.call()).to.eventually.bignumber.equal(20)
      await token.burn(recipient, 10, {from: owner})
      await expect(token.totalSupply.call()).to.eventually.bignumber.equal(10)
      await token.burn(recipient, 3, {from: owner})
      await expect(token.totalSupply.call()).to.eventually.bignumber.equal(7)
    })

    it(`should decrease balance`, async () => {
      const [owner, recipient] = accounts
      const token = await PreSaleToken.new({from: owner})
      await token.mint(recipient, 20, {from: owner})
      await expect(token.balanceOf.call(recipient)).to.bignumber.eventually.equal(20)
      await token.burn(recipient, 10, {from: owner})
      await expect(token.balanceOf.call(recipient)).to.bignumber.eventually.equal(10)
      await token.burn(recipient, 3, {from: owner})
      await expect(token.balanceOf.call(recipient)).to.bignumber.eventually.equal(7)
    })

    it(`should not be allowed after minting finishes`, async () => {
      const [owner] = accounts
      const token = await PreSaleToken.new({from: owner})
      await token.mint(owner, 10000, {from: owner})
      await token.finishMinting({from: owner})
      await expect(token.burn(owner, 10000, {from: owner})).to.be.rejectedWith(evm.Throw)
    })
  })
})
