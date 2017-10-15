/* global artifacts:false, contract:false, before: false, describe: false, it:false */

const duration = require('./helpers/duration')
const evm = require('./helpers/evm')
const {expect} = require('./helpers/chai')

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
      await expect(sale.transferOwnership(nonOwner, {from: nonOwner})).to.be.rejectedWith(evm.Throw)
    })

    it(`should be transferrable by owner`, async () => {
      const [owner, nonOwner, wallet] = accounts
      const sale = await createPreSale({owner, wallet})
      await sale.transferOwnership(nonOwner, {from: owner})
      await expect(sale.owner.call()).to.eventually.equal(nonOwner)
    })

    it(`should not allow 0x0 as owner`, async () => {
      const [owner, wallet] = accounts
      const sale = await createPreSale({owner, wallet})
      await expect(sale.transferOwnership('0x0000000000000000000000000000000000000000', {from: owner})).to.be.rejectedWith(evm.Throw)
    })
  })

  describe('token', () => {
    it(`should be owned by the sale contract`, async () => {
      const [owner, wallet] = accounts
      const sale = await createPreSale({owner, wallet})
      const startTime = await sale.startTime.call()
      await evm.increaseTimeTo(startTime.toNumber())
      const token = PreSaleToken.at(await sale.token.call())
      await expect(token.owner.call()).to.eventually.equal(sale.address)
    })
  })

  describe('pausing', () => {
    it(`should not be paused by default`, async () => {
      const [owner, wallet] = accounts
      const sale = await createPreSale({owner, wallet})
      await expect(sale.paused.call()).to.eventually.equal(false)
    })

    it(`should set paused flag`, async () => {
      const [owner, wallet] = accounts
      const sale = await createPreSale({owner, wallet})
      await sale.pause()
      await expect(sale.paused.call()).to.eventually.equal(true)
    })

    it(`should not be possible if already paused`, async () => {
      const [owner, wallet] = accounts
      const sale = await createPreSale({owner, wallet})
      await sale.pause()
      await expect(sale.pause()).to.be.rejectedWith(evm.Throw)
    })

    it(`should be unpausable`, async () => {
      const [owner, wallet] = accounts
      const sale = await createPreSale({owner, wallet})
      await sale.pause()
      await sale.unpause()
      await expect(sale.paused.call()).to.eventually.equal(false)
    })
  })

  describe('whitelisting', () => {
    describe(`by non-owner`, () => {
      it(`should not be possible`, async () => {
        const [owner, wallet, nonOwner, investor] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.whitelist(investor, true, {from: nonOwner})).to.be.rejectedWith(evm.Throw)
        await expect(sale.whitelist(investor, false, {from: nonOwner})).to.be.rejectedWith(evm.Throw)
      })
    })

    describe(`by owner`, () => {
      it(`should default to unwhitelisted`, async () => {
        const [owner, wallet, investor] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.whitelisted.call(investor)).to.eventually.equal(false)
      })

      it(`should allow whitelisting`, async () => {
        const [owner, wallet, investor] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.whitelist(investor, true, {from: owner})).to.be.fulfilled
        await expect(sale.whitelisted.call(investor)).to.eventually.equal(true)
      })

      it(`should allow unwhitelisting`, async () => {
        const [owner, wallet, investor] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.whitelist(investor, true, {from: owner})).to.be.fulfilled
        await expect(sale.whitelist(investor, false, {from: owner})).to.be.fulfilled
        await expect(sale.whitelisted.call(investor)).to.eventually.equal(false)
      })

      it(`should not allow whitelisting an already whitelisted address`, async () => {
        const [owner, wallet, investor] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.whitelist(investor, true, {from: owner})).to.be.fulfilled
        await expect(sale.whitelist(investor, true, {from: owner})).to.be.rejectedWith(evm.Throw)
      })

      it(`should not allow unwhitelisting an already unwhitelisted address`, async () => {
        const [owner, wallet, investor] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.whitelist(investor, false, {from: owner})).to.be.rejectedWith(evm.Throw)
      })
    })
  })

  describe('buying tokens', () => {
    describe(`before sale starts`, () => {
      it(`should not be possible`, async () => {
        const [owner, wallet] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.send(evm.wei(1, 'ether'))).to.be.rejectedWith(evm.Throw)
        await expect(sale.buyTokens(owner, {value: evm.wei(1, 'ether'), from: owner})).to.be.rejectedWith(evm.Throw)
      })
    })

    describe(`after sale ends`, () => {
      it(`should not be possible`, async () => {
        const [owner, wallet] = accounts
        const sale = await createPreSale({owner, wallet})
        const endTime = await sale.endTime.call()
        await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
        await expect(sale.send(evm.wei(1, 'ether'))).to.be.rejectedWith(evm.Throw)
        await expect(sale.buyTokens(owner, {value: evm.wei(1, 'ether'), from: owner})).to.be.rejectedWith(evm.Throw)
      })
    })

    describe(`when sale is paused`, () => {
      it(`should not be possible`, async () => {
        const [owner, wallet] = accounts
        const sale = await createPreSale({owner, wallet})
        const startTime = await sale.startTime.call()
        await evm.increaseTimeTo(startTime.toNumber())
        await sale.pause()
        await expect(sale.send(evm.wei(1, 'ether'))).to.be.rejectedWith(evm.Throw)
        await expect(sale.buyTokens(owner, {value: evm.wei(1, 'ether'), from: owner})).to.be.rejectedWith(evm.Throw)
      })
    })

    describe(`during sale`, () => {
      describe(`from a non-whitelisted address`, () => {
        it(`should not be possible`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await expect(sale.sendTransaction({value: evm.wei(1, 'ether'), from: investor})).to.be.rejectedWith(evm.Throw)
          await expect(sale.buyTokens(investor, {value: evm.wei(1, 'ether'), from: investor})).to.be.rejectedWith(evm.Throw)
        })
      })

      describe(`from a whitelisted address`, () => {
        it(`should increase total token supply`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet, rate: 1})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          const token = PreSaleToken.at(await sale.token.call())
          await expect(token.totalSupply.call()).to.eventually.be.bignumber.equal(0)
          await sale.whitelist(investor, true, {from: owner})
          await sale.sendTransaction({value: evm.wei(1, 'ether'), from: investor})
          await sale.buyTokens(investor, {value: evm.wei(1, 'ether'), from: investor})
          await expect(token.totalSupply.call()).to.eventually.be.bignumber.equal(evm.wei(2, 'ether'))
        })

        it(`should increase weiRaised`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await expect(sale.weiRaised.call()).to.eventually.be.bignumber.equal(0)
          await sale.whitelist(investor, true, {from: owner})
          await sale.sendTransaction({value: evm.wei(1, 'ether'), from: investor})
          await sale.buyTokens(investor, {value: evm.wei(3, 'ether'), from: investor})
          await expect(sale.weiRaised.call()).to.eventually.be.bignumber.equal(evm.wei(4, 'ether'))
        })

        it(`should assign tokens to the investor`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet, rate: 1})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          const token = PreSaleToken.at(await sale.token.call())
          await expect(token.balanceOf.call(investor)).to.eventually.bignumber.equal(0)
          await sale.whitelist(investor, true, {from: owner})
          await sale.sendTransaction({value: evm.wei(1, 'wei'), from: investor})
          await sale.buyTokens(investor, {value: evm.wei(3, 'wei'), from: investor})
          await expect(token.balanceOf.call(investor)).to.eventually.bignumber.equal(evm.wei(4, 'wei'))
        })

        it(`should increase investor's deposited amount`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await expect(sale.depositOf.call(investor)).to.eventually.bignumber.equal(0)
          await sale.whitelist(investor, true, {from: owner})
          await sale.sendTransaction({value: evm.wei(16, 'wei'), from: investor})
          await sale.buyTokens(investor, {value: evm.wei(49, 'wei'), from: investor})
          await expect(sale.depositOf.call(investor)).to.eventually.bignumber.equal(evm.wei(65, 'wei'))
        })

        it(`should add the investor to the list of investors`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await expect(sale.investors.call(0)).to.be.rejectedWith(evm.Throw)
          await sale.whitelist(investor, true, {from: owner})
          await sale.sendTransaction({value: evm.wei(16, 'wei'), from: investor})
          await sale.buyTokens(investor, {value: evm.wei(49, 'wei'), from: investor})
          await expect(sale.investors.call(0)).to.eventually.equal(investor)
        })
      })
    })
  })
})
