/* global artifacts:false, contract:false, before: false, describe: false, it:false */

const duration = require('./helpers/duration')
const evm = require('./helpers/evm')
const {expect} = require('./helpers/chai')
const {wei, ether} = require('./helpers/denominations')

const PreSale = artifacts.require('./PreSale.sol')
const PreSaleToken = artifacts.require('./PreSaleToken.sol')

contract('PreSale', accounts => {
  const createPreSale = async (options = {}) => {
    const [owner, wallet] = accounts

    const now = await evm.latestTime()

    const defaults = {
      owner,
      wallet,
      walletTestValue: wei(1),
      goal: ether(1000),
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
      {value: args.walletTestValue, from: args.owner}
    )
  }

  before(async () => {
    return await evm.advanceBlock()
  })

  describe('creation', () => {
    it(`should require a non-zero value to create`, async () => {
      const [owner, wallet] = accounts
      await expect(createPreSale({owner, wallet, walletTestValue: wei(0)})).to.be.rejectedWith(evm.Throw)
      await expect(createPreSale({owner, wallet, walletTestValue: wei(1)})).to.be.fulfilled
    })

    it(`should require a non-zero rate`, async () => {
      const [owner, wallet] = accounts
      await expect(createPreSale({owner, wallet, rate: 0})).to.be.rejectedWith(evm.Throw)
      await expect(createPreSale({owner, wallet, rate: 1})).to.be.fulfilled
    })

    it(`should require a non-zero goal`, async () => {
      const [owner, wallet] = accounts
      await expect(createPreSale({owner, wallet, goal: wei(0)})).to.be.rejectedWith(evm.Throw)
      await expect(createPreSale({owner, wallet, goal: wei(1)})).to.be.fulfilled
    })

    it(`should refuse 0x0 as wallet`, async () => {
      const [owner, wallet] = accounts
      await expect(createPreSale({owner, wallet: evm.ZERO})).to.be.rejectedWith(evm.Throw)
      await expect(createPreSale({owner, wallet})).to.be.fulfilled
    })

    it(`should refuse a start time earlier than current time`, async () => {
      const [owner, wallet] = accounts
      const now = await evm.latestTime()
      await expect(createPreSale({owner, wallet, startTime: now - duration.minutes(1)})).to.be.rejectedWith(evm.Throw)
      await expect(createPreSale({owner, wallet, startTime: now + duration.minutes(1)})).to.be.fulfilled
    })

    it(`should refuse an end time earlier than start time`, async () => {
      const [owner, wallet] = accounts
      const now = await evm.latestTime()
      await expect(createPreSale({owner, wallet, startTime: now + duration.minutes(10), endTime: now + duration.minutes(5)})).to.be.rejectedWith(evm.Throw)
      await expect(createPreSale({owner, wallet, startTime: now + duration.minutes(10), endTime: now + duration.minutes(15)})).to.be.fulfilled
    })
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
      await expect(sale.transferOwnership(evm.ZERO, {from: owner})).to.be.rejectedWith(evm.Throw)
    })

    it(`should fire OwnershipTransferred event on ownership change`, async () => {
      const [owner, nonOwner, wallet] = accounts
      const sale = await createPreSale({owner, wallet})
      const {logs} = await expect(sale.transferOwnership(nonOwner, {from: owner})).to.be.fulfilled
      expect(logs.find(e => e.event === 'OwnershipTransferred')).to.exist
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
    describe(`by non-owner`, () => {
      it(`should not be possible to pause`, async () => {
        const [owner, nonOwner, wallet] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.pause({from: nonOwner})).to.be.rejectedWith(evm.Throw)
      })

      it(`should not be possible to unpause`, async () => {
        const [owner, nonOwner, wallet] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.pause({from: owner})).to.be.fulfilled
        await expect(sale.unpause({from: nonOwner})).to.be.rejectedWith(evm.Throw)
      })
    })

    describe(`by owner`, () => {
      it(`should be unpaused by default`, async () => {
        const [owner, wallet] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.paused.call()).to.eventually.equal(false)
      })

      it(`should set paused flag`, async () => {
        const [owner, wallet] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.pause({from: owner})).to.be.fulfilled
        await expect(sale.paused.call()).to.eventually.equal(true)
      })

      it(`should not be possible if already paused`, async () => {
        const [owner, wallet] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.pause({from: owner})).to.be.fulfilled
        await expect(sale.pause()).to.be.rejectedWith(evm.Throw)
      })

      it(`should be unpausable`, async () => {
        const [owner, wallet] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.pause({from: owner})).to.be.fulfilled
        await expect(sale.unpause({from: owner})).to.be.fulfilled
        await expect(sale.paused.call()).to.eventually.equal(false)
      })

      it(`should not be unpausable when not paused`, async () => {
        const [owner, wallet] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.unpause({from: owner})).to.be.rejectedWith(evm.Throw)
      })

      it(`should fire Pause event when paused`, async () => {
        const [owner, wallet] = accounts
        const sale = await createPreSale({owner, wallet})
        const {logs} = await expect(sale.pause({from: owner})).to.be.fulfilled
        expect(logs.find(e => e.event === 'Pause')).to.exist
      })

      it(`should fire Unpause event when unpaused`, async () => {
        const [owner, wallet] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.pause({from: owner})).to.be.fulfilled
        const {logs} = await expect(sale.unpause({from: owner})).to.be.fulfilled
        expect(logs.find(e => e.event === 'Unpause')).to.exist
      })
    })
  })

  describe('whitelisting', () => {
    describe(`by non-owner`, () => {
      it(`should not be possible`, async () => {
        const [owner, wallet, nonOwner, investor] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.whitelist(investor, wei(100), {from: nonOwner})).to.be.rejectedWith(evm.Throw)
      })
    })

    describe(`by owner`, () => {
      it(`should default to 0`, async () => {
        const [owner, wallet, investor] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.whitelisted.call(investor)).to.eventually.bignumber.equal(wei(0))
      })

      it(`should allow whitelisting`, async () => {
        const [owner, wallet, investor] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.whitelist(investor, wei(100), {from: owner})).to.be.fulfilled
        await expect(sale.whitelisted.call(investor)).to.eventually.bignumber.equal(wei(100))
      })

      it(`should not allow whitelisting 0x0`, async () => {
        const [owner, wallet] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.whitelist(evm.ZERO, wei(100), {from: owner})).to.be.rejectedWith(evm.Throw)
      })

      it(`should allow whitelisted amount to be increased`, async () => {
        const [owner, wallet, investor] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.whitelist(investor, wei(10), {from: owner})).to.be.fulfilled
        await expect(sale.whitelist(investor, wei(200), {from: owner})).to.be.fulfilled
        await expect(sale.whitelisted.call(investor)).to.eventually.bignumber.equal(wei(200))
      })

      it(`should allow whitelisted amount to be decreased`, async () => {
        const [owner, wallet, investor] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.whitelist(investor, wei(100), {from: owner})).to.be.fulfilled
        await expect(sale.whitelist(investor, wei(0), {from: owner})).to.be.fulfilled
        await expect(sale.whitelisted.call(investor)).to.eventually.bignumber.equal(wei(0))
      })

      it(`should fire Whitelisted event`, async () => {
        const [owner, wallet, investor] = accounts
        const sale = await createPreSale({owner, wallet})
        const {logs} = await expect(sale.whitelist(investor, wei(100), {from: owner})).to.be.fulfilled
        expect(logs.find(e => e.event === 'Whitelisted')).to.exist
      })
    })
  })

  describe('buying tokens', () => {
    describe(`before sale starts`, () => {
      it(`should not be possible`, async () => {
        const [owner, wallet, investor] = accounts
        const sale = await createPreSale({owner, wallet})
        const startTime = await sale.startTime.call()
        await expect(sale.whitelist(investor, ether(10), {from: owner}))
        await expect(sale.sendTransaction({value: ether(1), from: investor})).to.be.rejectedWith(evm.Throw)
        await expect(sale.buyTokens(investor, {value: ether(1), from: investor})).to.be.rejectedWith(evm.Throw)
        await evm.increaseTimeTo(startTime.toNumber())
        await expect(sale.buyTokens(investor, {value: ether(1), from: investor})).to.be.fulfilled
      })
    })

    describe(`after sale ends`, () => {
      it(`should not be possible`, async () => {
        const [owner, wallet, investor] = accounts
        const sale = await createPreSale({owner, wallet})
        const startTime = await sale.startTime.call()
        await evm.increaseTimeTo(startTime.toNumber())
        await expect(sale.whitelist(investor, ether(10), {from: owner}))
        await expect(sale.sendTransaction({value: wei(1), from: investor})).to.be.fulfilled
        const endTime = await sale.endTime.call()
        await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
        await expect(sale.sendTransaction({value: wei(1), from: investor})).to.be.rejectedWith(evm.Throw)
        await expect(sale.buyTokens(investor, {value: wei(1), from: investor})).to.be.rejectedWith(evm.Throw)
      })
    })

    describe(`when sale is paused`, () => {
      it(`should not be possible`, async () => {
        const [owner, wallet, investor] = accounts
        const sale = await createPreSale({owner, wallet})
        const startTime = await sale.startTime.call()
        await evm.increaseTimeTo(startTime.toNumber())
        await expect(sale.whitelist(investor, ether(10), {from: owner}))
        await expect(sale.sendTransaction({value: wei(1), from: investor})).to.be.fulfilled
        await expect(sale.pause()).to.be.fulfilled
        await expect(sale.sendTransaction({value: wei(1), from: investor})).to.be.rejectedWith(evm.Throw)
        await expect(sale.buyTokens(investor, {value: wei(1), from: investor})).to.be.rejectedWith(evm.Throw)
      })
    })

    describe(`when sale has finished`, () => {
      it(`should not be possible`, async () => {
        const [owner, wallet, investor] = accounts
        const sale = await createPreSale({owner, wallet, goal: wei(2)})
        const endTime = await sale.endTime.call()
        await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
        await expect(sale.whitelist(investor, ether(10), {from: owner}))
        await expect(sale.sendTransaction({value: wei(2), from: investor})).to.be.rejectedWith(evm.Throw)
        await expect(sale.finish()).to.be.fulfilled
        await expect(sale.sendTransaction({value: wei(1), from: investor})).to.be.rejectedWith(evm.Throw)
        await expect(sale.buyTokens(investor, {value: wei(1), from: investor})).to.be.rejectedWith(evm.Throw)
      })
    })

    describe(`during sale`, () => {
      describe(`validation`, () => {
        it(`should not accept 0x0 as beneficiary`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await expect(sale.buyTokens(evm.ZERO, {value: wei(1), from: investor})).to.be.rejectedWith(evm.Throw)
        })

        it(`should require a non-zero value`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await sale.whitelist(investor, ether(10), {from: owner})
          await expect(sale.buyTokens(investor, {value: wei(0), from: investor})).to.be.rejectedWith(evm.Throw)
        })
      })

      describe(`for a non-whitelisted beneficiary`, () => {
        it(`should not be possible`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await expect(sale.sendTransaction({value: ether(1), from: investor})).to.be.rejectedWith(evm.Throw)
          await expect(sale.buyTokens(investor, {value: ether(1), from: investor})).to.be.rejectedWith(evm.Throw)
        })
      })

      describe(`for a whitelisted beneficiary`, () => {
        it(`should increase total token supply`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet, rate: 1})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          const token = PreSaleToken.at(await sale.token.call())
          await expect(token.totalSupply.call()).to.eventually.be.bignumber.equal(0)
          await sale.whitelist(investor, ether(10), {from: owner})
          await sale.sendTransaction({value: ether(1), from: investor})
          await sale.buyTokens(investor, {value: ether(1), from: investor})
          await expect(token.totalSupply.call()).to.eventually.be.bignumber.equal(ether(2))
        })

        it(`should increase weiRaised`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await expect(sale.weiRaised.call()).to.eventually.be.bignumber.equal(0)
          await sale.whitelist(investor, ether(4), {from: owner})
          await sale.sendTransaction({value: ether(1), from: investor})
          await sale.buyTokens(investor, {value: ether(3), from: investor})
          await expect(sale.weiRaised.call()).to.eventually.be.bignumber.equal(ether(4))
        })

        it(`should assign tokens to the investor`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet, rate: 1})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          const token = PreSaleToken.at(await sale.token.call())
          await expect(token.balanceOf.call(investor)).to.eventually.bignumber.equal(0)
          await sale.whitelist(investor, ether(4), {from: owner})
          await sale.sendTransaction({value: wei(1), from: investor})
          await sale.buyTokens(investor, {value: wei(3), from: investor})
          await expect(token.balanceOf.call(investor)).to.eventually.bignumber.equal(wei(4))
        })

        it(`should increase investor's deposited amount`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await expect(sale.deposited.call(investor)).to.eventually.bignumber.equal(0)
          await sale.whitelist(investor, ether(1), {from: owner})
          await sale.sendTransaction({value: wei(16), from: investor})
          await sale.buyTokens(investor, {value: wei(49), from: investor})
          await expect(sale.deposited.call(investor)).to.eventually.bignumber.equal(wei(65))
        })

        it(`should not be allowed if over whitelisted amount`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await sale.whitelist(investor, wei(1), {from: owner})
          await expect(sale.sendTransaction({value: wei(2), from: investor})).to.be.rejectedWith(evm.Throw)
          await expect(sale.buyTokens(investor, {value: wei(1), from: investor})).to.be.fulfilled
          await expect(sale.buyTokens(investor, {value: wei(1), from: investor})).to.be.rejectedWith(evm.Throw)
        })

        it(`should add the investor to the list of investors`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await expect(sale.investors.call(0)).to.be.rejectedWith(evm.Throw)
          await sale.whitelist(investor, ether(1), {from: owner})
          await sale.sendTransaction({value: wei(16), from: investor})
          await sale.buyTokens(investor, {value: wei(49), from: investor})
          await expect(sale.investors.call(0)).to.eventually.equal(investor)
        })

        it(`should fire TokenPurchase event`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await sale.whitelist(investor, ether(1), {from: owner})
          const {logs: logs1} = await sale.sendTransaction({value: wei(16), from: investor})
          expect(logs1.find(e => e.event === 'TokenPurchase')).to.exist
          const {logs: logs2} = await sale.buyTokens(investor, {value: wei(49), from: investor})
          expect(logs2.find(e => e.event === 'TokenPurchase')).to.exist
        })
      })
    })
  })

  describe(`withdrawals`, () => {
    describe(`by non-owner`, () => {
      it(`should not be possible`, async () => {
        const [owner, wallet, nonOwner, investor] = accounts
        const sale = await createPreSale({owner, wallet, goal: wei(333)})
        const startTime = await sale.startTime.call()
        await evm.increaseTimeTo(startTime.toNumber())
        await sale.whitelist(investor, ether(1), {from: owner})
        await expect(sale.sendTransaction({value: wei(333), from: investor})).to.be.fulfilled
        await expect(sale.withdraw({from: nonOwner})).to.be.rejectedWith(evm.Throw)
      })
    })

    describe(`by owner`, () => {
      describe(`when goal has not been reached`, () => {
        it(`should not be possible`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet, goal: wei(333)})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await sale.whitelist(investor, ether(1), {from: owner})
          await expect(sale.sendTransaction({value: wei(332), from: investor})).to.be.fulfilled
          await expect(sale.withdraw({from: owner})).to.be.rejectedWith(evm.Throw)
        })
      })

      describe(`when goal has been reached`, () => {
        it(`should transfer current balance to the wallet`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet, goal: wei(333)})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await sale.whitelist(investor, ether(1), {from: owner})
          await expect(sale.sendTransaction({value: wei(333), from: investor})).to.be.fulfilled
          const walletBalanceBefore = await evm.getBalance(wallet)
          await expect(sale.withdraw({from: owner})).to.be.fulfilled
          const walletBalanceAfter = await evm.getBalance(wallet)
          expect(walletBalanceAfter.minus(walletBalanceBefore)).to.bignumber.equal(wei(333))
        })

        it(`should should not change weiRaised`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet, goal: wei(333)})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await sale.whitelist(investor, ether(1), {from: owner})
          await expect(sale.sendTransaction({value: wei(333), from: investor})).to.be.fulfilled
          const weiRaisedBefore = await expect(sale.weiRaised.call()).to.be.fulfilled
          await expect(sale.withdraw({from: owner})).to.be.fulfilled
          const weiRaisedAfter = await expect(sale.weiRaised.call()).to.be.fulfilled
          expect(weiRaisedAfter.minus(weiRaisedBefore)).to.bignumber.equal(0)
        })

        it(`should fire Withdrawal event if any balance left`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet, goal: wei(333)})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await sale.whitelist(investor, ether(1), {from: owner})
          await expect(sale.sendTransaction({value: wei(333), from: investor})).to.be.fulfilled
          const {logs} = await expect(sale.withdraw({from: owner})).to.be.fulfilled
          expect(logs.find(e => e.event === 'Withdrawal')).to.exist
        })

        it(`should not fire Withdrawal event if no balance left`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet, goal: wei(333)})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await sale.whitelist(investor, ether(1), {from: owner})
          await expect(sale.sendTransaction({value: wei(333), from: investor})).to.be.fulfilled
          await expect(sale.withdraw({from: owner})).to.be.fulfilled
          const {logs} = await expect(sale.withdraw({from: owner})).to.be.fulfilled
          expect(logs.find(e => e.event === 'Withdrawal')).to.not.exist
        })
      })
    })
  })

  describe(`extending`, () => {
    describe(`by non-owner`, () => {
      it(`should not be possible`, async () => {
        const [owner, wallet, nonOwner] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.extendTime(duration.days(7), {from: nonOwner})).to.be.rejectedWith(evm.Throw)
        await expect(sale.extendTime(duration.days(7), {from: owner})).to.be.fulfilled
      })
    })

    describe(`by owner`, () => {
      it(`should allow purchases until extension is over`, async () => {
        const [owner, wallet, investor] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.extendTime(duration.days(7), {from: owner})).to.be.fulfilled
        const endTime = await sale.endTime.call()
        await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
        await expect(sale.whitelist(investor, ether(1), {from: owner})).to.be.fulfilled
        await expect(sale.buyTokens(investor, {value: wei(49), from: investor})).to.be.fulfilled
        await evm.increaseTimeTo(endTime.toNumber() + duration.days(8))
        await expect(sale.sendTransaction({value: wei(16), from: investor})).to.be.rejectedWith(evm.Throw)
        await expect(sale.buyTokens(investor, {value: wei(49), from: investor})).to.be.rejectedWith(evm.Throw)
      })

      it(`should not be possible beyond 7 days`, async () => {
        const [owner, wallet] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.extendTime(duration.days(7), {from: owner})).to.be.fulfilled
        await expect(sale.extendTime(duration.days(1), {from: owner})).to.be.rejectedWith(evm.Throw)
      })

      it(`should not be possible after sale has ended`, async () => {
        const [owner, wallet] = accounts
        const sale = await createPreSale({owner, wallet})
        const endTime = await sale.endTime.call()
        await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
        await expect(sale.extendTime(duration.days(1), {from: owner})).to.be.rejectedWith(evm.Throw)
      })

      it(`should not be possible after sale has finished`, async () => {
        const [owner, wallet] = accounts
        const sale = await createPreSale({owner, wallet})
        const endTime = await sale.endTime.call()
        await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
        await expect(sale.finish({from: owner})).to.be.fulfilled
        await expect(sale.extendTime(duration.days(1), {from: owner})).to.be.rejectedWith(evm.Throw)
      })

      it(`should not allow extending by 0`, async () => {
        const [owner, wallet] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.extendTime(duration.seconds(0), {from: owner})).to.be.rejectedWith(evm.Throw)
        await expect(sale.extendTime(duration.seconds(1), {from: owner})).to.be.fulfilled
      })

      it(`should fire Extended event`, async () => {
        const [owner, wallet] = accounts
        const sale = await createPreSale({owner, wallet})
        const {logs} = await expect(sale.extendTime(duration.days(2), {from: owner})).to.be.fulfilled
        expect(logs.find(e => e.event === 'Extended')).to.exist
      })
    })
  })

  describe(`finishing`, () => {
    describe(`by non-owner`, () => {
      it(`should not be possible`, async () => {
        const [owner, wallet, nonOwner] = accounts
        const sale = await createPreSale({owner, wallet})
        const endTime = await sale.endTime.call()
        await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
        await expect(sale.finish({from: nonOwner})).to.be.rejectedWith(evm.Throw)
      })
    })

    describe(`by owner`, () => {
      describe(`before sale has ended`, () => {
        it(`should not be possible`, async () => {
          const [owner, wallet] = accounts
          const sale = await createPreSale({owner, wallet})
          await expect(sale.finish({from: owner})).to.be.rejectedWith(evm.Throw)
        })
      })

      describe(`after sale has ended`, () => {
        describe(`when goal has not been reached`, () => {
          it(`should set finished flag`, async () => {
            const [owner, wallet] = accounts
            const sale = await createPreSale({owner, wallet, goal: wei(100)})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            await expect(sale.finished.call()).to.eventually.equal(false)
            await expect(sale.finish({from: owner})).to.be.fulfilled
            await expect(sale.finished.call()).to.eventually.equal(true)
          })

          it(`should set refunding flag`, async () => {
            const [owner, wallet] = accounts
            const sale = await createPreSale({owner, wallet, goal: wei(100)})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            await expect(sale.refunding.call()).to.eventually.equal(false)
            await expect(sale.finish({from: owner})).to.be.fulfilled
            await expect(sale.refunding.call()).to.eventually.equal(true)
          })

          it(`should fire Finalized event`, async () => {
            const [owner, wallet] = accounts
            const sale = await createPreSale({owner, wallet, goal: wei(100)})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            const {logs} = await expect(sale.finish({from: owner})).to.be.fulfilled
            expect(logs.find(e => e.event === 'Finalized')).to.exist
          })

          it(`should fire Refunding event`, async () => {
            const [owner, wallet] = accounts
            const sale = await createPreSale({owner, wallet, goal: wei(100)})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            const {logs} = await expect(sale.finish({from: owner})).to.be.fulfilled
            expect(logs.find(e => e.event === 'Refunding')).to.exist
          })

          it(`should not transfer balance to wallet`, async () => {
            const [owner, wallet] = accounts
            const sale = await createPreSale({owner, wallet, goal: wei(100)})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            const balanceBefore = await evm.getBalance(wallet)
            await expect(sale.finish({from: owner})).to.be.fulfilled
            const balanceAfter = await evm.getBalance(wallet)
            expect(balanceAfter.minus(balanceBefore)).to.bignumber.equal(0)
          })

          it(`should keep balance unchanged`, async () => {
            const [owner, wallet] = accounts
            const sale = await createPreSale({owner, wallet, goal: wei(100)})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            const balanceBefore = await evm.getBalance(sale.address)
            await expect(sale.finish({from: owner})).to.be.fulfilled
            const balanceAfter = await evm.getBalance(sale.address)
            expect(balanceAfter.minus(balanceBefore)).to.bignumber.equal(0)
          })

          it(`should finish token minting`, async () => {
            const [owner, wallet] = accounts
            const sale = await createPreSale({owner, wallet, goal: wei(100)})
            const token = PreSaleToken.at(await sale.token.call())
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            await expect(token.mintingFinished.call()).to.eventually.equal(false)
            await expect(sale.finish({from: owner})).to.be.fulfilled
            await expect(token.mintingFinished.call()).to.eventually.equal(true)
          })

          it(`should not transfer ownership of token`, async () => {
            const [owner, wallet] = accounts
            const sale = await createPreSale({owner, wallet, goal: wei(100)})
            const token = PreSaleToken.at(await sale.token.call())
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            await expect(token.owner.call()).to.eventually.equal(sale.address)
            await expect(sale.finish({from: owner})).to.be.fulfilled
            await expect(token.owner.call()).to.eventually.equal(sale.address)
          })
        })

        describe(`when goal has been reached`, () => {
          it(`should set finished flag`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createPreSale({owner, wallet, goal: wei(100)})
            await sale.whitelist(investor, ether(1), {from: owner})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.buyTokens(investor, {value: wei(100), from: investor})
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            await expect(sale.finished.call()).to.eventually.equal(false)
            await expect(sale.finish({from: owner})).to.be.fulfilled
            await expect(sale.finished.call()).to.eventually.equal(true)
          })

          it(`should fire Finalized event`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createPreSale({owner, wallet, goal: wei(100)})
            await sale.whitelist(investor, ether(1), {from: owner})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.buyTokens(investor, {value: wei(100), from: investor})
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            const {logs} = await expect(sale.finish({from: owner})).to.be.fulfilled
            expect(logs.find(e => e.event === 'Finalized')).to.exist
          })

          it(`should not fire Refunding event`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createPreSale({owner, wallet, goal: wei(100)})
            await sale.whitelist(investor, ether(1), {from: owner})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.buyTokens(investor, {value: wei(100), from: investor})
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            const {logs} = await expect(sale.finish({from: owner})).to.be.fulfilled
            expect(logs.find(e => e.event === 'Refunding')).to.not.exist
          })

          it(`should not set refunding flag`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createPreSale({owner, wallet, goal: wei(100)})
            await sale.whitelist(investor, ether(1), {from: owner})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.buyTokens(investor, {value: wei(100), from: investor})
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            await expect(sale.refunding.call()).to.eventually.equal(false)
            await expect(sale.finish({from: owner})).to.be.fulfilled
            await expect(sale.refunding.call()).to.eventually.equal(false)
          })

          it(`should transfer whole balance to wallet`, async () => {
            const [owner, wallet, investor] = accounts
            const goal = wei(100)
            const sale = await createPreSale({owner, wallet, goal})
            await sale.whitelist(investor, ether(1), {from: owner})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.buyTokens(investor, {value: goal, from: investor})
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            const walletBalanceBefore = await evm.getBalance(wallet)
            const saleBalanceBefore = await evm.getBalance(sale.address)
            expect(saleBalanceBefore).to.bignumber.equal(goal)
            await expect(sale.finish({from: owner})).to.be.fulfilled
            const walletBalanceAfter = await evm.getBalance(wallet)
            const saleBalanceAfter = await evm.getBalance(sale.address)
            expect(walletBalanceAfter.minus(walletBalanceBefore)).to.bignumber.equal(goal)
            expect(saleBalanceAfter).to.bignumber.equal(0)
          })

          it(`should finish token minting`, async () => {
            const [owner, wallet, investor] = accounts
            const goal = wei(100)
            const sale = await createPreSale({owner, wallet, goal})
            const token = PreSaleToken.at(await sale.token.call())
            await sale.whitelist(investor, ether(1), {from: owner})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.buyTokens(investor, {value: goal, from: investor})
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            await expect(token.mintingFinished.call()).to.eventually.equal(false)
            await expect(sale.finish({from: owner})).to.be.fulfilled
            await expect(token.mintingFinished.call()).to.eventually.equal(true)
          })

          it(`should transfer ownership of token to sale owner`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createPreSale({owner, wallet, goal: wei(100)})
            const token = PreSaleToken.at(await sale.token.call())
            await sale.whitelist(investor, ether(1), {from: owner})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.buyTokens(investor, {value: wei(200), from: investor})
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            await expect(token.owner.call()).to.eventually.equal(sale.address)
            await expect(sale.finish({from: owner})).to.be.fulfilled
            await expect(token.owner.call()).to.eventually.equal(owner)
          })

          it(`should fire Withdrawal event if any balance left`, async () => {
            const [owner, wallet, investor] = accounts
            const goal = wei(100)
            const sale = await createPreSale({owner, wallet, goal})
            await sale.whitelist(investor, ether(1), {from: owner})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.buyTokens(investor, {value: goal, from: investor})
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            const {logs} = await expect(sale.finish({from: owner})).to.be.fulfilled
            expect(logs.find(e => e.event === 'Withdrawal')).to.exist
          })

          it(`should not fire Withdrawal event no balance left`, async () => {
            const [owner, wallet, investor] = accounts
            const goal = wei(100)
            const sale = await createPreSale({owner, wallet, goal})
            await sale.whitelist(investor, ether(1), {from: owner})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.buyTokens(investor, {value: goal, from: investor})
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            await expect(sale.withdraw({from: owner})).to.be.fulfilled
            const {logs} = await expect(sale.finish({from: owner})).to.be.fulfilled
            expect(logs.find(e => e.event === 'Withdrawal')).to.not.exist
          })
        })

        it(`should not be possible to finish after already finished`, async () => {
          const [owner, wallet] = accounts
          const sale = await createPreSale({owner, wallet, goal: wei(100)})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          const endTime = await sale.endTime.call()
          await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
          await expect(sale.finish({from: owner})).to.be.fulfilled
          await expect(sale.finish({from: owner})).to.be.rejectedWith(evm.Throw)
        })
      })
    })
  })

  describe(`refunds`, () => {
    describe(`when sale has not finished`, () => {
      it(`should not be possible`, async () => {
        const [owner, wallet, investor] = accounts
        const sale = await createPreSale({owner, wallet, goal: wei(100)})
        const sent = wei(15)
        const startTime = await sale.startTime.call()
        await evm.increaseTimeTo(startTime.toNumber())
        await sale.whitelist(investor, ether(1), {from: owner})
        await sale.buyTokens(investor, {value: sent, from: investor})
        await expect(sale.refund(investor, {from: investor})).to.be.rejectedWith(evm.Throw)
      })
    })

    describe(`when sale has finished`, () => {
      describe(`when refunding flag is not set`, () => {
        it(`should not be possible`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet, goal: wei(100)})
          const sent = wei(150)
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await sale.whitelist(investor, ether(1), {from: owner})
          await sale.buyTokens(investor, {value: sent, from: investor})
          const endTime = await sale.endTime.call()
          await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
          await expect(sale.finish({from: owner})).to.be.fulfilled
          await expect(sale.refund(investor, {from: investor})).to.be.rejectedWith(evm.Throw)
        })
      })

      describe(`when refunding flag is set`, () => {
        it(`should transfer investor's deposited amount back to the investor`, async () => {
          const [owner, wallet, investor1, investor2] = accounts
          const sale = await createPreSale({owner, wallet, goal: wei(100)})
          const sent1 = wei(15)
          const sent2 = wei(27)
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await sale.whitelist(investor1, ether(1), {from: owner})
          await sale.whitelist(investor2, ether(1), {from: owner})
          await sale.buyTokens(investor1, {value: sent1, from: investor1})
          await sale.buyTokens(investor2, {value: sent2, from: investor2})
          const endTime = await sale.endTime.call()
          await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
          await expect(sale.finish({from: owner})).to.be.fulfilled
          const investor1BalanceBefore = await evm.getBalance(investor1)
          await expect(sale.refund(investor1, {from: investor1, gasPrice: 0})).to.be.fulfilled
          const investor1BalanceAfter = await evm.getBalance(investor1)
          expect(investor1BalanceAfter.minus(investor1BalanceBefore)).to.bignumber.equal(sent1)
          const investor2BalanceBefore = await evm.getBalance(investor2)
          await expect(sale.refund(investor2, {from: investor2, gasPrice: 0})).to.be.fulfilled
          const investor2BalanceAfter = await evm.getBalance(investor2)
          expect(investor2BalanceAfter.minus(investor2BalanceBefore)).to.bignumber.equal(sent2)
        })

        it(`should increase weiRefunded`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet, goal: wei(100)})
          const sent = wei(15)
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await sale.whitelist(investor, ether(1), {from: owner})
          await sale.buyTokens(investor, {value: sent, from: investor})
          const endTime = await sale.endTime.call()
          await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
          await expect(sale.finish({from: owner})).to.be.fulfilled
          await expect(sale.weiRefunded.call()).to.eventually.bignumber.equal(0)
          await expect(sale.refund(investor, {from: investor})).to.be.fulfilled
          await expect(sale.weiRefunded.call()).to.eventually.bignumber.equal(sent)
        })

        it(`should set investor's deposit to 0`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet, goal: wei(100)})
          const sent = wei(15)
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await sale.whitelist(investor, ether(1), {from: owner})
          await sale.buyTokens(investor, {value: sent, from: investor})
          const endTime = await sale.endTime.call()
          await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
          await expect(sale.finish({from: owner})).to.be.fulfilled
          await expect(sale.deposited.call(investor)).to.eventually.bignumber.equal(sent)
          await expect(sale.refund(investor, {from: investor})).to.be.fulfilled
          await expect(sale.deposited.call(investor)).to.eventually.bignumber.equal(0)
        })

        it(`should fire Refunded event`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet, goal: wei(100)})
          const sent = wei(15)
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await sale.whitelist(investor, ether(1), {from: owner})
          await sale.buyTokens(investor, {value: sent, from: investor})
          const endTime = await sale.endTime.call()
          await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
          await expect(sale.finish({from: owner})).to.be.fulfilled
          const {logs} = await expect(sale.refund(investor, {from: investor})).to.be.fulfilled
          expect(logs.find(e => e.event === 'Refunded')).to.exist
        })

        it(`should not be possible if deposit is 0`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet, goal: wei(100)})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await sale.whitelist(investor, ether(1), {from: owner})
          const endTime = await sale.endTime.call()
          await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
          await expect(sale.finish({from: owner})).to.be.fulfilled
          await expect(sale.refund(investor, {from: investor})).to.be.rejectedWith(evm.Throw)
        })
      })
    })
  })
})
