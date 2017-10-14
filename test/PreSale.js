/* global artifacts:false, contract:false, before: false, describe: false, it:false */

const assert = require('assert')

const assertJump = require('./helpers/assertJump')
const duration = require('./helpers/duration')
const evm = require('./helpers/evm')

const PreSale = artifacts.require('./PreSale.sol')
const PreSaleToken = artifacts.require('./PreSaleToken.sol')

contract('PreSale', accounts => {
  const createPreSale = async (options = {}) => {
    const [owner, wallet] = accounts

    const now = await evm.latestTime()

    const defaults = {
      owner,
      wallet,
      goal: evm.wei(1000, 'ether'),
      rate: 1,
      // Note that startTime needs to definitely be after `now`. By the time
      // we create the contract, a require that checks `now` may already have
      // advanced to a higher value, which leads to intermittent failures.
      startTime: now + duration.weeks(1),
      endTime: now + duration.weeks(2)
    }

    const args = Object.assign({}, defaults, options)

    return await PreSale.new(
      args.goal,
      args.startTime,
      args.endTime,
      args.rate,
      args.wallet,
      {from: args.owner}
    )
  }

  before(async () => {
    return await evm.advanceBlock()
  })

  describe('ownership', () => {
    it(`should not be transferrable by non-owner`, async () => {
      const [owner, nonOwner, wallet] = accounts
      const sale = await createPreSale({owner, wallet})
      try {
        await sale.transferOwnership(nonOwner, {from: nonOwner})
        assert.fail(`Non-owner managed to transfer ownership`)
      } catch (err) {
        assertJump(err)
      }
    })

    it(`should be transferrable by owner`, async () => {
      const [owner, nonOwner, wallet] = accounts
      const sale = await createPreSale({owner, wallet})
      await sale.transferOwnership(nonOwner, {from: owner})
      const newOwner = await sale.owner.call()
      assert.strictEqual(newOwner, nonOwner)
    })
  })

  describe('token', () => {
    it(`should be owned by the sale contract`, async () => {
      const [owner, wallet] = accounts
      const sale = await createPreSale({owner, wallet})
      const startTime = await sale.startTime.call()
      await evm.increaseTimeTo(startTime.toNumber())
      const token = PreSaleToken.at(await sale.token.call())
      const tokenOwner = await token.owner.call()
      assert.strictEqual(tokenOwner, sale.address)
    })
  })

  describe('pausing', () => {
    it(`should not be paused by default`, async () => {
      const [owner, wallet] = accounts
      const sale = await createPreSale({owner, wallet})

      const paused = await sale.paused.call()
      assert.strictEqual(paused, false)
    })

    it(`should set paused flag`, async () => {
      const [owner, wallet] = accounts
      const sale = await createPreSale({owner, wallet})

      await sale.pause()

      const paused = await sale.paused.call()
      assert.strictEqual(paused, true)
    })

    it(`should not be possible if already paused`, async () => {
      const [owner, wallet] = accounts
      const sale = await createPreSale({owner, wallet})

      await sale.pause()

      try {
        await sale.pause()
        assert.fail(`Managed to pause an already paused sale`)
      } catch (err) {
        assertJump(err)
      }
    })

    it(`should be unpausable`, async () => {
      const [owner, wallet] = accounts
      const sale = await createPreSale({owner, wallet})

      await sale.pause()
      await sale.unpause()

      const paused = await sale.paused.call()
      assert.strictEqual(paused, false)
    })
  })

  describe('buying tokens', () => {
    it(`should not be possible until sale starts`, async () => {
      const [owner, wallet, investor] = accounts
      const sale = await createPreSale({owner, wallet})

      try {
        await sale.send(evm.wei(1, 'ether'), {from: investor})
        assert.fail(`Managed to buy tokens before sale started`)
      } catch (err) {
        assertJump(err)
      }

      const startTime = await sale.startTime.call()
      await evm.increaseTimeTo(startTime.toNumber())

      await sale.send(evm.wei(1, 'ether'), {from: investor})
    })

    it(`should not be possible after sale ends`, async () => {
      const [owner, wallet, investor] = accounts
      const sale = await createPreSale({owner, wallet})

      const endTime = await sale.endTime.call()
      await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))

      try {
        await sale.send(evm.wei(1, 'ether'), {from: investor})
        assert.fail(`Managed to buy tokens after sale ended`)
      } catch (err) {
        assertJump(err)
      }
    })

    it(`should not be possible when sale is paused`, async () => {
      const [owner, wallet, investor] = accounts
      const sale = await createPreSale({owner, wallet})

      const startTime = await sale.startTime.call()
      await evm.increaseTimeTo(startTime.toNumber())

      await sale.pause()

      try {
        await sale.send(evm.wei(1, 'ether'), {from: investor})
        assert.fail(`Managed to buy tokens when sale was paused`)
      } catch (err) {
        assertJump(err)
      }

      await sale.unpause()

      await sale.send(evm.wei(1, 'ether'), {from: investor})
    })

    it(`should increase total token supply`, async () => {
      const [owner, wallet, investor] = accounts
      const sale = await createPreSale({owner, wallet, rate: 1})
      const startTime = await sale.startTime.call()
      await evm.increaseTimeTo(startTime.toNumber())
      const token = PreSaleToken.at(await sale.token.call())
      const totalBefore = await token.totalSupply.call()
      const value = evm.wei(1, 'ether')
      await sale.send(value, {from: investor})
      const totalAfter = await token.totalSupply.call()
      assert.ok(totalBefore.equals(0))
      assert.ok(totalAfter.equals(value))
    })

    it(`should increase weiRaised`, async () => {
      const [owner, wallet, investor] = accounts
      const sale = await createPreSale({owner, wallet})
      const startTime = await sale.startTime.call()
      await evm.increaseTimeTo(startTime.toNumber())
      const before = await sale.weiRaised.call()
      await sale.send(evm.wei(1, 'ether'), {from: investor})
      await sale.send(evm.wei(3, 'ether'), {from: investor})
      const after = await sale.weiRaised.call()
      assert.ok(before.equals(0))
      assert.ok(after.equals(evm.wei(4, 'ether')))
    })
  })
})
