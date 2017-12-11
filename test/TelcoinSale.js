/* global artifacts:false, contract:false, before: false, describe: false, it:false */

const duration = require('./helpers/duration')
const evm = require('./helpers/evm')
const {expect} = require('./helpers/chai')
const {wei, ether} = require('./helpers/denominations')

const Telcoin = artifacts.require('./Telcoin.sol')
const TelcoinSale = artifacts.require('./TelcoinSale.sol')
const TelcoinSaleToken = artifacts.require('./TelcoinSaleToken.sol')

contract('TelcoinSale', accounts => {
  const createSale = async (options = {}) => {
    const [owner, wallet] = accounts

    const now = await evm.latestTime()

    const defaults = {
      owner,
      wallet,
      walletTestValue: wei(1),
      softCap: ether(1000),
      hardCap: ether(25000),
      capFlex: 0,
      rate: 1,
      // Note that startTime needs to definitely be after `now`. By the time
      // we create the contract, a require that checks `now` may already have
      // advanced to a higher value, which leads to intermittent failures.
      startTime: now + duration.weeks(1),
      endTime: now + duration.weeks(2),
      telcoin: null,
      bonusVestingStart: now + duration.weeks(2),
      bonusVestingDuration: duration.days(180)
    }

    const args = Object.assign({}, defaults, options)

    args.telcoin = args.telcoin || await Telcoin.new(args.owner, {from: args.owner})

    return await TelcoinSale.new(
      args.softCap,
      args.hardCap,
      args.capFlex,
      args.startTime,
      args.endTime,
      args.rate,
      args.wallet,
      args.telcoin.address,
      args.bonusVestingStart,
      args.bonusVestingDuration,
      {value: args.walletTestValue, from: args.owner}
    )
  }

  before(async () => {
    return await evm.advanceBlock()
  })

  describe('contract', () => {
    describe('creation', () => {
      it(`should require a non-zero value to create`, async () => {
        const [owner, wallet] = accounts
        await expect(createSale({owner, wallet, walletTestValue: wei(0)})).to.be.rejectedWith(evm.Revert)
        await expect(createSale({owner, wallet, walletTestValue: wei(1)})).to.be.fulfilled
      })

      it(`should require a non-zero rate`, async () => {
        const [owner, wallet] = accounts
        await expect(createSale({owner, wallet, rate: 0})).to.be.rejectedWith(evm.Revert)
        await expect(createSale({owner, wallet, rate: 1})).to.be.fulfilled
      })

      it(`should require a non-zero soft cap`, async () => {
        const [owner, wallet] = accounts
        await expect(createSale({owner, wallet, softCap: wei(0)})).to.be.rejectedWith(evm.Revert)
        await expect(createSale({owner, wallet, softCap: wei(1)})).to.be.fulfilled
      })

      it(`should require hard cap to be higher or equal to soft cap`, async () => {
        const [owner, wallet] = accounts
        await expect(createSale({owner, wallet, softCap: wei(1), hardCap: wei(0)})).to.be.rejectedWith(evm.Revert)
        await expect(createSale({owner, wallet, softCap: wei(1), hardCap: wei(1)})).to.be.fulfilled
        await expect(createSale({owner, wallet, softCap: wei(1), hardCap: wei(2)})).to.be.fulfilled
      })

      it(`should refuse 0x0 as wallet`, async () => {
        const [owner, wallet] = accounts
        await expect(createSale({owner, wallet: evm.ZERO})).to.be.rejectedWith(evm.Revert)
        await expect(createSale({owner, wallet})).to.be.fulfilled
      })

      it(`should refuse a start time earlier than current time`, async () => {
        const [owner, wallet] = accounts
        const now = await evm.latestTime()
        await expect(createSale({owner, wallet, startTime: now - duration.minutes(1)})).to.be.rejectedWith(evm.Revert)
        await expect(createSale({owner, wallet, startTime: now + duration.minutes(1)})).to.be.fulfilled
      })

      it(`should refuse an end time earlier than start time`, async () => {
        const [owner, wallet] = accounts
        const now = await evm.latestTime()
        await expect(createSale({owner, wallet, startTime: now + duration.minutes(10), endTime: now + duration.minutes(5)})).to.be.rejectedWith(evm.Revert)
        await expect(createSale({owner, wallet, startTime: now + duration.minutes(10), endTime: now + duration.minutes(15)})).to.be.fulfilled
      })
    })

    describe('ownership', () => {
      it(`should not be transferrable by non-owner`, async () => {
        const [owner, nonOwner, wallet] = accounts
        const sale = await createSale({owner, wallet})
        await expect(sale.transferOwnership(nonOwner, {from: nonOwner})).to.be.rejectedWith(evm.Revert)
      })

      it(`should be transferrable by owner`, async () => {
        const [owner, nonOwner, wallet] = accounts
        const sale = await createSale({owner, wallet})
        await sale.transferOwnership(nonOwner, {from: owner})
        await expect(sale.owner.call()).to.eventually.equal(nonOwner)
      })

      it(`should not allow 0x0 as owner`, async () => {
        const [owner, wallet] = accounts
        const sale = await createSale({owner, wallet})
        await expect(sale.transferOwnership(evm.ZERO, {from: owner})).to.be.rejectedWith(evm.Revert)
      })

      it(`should fire OwnershipTransferred event on ownership change`, async () => {
        const [owner, nonOwner, wallet] = accounts
        const sale = await createSale({owner, wallet})
        const {logs} = await expect(sale.transferOwnership(nonOwner, {from: owner})).to.be.fulfilled
        expect(logs.find(e => e.event === 'OwnershipTransferred')).to.exist
      })
    })

    describe('wallet', () => {
      it(`should not be changeable by non-owner`, async () => {
        const [owner, nonOwner, wallet, otherWallet] = accounts
        const sale = await createSale({owner, wallet})
        await expect(sale.changeWallet(otherWallet, {value: wei(1), from: nonOwner})).to.be.rejectedWith(evm.Revert)
        await expect(sale.changeWallet(otherWallet, {value: wei(1), from: owner})).to.be.fulfilled
      })

      it(`should be changeable by owner`, async () => {
        const [owner, wallet, otherWallet] = accounts
        const sale = await createSale({owner, wallet})
        await expect(sale.wallet.call()).to.eventually.equal(wallet)
        await expect(sale.changeWallet(otherWallet, {value: wei(1), from: owner})).to.be.fulfilled
        await expect(sale.wallet.call()).to.eventually.equal(otherWallet)
      })

      it(`should not allow 0x0 as wallet`, async () => {
        const [owner, wallet, otherWallet] = accounts
        const sale = await createSale({owner, wallet})
        await expect(sale.changeWallet(evm.ZERO, {value: wei(1), from: owner})).to.be.rejectedWith(evm.Revert)
        await expect(sale.changeWallet(otherWallet, {value: wei(1), from: owner})).to.be.fulfilled
      })

      it(`should require value to be sent when changing wallet`, async () => {
        const [owner, wallet, otherWallet] = accounts
        const sale = await createSale({owner, wallet})
        await expect(sale.changeWallet(otherWallet, {value: wei(0), from: owner})).to.be.rejectedWith(evm.Revert)
        await expect(sale.changeWallet(otherWallet, {value: wei(1), from: owner})).to.be.fulfilled
      })

      it(`should transfer sent value to the new wallet`, async () => {
        const [owner, wallet, otherWallet] = accounts
        const sale = await createSale({owner, wallet})
        const walletBalanceBefore = await evm.getBalance(otherWallet)
        await expect(sale.changeWallet(otherWallet, {value: wei(123), from: owner})).to.be.fulfilled
        const walletBalanceAfter = await evm.getBalance(otherWallet)
        expect(walletBalanceAfter.minus(walletBalanceBefore)).to.bignumber.equal(wei(123))
      })

      it(`should fire WalletChanged event on wallet change`, async () => {
        const [owner, wallet, otherWallet] = accounts
        const sale = await createSale({owner, wallet})
        const {logs} = await expect(sale.changeWallet(otherWallet, {value: wei(1), from: owner})).to.be.fulfilled
        expect(logs.find(e => e.event === 'WalletChanged')).to.exist
      })
    })

    describe('sale token', () => {
      it(`should be owned by the sale contract`, async () => {
        const [owner, wallet] = accounts
        const sale = await createSale({owner, wallet})
        const startTime = await sale.startTime.call()
        await evm.increaseTimeTo(startTime.toNumber())
        const token = TelcoinSaleToken.at(await sale.saleToken.call())
        await expect(token.owner.call()).to.eventually.equal(sale.address)
      })
    })

    describe('bonus token', () => {
      it(`should be owned by the sale contract`, async () => {
        const [owner, wallet] = accounts
        const sale = await createSale({owner, wallet})
        const startTime = await sale.startTime.call()
        await evm.increaseTimeTo(startTime.toNumber())
        const token = TelcoinSaleToken.at(await sale.bonusToken.call())
        await expect(token.owner.call()).to.eventually.equal(sale.address)
      })
    })

    describe('pausing', () => {
      describe(`by non-owner`, () => {
        it(`should not be possible to pause`, async () => {
          const [owner, nonOwner, wallet] = accounts
          const sale = await createSale({owner, wallet})
          await expect(sale.pause({from: nonOwner})).to.be.rejectedWith(evm.Revert)
        })

        it(`should not be possible to unpause`, async () => {
          const [owner, nonOwner, wallet] = accounts
          const sale = await createSale({owner, wallet})
          await expect(sale.pause({from: owner})).to.be.fulfilled
          await expect(sale.unpause({from: nonOwner})).to.be.rejectedWith(evm.Revert)
        })
      })

      describe(`by owner`, () => {
        it(`should be unpaused by default`, async () => {
          const [owner, wallet] = accounts
          const sale = await createSale({owner, wallet})
          await expect(sale.paused.call()).to.eventually.equal(false)
        })

        it(`should set paused flag`, async () => {
          const [owner, wallet] = accounts
          const sale = await createSale({owner, wallet})
          await expect(sale.pause({from: owner})).to.be.fulfilled
          await expect(sale.paused.call()).to.eventually.equal(true)
        })

        it(`should not be possible if already paused`, async () => {
          const [owner, wallet] = accounts
          const sale = await createSale({owner, wallet})
          await expect(sale.pause({from: owner})).to.be.fulfilled
          await expect(sale.pause()).to.be.rejectedWith(evm.Revert)
        })

        it(`should be unpausable`, async () => {
          const [owner, wallet] = accounts
          const sale = await createSale({owner, wallet})
          await expect(sale.pause({from: owner})).to.be.fulfilled
          await expect(sale.unpause({from: owner})).to.be.fulfilled
          await expect(sale.paused.call()).to.eventually.equal(false)
        })

        it(`should not be unpausable when not paused`, async () => {
          const [owner, wallet] = accounts
          const sale = await createSale({owner, wallet})
          await expect(sale.unpause({from: owner})).to.be.rejectedWith(evm.Revert)
        })

        it(`should fire Pause event when paused`, async () => {
          const [owner, wallet] = accounts
          const sale = await createSale({owner, wallet})
          const {logs} = await expect(sale.pause({from: owner})).to.be.fulfilled
          expect(logs.find(e => e.event === 'Pause')).to.exist
        })

        it(`should fire Unpause event when unpaused`, async () => {
          const [owner, wallet] = accounts
          const sale = await createSale({owner, wallet})
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
          const sale = await createSale({owner, wallet})
          await expect(sale.whitelist(investor, wei(100), wei(100), 0, {from: nonOwner})).to.be.rejectedWith(evm.Revert)
          await expect(sale.whitelist(investor, wei(100), wei(100), 0, {from: owner})).to.be.fulfilled
        })
      })

      describe(`by owner`, () => {
        it(`should default to 0`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createSale({owner, wallet})
          await expect(sale.whitelistedMax.call(investor)).to.eventually.bignumber.equal(wei(0))
        })

        it(`should allow whitelisting`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createSale({owner, wallet})
          await expect(sale.whitelist(investor, wei(500), wei(800), 10, {from: owner})).to.be.fulfilled
          await expect(sale.whitelistedMin.call(investor)).to.eventually.bignumber.equal(wei(500))
          await expect(sale.whitelistedMax.call(investor)).to.eventually.bignumber.equal(wei(800))
          await expect(sale.bonusRates.call(investor)).to.eventually.bignumber.equal(wei(10))
        })

        it(`should allow whitelisting multiple`, async () => {
          const [owner, wallet, investor1, investor2, investor3] = accounts
          const sale = await createSale({owner, wallet})
          await expect(sale.whitelistMany([investor1, investor2, investor3], wei(100), wei(200), 70, {from: owner})).to.be.fulfilled
          await expect(sale.whitelistedMin.call(investor1)).to.eventually.bignumber.equal(wei(100))
          await expect(sale.whitelistedMin.call(investor2)).to.eventually.bignumber.equal(wei(100))
          await expect(sale.whitelistedMin.call(investor3)).to.eventually.bignumber.equal(wei(100))
          await expect(sale.whitelistedMax.call(investor1)).to.eventually.bignumber.equal(wei(200))
          await expect(sale.whitelistedMax.call(investor2)).to.eventually.bignumber.equal(wei(200))
          await expect(sale.whitelistedMax.call(investor3)).to.eventually.bignumber.equal(wei(200))
          await expect(sale.bonusRates.call(investor1)).to.eventually.bignumber.equal(70)
          await expect(sale.bonusRates.call(investor2)).to.eventually.bignumber.equal(70)
          await expect(sale.bonusRates.call(investor3)).to.eventually.bignumber.equal(70)
        })

        it(`should not allow whitelisting 0x0`, async () => {
          const [owner, wallet] = accounts
          const sale = await createSale({owner, wallet})
          await expect(sale.whitelist(evm.ZERO, wei(100), wei(100), 0, {from: owner})).to.be.rejectedWith(evm.Revert)
        })

        it(`should allow max whitelisted amount to be increased`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createSale({owner, wallet})
          await expect(sale.whitelist(investor, wei(10), wei(10), 0, {from: owner})).to.be.fulfilled
          await expect(sale.whitelist(investor, wei(200), wei(200), 0, {from: owner})).to.be.fulfilled
          await expect(sale.whitelistedMax.call(investor)).to.eventually.bignumber.equal(wei(200))
        })

        it(`should allow whitelisted amount to be decreased`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createSale({owner, wallet})
          await expect(sale.whitelist(investor, wei(100), wei(100), 0, {from: owner})).to.be.fulfilled
          await expect(sale.whitelist(investor, wei(0), wei(0), 0, {from: owner})).to.be.fulfilled
          await expect(sale.whitelistedMax.call(investor)).to.eventually.bignumber.equal(wei(0))
        })

        it(`should set bonus rate`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createSale({owner, wallet})
          await expect(sale.whitelist(investor, wei(100), wei(100), 0, {from: owner})).to.be.fulfilled
          await expect(sale.bonusRates.call(investor)).to.eventually.bignumber.equal(0)
          await expect(sale.whitelist(investor, wei(100), wei(100), 300, {from: owner})).to.be.fulfilled
          await expect(sale.bonusRates.call(investor)).to.eventually.bignumber.equal(300)
        })

        it(`should not allow bonus rate over 40%`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createSale({owner, wallet})
          await expect(sale.whitelist(investor, wei(100), wei(100), 401, {from: owner})).to.be.rejectedWith(evm.Revert)
          await expect(sale.whitelist(investor, wei(100), wei(100), 400, {from: owner})).to.be.fulfilled
        })

        it(`should fire Whitelisted event`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createSale({owner, wallet})
          const {logs} = await expect(sale.whitelist(investor, wei(100), wei(100), 0, {from: owner})).to.be.fulfilled
          expect(logs.find(e => e.event === 'Whitelisted')).to.exist
        })
      })
    })

    describe('registering purchases in alt currencies', () => {
      const BTC_TXID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

      describe(`by non-owner`, () => {
        it(`should not be possible`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createSale({owner, wallet})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await sale.whitelist(investor, ether(4), ether(4), 0, {from: owner})
          await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, ether(4), {from: investor})).to.be.rejectedWith(evm.Revert)
          await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, ether(4), {from: owner})).to.be.fulfilled
        })
      })

      describe(`by owner`, () => {
        describe(`before sale starts`, () => {
          it(`should not be possible`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet})
            const startTime = await sale.startTime.call()
            await expect(sale.whitelist(investor, ether(10), ether(10), 0, {from: owner})).to.be.fulfilled
            await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, ether(4), {from: owner})).to.be.rejectedWith(evm.Revert)
            await evm.increaseTimeTo(startTime.toNumber())
            await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, ether(4), {from: owner})).to.be.fulfilled
          })
        })

        describe(`after sale ends`, () => {
          it(`should not be possible`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await expect(sale.whitelist(investor, ether(10), ether(10), 0, {from: owner})).to.be.fulfilled
            await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(1), {from: owner})).to.be.fulfilled
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(1), {from: owner})).to.be.rejectedWith(evm.Revert)
          })
        })

        describe(`when sale is paused`, () => {
          it(`should not be possible`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await expect(sale.whitelist(investor, ether(10), ether(10), 0, {from: owner})).to.be.fulfilled
            await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(1), {from: owner})).to.be.fulfilled
            await expect(sale.pause()).to.be.fulfilled
            await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(1), {from: owner})).to.be.rejectedWith(evm.Revert)
          })
        })

        describe(`when sale has finished`, () => {
          it(`should not be possible`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet, softCap: wei(2)})
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            await expect(sale.whitelist(investor, ether(10), ether(10), 0, {from: owner})).to.be.fulfilled
            await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(2), {from: owner})).to.be.rejectedWith(evm.Revert)
            await expect(sale.finish()).to.be.fulfilled
            await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(1), {from: owner})).to.be.rejectedWith(evm.Revert)
          })
        })

        describe(`during sale`, () => {
          describe(`validation`, () => {
            it(`should not accept 0x0 as beneficiary`, async () => {
              const [owner, wallet] = accounts
              const sale = await createSale({owner, wallet})
              const startTime = await sale.startTime.call()
              await evm.increaseTimeTo(startTime.toNumber())
              await expect(sale.registerAltPurchase(evm.ZERO, 'BTC', BTC_TXID, wei(1), {from: owner})).to.be.rejectedWith(evm.Revert)
            })

            it(`should require a non-zero wei amount`, async () => {
              const [owner, wallet, investor] = accounts
              const sale = await createSale({owner, wallet})
              const startTime = await sale.startTime.call()
              await evm.increaseTimeTo(startTime.toNumber())
              await sale.whitelist(investor, ether(10), ether(10), 0, {from: owner})
              await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(0), {from: owner})).to.be.rejectedWith(evm.Revert)
              await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(1), {from: owner})).to.be.fulfilled
            })
          })

          describe(`for a non-whitelisted beneficiary`, () => {
            it(`should not be possible`, async () => {
              const [owner, wallet, investor] = accounts
              const sale = await createSale({owner, wallet})
              const startTime = await sale.startTime.call()
              await evm.increaseTimeTo(startTime.toNumber())
              await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(1), {from: owner})).to.be.rejectedWith(evm.Revert)
              await sale.whitelist(investor, ether(10), ether(10), 0, {from: owner})
              await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(1), {from: owner})).to.be.fulfilled
            })
          })

          describe(`for a whitelisted beneficiary`, () => {
            it(`should increase total sale token supply`, async () => {
              const [owner, wallet, investor] = accounts
              const sale = await createSale({owner, wallet, rate: 1})
              const startTime = await sale.startTime.call()
              await evm.increaseTimeTo(startTime.toNumber())
              const token = TelcoinSaleToken.at(await sale.saleToken.call())
              await expect(token.totalSupply.call()).to.eventually.be.bignumber.equal(0)
              await sale.whitelist(investor, ether(10), ether(10), 0, {from: owner})
              await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(1), {from: owner})).to.be.fulfilled
              await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(1), {from: owner})).to.be.fulfilled
              await expect(token.totalSupply.call()).to.eventually.be.bignumber.equal(wei(2))
            })

            it(`should increase weiRaised`, async () => {
              const [owner, wallet, investor] = accounts
              const sale = await createSale({owner, wallet})
              const startTime = await sale.startTime.call()
              await evm.increaseTimeTo(startTime.toNumber())
              await expect(sale.weiRaised.call()).to.eventually.be.bignumber.equal(0)
              await sale.whitelist(investor, ether(4), ether(4), 0, {from: owner})
              await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, ether(4), {from: owner})).to.be.fulfilled
              await expect(sale.weiRaised.call()).to.eventually.be.bignumber.equal(ether(4))
            })

            it(`should assign sale tokens to the investor`, async () => {
              const [owner, wallet, investor] = accounts
              const sale = await createSale({owner, wallet, rate: 1})
              const startTime = await sale.startTime.call()
              await evm.increaseTimeTo(startTime.toNumber())
              const token = TelcoinSaleToken.at(await sale.saleToken.call())
              await expect(token.balanceOf.call(investor)).to.eventually.bignumber.equal(0)
              await sale.whitelist(investor, ether(4), ether(4), 0, {from: owner})
              await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(4), {from: owner})).to.be.fulfilled
              await expect(token.balanceOf.call(investor)).to.eventually.bignumber.equal(wei(4))
            })

            it(`should assign appropriate bonus tokens to the investor`, async () => {
              const [owner, wallet, investor] = accounts
              const sale = await createSale({owner, wallet, rate: 1})
              const startTime = await sale.startTime.call()
              await evm.increaseTimeTo(startTime.toNumber())
              const saleToken = TelcoinSaleToken.at(await sale.saleToken.call())
              const bonusToken = TelcoinSaleToken.at(await sale.bonusToken.call())
              await expect(saleToken.balanceOf.call(investor)).to.eventually.bignumber.equal(0)
              await expect(bonusToken.balanceOf.call(investor)).to.eventually.bignumber.equal(0)
              await sale.whitelist(investor, wei(3000), ether(5000), 300, {from: owner})
              await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(1), {from: owner})).to.be.fulfilled
              await expect(saleToken.balanceOf.call(investor)).to.eventually.bignumber.equal(wei(1))
              await expect(bonusToken.balanceOf.call(investor)).to.eventually.bignumber.equal(wei(0))
              await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(100), {from: owner})).to.be.fulfilled
              await expect(saleToken.balanceOf.call(investor)).to.eventually.bignumber.equal(wei(101))
              await expect(bonusToken.balanceOf.call(investor)).to.eventually.bignumber.equal(wei(0))
              await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(4000), {from: owner})).to.be.fulfilled
              await expect(saleToken.balanceOf.call(investor)).to.eventually.bignumber.equal(wei(4101))
              await expect(bonusToken.balanceOf.call(investor)).to.eventually.bignumber.equal(wei(1230))
              await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(200), {from: owner})).to.be.fulfilled
              await expect(saleToken.balanceOf.call(investor)).to.eventually.bignumber.equal(wei(4301))
              await expect(bonusToken.balanceOf.call(investor)).to.eventually.bignumber.equal(wei(1290))
            })

            it(`should not increase investor's deposited amount`, async () => {
              const [owner, wallet, investor] = accounts
              const sale = await createSale({owner, wallet})
              const startTime = await sale.startTime.call()
              await evm.increaseTimeTo(startTime.toNumber())
              await expect(sale.deposited.call(investor)).to.eventually.bignumber.equal(0)
              await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
              await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(16), {from: owner})).to.be.fulfilled
              await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(49), {from: owner})).to.be.fulfilled
              await expect(sale.deposited.call(investor)).to.eventually.bignumber.equal(0)
            })

            it(`should increase investor's alt deposited amount`, async () => {
              const [owner, wallet, investor] = accounts
              const sale = await createSale({owner, wallet})
              const startTime = await sale.startTime.call()
              await evm.increaseTimeTo(startTime.toNumber())
              await expect(sale.altDeposited.call(investor)).to.eventually.bignumber.equal(0)
              await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
              await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(16), {from: owner})).to.be.fulfilled
              await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(49), {from: owner})).to.be.fulfilled
              await expect(sale.altDeposited.call(investor)).to.eventually.bignumber.equal(wei(65))
            })

            it(`should increase investor's total deposited amount`, async () => {
              const [owner, wallet, investor] = accounts
              const sale = await createSale({owner, wallet})
              const startTime = await sale.startTime.call()
              await evm.increaseTimeTo(startTime.toNumber())
              await expect(sale.totalDeposited.call(investor)).to.eventually.bignumber.equal(0)
              await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
              await expect(sale.buyTokens(investor, {value: wei(16), from: investor})).to.be.fulfilled
              await expect(sale.sendTransaction({value: wei(1), from: investor})).to.be.fulfilled
              await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(49), {from: owner})).to.be.fulfilled
              await expect(sale.totalDeposited.call(investor)).to.eventually.bignumber.equal(wei(66))
            })

            it(`should not be allowed if over whitelisted amount`, async () => {
              const [owner, wallet, investor] = accounts
              const sale = await createSale({owner, wallet})
              const startTime = await sale.startTime.call()
              await evm.increaseTimeTo(startTime.toNumber())
              await sale.whitelist(investor, wei(1), wei(1), 0, {from: owner})
              await expect(sale.sendTransaction({value: wei(2), from: investor})).to.be.rejectedWith(evm.Revert)
              await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(1), {from: owner})).to.be.fulfilled
              await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(1), {from: owner})).to.be.rejectedWith(evm.Revert)
            })

            it(`should bypass hard cap due to unpredictable exchange rate`, async () => {
              const [owner, wallet, investor] = accounts
              const sale = await createSale({owner, wallet, softCap: wei(100), hardCap: wei(200)})
              const startTime = await sale.startTime.call()
              await evm.increaseTimeTo(startTime.toNumber())
              await sale.whitelist(investor, ether(4), ether(4), 0, {from: owner})
              await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(300), {from: owner})).to.be.fulfilled
            })

            it(`should add the investor to the list of investors`, async () => {
              const [owner, wallet, investor] = accounts
              const sale = await createSale({owner, wallet})
              const startTime = await sale.startTime.call()
              await evm.increaseTimeTo(startTime.toNumber())
              await expect(sale.investors.call(0)).to.be.rejectedWith(evm.Throw)
              await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
              await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(25), {from: owner})).to.be.fulfilled
              await expect(sale.investors.call(0)).to.eventually.equal(investor)
            })

            it(`should fire TokenAltPurchase event`, async () => {
              const [owner, wallet, investor] = accounts
              const sale = await createSale({owner, wallet})
              const startTime = await sale.startTime.call()
              await evm.increaseTimeTo(startTime.toNumber())
              await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
              const {logs: logs1} = await expect(sale.registerAltPurchase(investor, 'BTC', BTC_TXID, wei(26), {from: owner})).to.be.fulfilled
              expect(logs1.find(e => e.event === 'TokenAltPurchase')).to.exist
            })
          })
        })
      })
    })

    describe('buying tokens', () => {
      describe(`before sale starts`, () => {
        it(`should not be possible`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createSale({owner, wallet})
          const startTime = await sale.startTime.call()
          await expect(sale.whitelist(investor, ether(10), ether(10), 0, {from: owner})).to.be.fulfilled
          await expect(sale.sendTransaction({value: ether(1), from: investor})).to.be.rejectedWith(evm.Revert)
          await expect(sale.buyTokens(investor, {value: ether(1), from: investor})).to.be.rejectedWith(evm.Revert)
          await evm.increaseTimeTo(startTime.toNumber())
          await expect(sale.buyTokens(investor, {value: ether(1), from: investor})).to.be.fulfilled
        })
      })

      describe(`after sale ends`, () => {
        it(`should not be possible`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createSale({owner, wallet})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await expect(sale.whitelist(investor, ether(10), ether(10), 0, {from: owner})).to.be.fulfilled
          await expect(sale.sendTransaction({value: wei(1), from: investor})).to.be.fulfilled
          const endTime = await sale.endTime.call()
          await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
          await expect(sale.sendTransaction({value: wei(1), from: investor})).to.be.rejectedWith(evm.Revert)
          await expect(sale.buyTokens(investor, {value: wei(1), from: investor})).to.be.rejectedWith(evm.Revert)
        })
      })

      describe(`when sale is paused`, () => {
        it(`should not be possible`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createSale({owner, wallet})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await expect(sale.whitelist(investor, ether(10), ether(10), 0, {from: owner})).to.be.fulfilled
          await expect(sale.sendTransaction({value: wei(1), from: investor})).to.be.fulfilled
          await expect(sale.pause()).to.be.fulfilled
          await expect(sale.sendTransaction({value: wei(1), from: investor})).to.be.rejectedWith(evm.Revert)
          await expect(sale.buyTokens(investor, {value: wei(1), from: investor})).to.be.rejectedWith(evm.Revert)
        })
      })

      describe(`when sale has finished`, () => {
        it(`should not be possible`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createSale({owner, wallet, softCap: wei(2)})
          const endTime = await sale.endTime.call()
          await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
          await expect(sale.whitelist(investor, ether(10), ether(10), 0, {from: owner})).to.be.fulfilled
          await expect(sale.sendTransaction({value: wei(2), from: investor})).to.be.rejectedWith(evm.Revert)
          await expect(sale.finish()).to.be.fulfilled
          await expect(sale.sendTransaction({value: wei(1), from: investor})).to.be.rejectedWith(evm.Revert)
          await expect(sale.buyTokens(investor, {value: wei(1), from: investor})).to.be.rejectedWith(evm.Revert)
        })
      })

      describe(`during sale`, () => {
        describe(`validation`, () => {
          it(`should not accept 0x0 as beneficiary`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await expect(sale.buyTokens(evm.ZERO, {value: wei(1), from: investor})).to.be.rejectedWith(evm.Revert)
          })

          it(`should require a non-zero value`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.whitelist(investor, ether(10), ether(10), 0, {from: owner})
            await expect(sale.buyTokens(investor, {value: wei(0), from: investor})).to.be.rejectedWith(evm.Revert)
          })
        })

        describe(`for a non-whitelisted beneficiary`, () => {
          it(`should not be possible`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await expect(sale.sendTransaction({value: ether(1), from: investor})).to.be.rejectedWith(evm.Revert)
            await expect(sale.buyTokens(investor, {value: ether(1), from: investor})).to.be.rejectedWith(evm.Revert)
          })
        })

        describe(`for a whitelisted beneficiary`, () => {
          it(`should increase total sale token supply`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet, rate: 1})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            const token = TelcoinSaleToken.at(await sale.saleToken.call())
            await expect(token.totalSupply.call()).to.eventually.be.bignumber.equal(0)
            await sale.whitelist(investor, ether(10), ether(10), 0, {from: owner})
            await sale.sendTransaction({value: ether(1), from: investor})
            await sale.buyTokens(investor, {value: ether(1), from: investor})
            await expect(token.totalSupply.call()).to.eventually.be.bignumber.equal(ether(2))
          })

          it(`should increase weiRaised`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await expect(sale.weiRaised.call()).to.eventually.be.bignumber.equal(0)
            await sale.whitelist(investor, wei(4), wei(4), 0, {from: owner})
            await sale.sendTransaction({value: wei(1), from: investor})
            await sale.buyTokens(investor, {value: wei(3), from: investor})
            await expect(sale.weiRaised.call()).to.eventually.be.bignumber.equal(wei(4))
          })

          it(`should assign sale tokens to the investor`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet, rate: 1})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            const token = TelcoinSaleToken.at(await sale.saleToken.call())
            await expect(token.balanceOf.call(investor)).to.eventually.bignumber.equal(0)
            await sale.whitelist(investor, ether(4), ether(4), 0, {from: owner})
            await sale.sendTransaction({value: wei(1), from: investor})
            await sale.buyTokens(investor, {value: wei(3), from: investor})
            await expect(token.balanceOf.call(investor)).to.eventually.bignumber.equal(wei(4))
          })

          it(`should assign appropriate bonus tokens to the investor`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet, rate: 1})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            const saleToken = TelcoinSaleToken.at(await sale.saleToken.call())
            const bonusToken = TelcoinSaleToken.at(await sale.bonusToken.call())
            await expect(saleToken.balanceOf.call(investor)).to.eventually.bignumber.equal(0)
            await expect(bonusToken.balanceOf.call(investor)).to.eventually.bignumber.equal(0)
            await sale.whitelist(investor, wei(2000), wei(4000), 300, {from: owner})
            await sale.sendTransaction({value: wei(1), from: investor})
            await expect(saleToken.balanceOf.call(investor)).to.eventually.bignumber.equal(wei(1))
            await expect(bonusToken.balanceOf.call(investor)).to.eventually.bignumber.equal(wei(0))
            await sale.sendTransaction({value: wei(500), from: investor})
            await expect(saleToken.balanceOf.call(investor)).to.eventually.bignumber.equal(wei(501))
            await expect(bonusToken.balanceOf.call(investor)).to.eventually.bignumber.equal(wei(0))
            await sale.sendTransaction({value: wei(2000), from: investor})
            await expect(saleToken.balanceOf.call(investor)).to.eventually.bignumber.equal(wei(2501))
            await expect(bonusToken.balanceOf.call(investor)).to.eventually.bignumber.equal(wei(750))
            await sale.sendTransaction({value: wei(1000), from: investor})
            await expect(saleToken.balanceOf.call(investor)).to.eventually.bignumber.equal(wei(3501))
            await expect(bonusToken.balanceOf.call(investor)).to.eventually.bignumber.equal(wei(1050))
          })

          it(`should increase investor's deposited amount`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await expect(sale.deposited.call(investor)).to.eventually.bignumber.equal(0)
            await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
            await sale.sendTransaction({value: wei(16), from: investor})
            await sale.buyTokens(investor, {value: wei(49), from: investor})
            await expect(sale.deposited.call(investor)).to.eventually.bignumber.equal(wei(65))
          })

          it(`should not be allowed if over whitelisted amount`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.whitelist(investor, wei(1), wei(1), 0, {from: owner})
            await expect(sale.sendTransaction({value: wei(2), from: investor})).to.be.rejectedWith(evm.Revert)
            await expect(sale.buyTokens(investor, {value: wei(1), from: investor})).to.be.fulfilled
            await expect(sale.buyTokens(investor, {value: wei(1), from: investor})).to.be.rejectedWith(evm.Revert)
          })

          it(`should not be allowed if total over hard cap`, async () => {
            const [owner, wallet, investor1, investor2] = accounts
            const sale = await createSale({owner, wallet, softCap: wei(100), hardCap: wei(1000)})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.whitelist(investor1, wei(800), wei(800), 0, {from: owner})
            await sale.whitelist(investor2, wei(800), wei(800), 0, {from: owner})
            await expect(sale.sendTransaction({value: wei(800), from: investor1})).to.be.fulfilled
            await expect(sale.sendTransaction({value: wei(800), from: investor2})).to.be.rejectedWith(evm.Revert)
            await expect(sale.buyTokens(investor2, {value: wei(800), from: investor2})).to.be.rejectedWith(evm.Revert)
            await expect(sale.sendTransaction({value: wei(100), from: investor2})).to.be.fulfilled
            await expect(sale.sendTransaction({value: wei(200), from: investor2})).to.be.rejectedWith(evm.Revert)
            await expect(sale.buyTokens(investor2, {value: wei(200), from: investor2})).to.be.rejectedWith(evm.Revert)
            await expect(sale.buyTokens(investor2, {value: wei(100), from: investor2})).to.be.fulfilled
            await expect(sale.sendTransaction({value: wei(1), from: investor2})).to.be.rejectedWith(evm.Revert)
            await expect(sale.buyTokens(investor2, {value: wei(1), from: investor2})).to.be.rejectedWith(evm.Revert)
          })

          it(`should add the investor to the list of investors`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await expect(sale.investors.call(0)).to.be.rejectedWith(evm.Throw)
            await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
            await sale.sendTransaction({value: wei(16), from: investor})
            await sale.buyTokens(investor, {value: wei(49), from: investor})
            await expect(sale.investors.call(0)).to.eventually.equal(investor)
          })

          it(`should fire TokenPurchase event`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
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
          const sale = await createSale({owner, wallet, softCap: wei(333)})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
          await expect(sale.sendTransaction({value: wei(333), from: investor})).to.be.fulfilled
          await expect(sale.withdraw({from: nonOwner})).to.be.rejectedWith(evm.Revert)
        })
      })

      describe(`by owner`, () => {
        describe(`when soft cap has not been reached`, () => {
          it(`should not be possible, unless 14 days have been passed since contract finished (as a failsafe)`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet, softCap: wei(333)})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
            await expect(sale.sendTransaction({value: wei(332), from: investor})).to.be.fulfilled
            await expect(sale.withdraw({from: owner})).to.be.rejectedWith(evm.Revert)
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            await expect(sale.finish({from: owner})).to.be.fulfilled
            const finishedAt = await sale.finishedAt.call()
            await expect(sale.withdraw({from: owner})).to.be.rejectedWith(evm.Revert)
            await evm.increaseTimeTo(finishedAt.toNumber() + duration.days(10))
            await expect(sale.withdraw({from: owner})).to.be.rejectedWith(evm.Revert)
            await evm.increaseTimeTo(finishedAt.toNumber() + duration.days(14) + duration.hours(1))
            await expect(sale.withdraw({from: owner})).to.be.fulfilled
          })
        })

        describe(`when soft cap has been reached`, () => {
          it(`should transfer current balance to the wallet`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet, softCap: wei(333)})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
            await expect(sale.sendTransaction({value: wei(333), from: investor})).to.be.fulfilled
            const walletBalanceBefore = await evm.getBalance(wallet)
            await expect(sale.withdraw({from: owner})).to.be.fulfilled
            const walletBalanceAfter = await evm.getBalance(wallet)
            expect(walletBalanceAfter.minus(walletBalanceBefore)).to.bignumber.equal(wei(333))
          })

          it(`should should not change weiRaised`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet, softCap: wei(333)})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
            await expect(sale.sendTransaction({value: wei(333), from: investor})).to.be.fulfilled
            const weiRaisedBefore = await expect(sale.weiRaised.call()).to.be.fulfilled
            await expect(sale.withdraw({from: owner})).to.be.fulfilled
            const weiRaisedAfter = await expect(sale.weiRaised.call()).to.be.fulfilled
            expect(weiRaisedAfter.minus(weiRaisedBefore)).to.bignumber.equal(0)
          })

          it(`should fire Withdrawal event if any balance left`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet, softCap: wei(333)})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
            await expect(sale.sendTransaction({value: wei(333), from: investor})).to.be.fulfilled
            const {logs} = await expect(sale.withdraw({from: owner})).to.be.fulfilled
            expect(logs.find(e => e.event === 'Withdrawal')).to.exist
          })

          it(`should not fire Withdrawal event if no balance left`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet, softCap: wei(333)})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
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
          const sale = await createSale({owner, wallet})
          await expect(sale.extendTime(duration.days(7), {from: nonOwner})).to.be.rejectedWith(evm.Revert)
          await expect(sale.extendTime(duration.days(7), {from: owner})).to.be.fulfilled
        })
      })

      describe(`by owner`, () => {
        it(`should allow purchases until extension is over`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createSale({owner, wallet})
          await expect(sale.extendTime(duration.days(7), {from: owner})).to.be.fulfilled
          const endTime = await sale.endTime.call()
          await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
          await expect(sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})).to.be.fulfilled
          await expect(sale.buyTokens(investor, {value: wei(49), from: investor})).to.be.fulfilled
          await evm.increaseTimeTo(endTime.toNumber() + duration.days(8))
          await expect(sale.sendTransaction({value: wei(16), from: investor})).to.be.rejectedWith(evm.Revert)
          await expect(sale.buyTokens(investor, {value: wei(49), from: investor})).to.be.rejectedWith(evm.Revert)
        })

        it(`should not be possible beyond 7 days`, async () => {
          const [owner, wallet] = accounts
          const sale = await createSale({owner, wallet})
          await expect(sale.extendTime(duration.days(7), {from: owner})).to.be.fulfilled
          await expect(sale.extendTime(duration.days(1), {from: owner})).to.be.rejectedWith(evm.Revert)
        })

        it(`should not be possible after sale has ended`, async () => {
          const [owner, wallet] = accounts
          const sale = await createSale({owner, wallet})
          const endTime = await sale.endTime.call()
          await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
          await expect(sale.extendTime(duration.days(1), {from: owner})).to.be.rejectedWith(evm.Revert)
        })

        it(`should not be possible after sale has finished`, async () => {
          const [owner, wallet] = accounts
          const sale = await createSale({owner, wallet})
          const endTime = await sale.endTime.call()
          await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
          await expect(sale.finish({from: owner})).to.be.fulfilled
          await expect(sale.extendTime(duration.days(1), {from: owner})).to.be.rejectedWith(evm.Revert)
        })

        it(`should not allow extending by 0`, async () => {
          const [owner, wallet] = accounts
          const sale = await createSale({owner, wallet})
          await expect(sale.extendTime(duration.seconds(0), {from: owner})).to.be.rejectedWith(evm.Revert)
          await expect(sale.extendTime(duration.seconds(1), {from: owner})).to.be.fulfilled
        })

        it(`should fire Extended event`, async () => {
          const [owner, wallet] = accounts
          const sale = await createSale({owner, wallet})
          const {logs} = await expect(sale.extendTime(duration.days(2), {from: owner})).to.be.fulfilled
          expect(logs.find(e => e.event === 'Extended')).to.exist
        })
      })
    })

    describe(`cap flex`, () => {
      describe(`by non-owner`, () => {
        it(`should not be possible`, async () => {
          const [owner, wallet, nonOwner] = accounts
          const sale = await createSale({owner, wallet})
          await expect(sale.updateCapFlex(500, {from: nonOwner})).to.be.rejectedWith(evm.Revert)
        })
      })

      describe(`by owner`, () => {
        describe(`after sale has finished`, () => {
          it(`should not be possible`, async () => {
            const [owner, wallet] = accounts
            const sale = await createSale({owner, wallet})
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            await expect(sale.finish()).to.be.fulfilled
            await expect(sale.updateCapFlex(500, {from: owner})).to.be.rejectedWith(evm.Revert)
          })
        })

        describe(`before sale has finished`, () => {
          it(`should change effective soft cap`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet, softCap: wei(100)})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await expect(sale.softCapReached.call()).to.eventually.equal(false)
            await expect(sale.whitelist(investor, wei(500), wei(500), 0, {from: owner})).to.be.fulfilled
            await expect(sale.buyTokens(investor, {value: wei(100), from: investor})).to.be.fulfilled
            await expect(sale.softCapReached.call()).to.eventually.equal(true)
            await expect(sale.updateCapFlex(1000, {from: owner})).to.be.fulfilled
            await expect(sale.softCapReached.call()).to.eventually.equal(false)
            await expect(sale.buyTokens(investor, {value: wei(100), from: investor})).to.be.fulfilled
            await expect(sale.softCapReached.call()).to.eventually.equal(true)
            await expect(sale.updateCapFlex(900, {from: owner})).to.be.fulfilled
            await expect(sale.softCapReached.call()).to.eventually.equal(true)
          })

          it(`should change effective hard cap`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet, softCap: wei(100), hardCap: wei(200)})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await expect(sale.hardCapReached.call()).to.eventually.equal(false)
            await expect(sale.whitelist(investor, wei(500), wei(500), 0, {from: owner})).to.be.fulfilled
            await expect(sale.buyTokens(investor, {value: wei(200), from: investor})).to.be.fulfilled
            await expect(sale.hardCapReached.call()).to.eventually.equal(true)
            await expect(sale.updateCapFlex(1000, {from: owner})).to.be.fulfilled
            await expect(sale.hardCapReached.call()).to.eventually.equal(false)
            await expect(sale.updateCapFlex(0, {from: owner})).to.be.fulfilled
            await expect(sale.hardCapReached.call()).to.eventually.equal(true)
          })

          it(`should fire CapFlexed event`, async () => {
            const [owner, wallet] = accounts
            const sale = await createSale({owner, wallet})
            const {logs} = await expect(sale.updateCapFlex(1000, {from: owner})).to.be.fulfilled
            expect(logs.find(e => e.event === 'CapFlexed')).to.exist
          })
        })
      })
    })

    describe(`finishing`, () => {
      describe(`by non-owner`, () => {
        it(`should not be possible`, async () => {
          const [owner, wallet, nonOwner] = accounts
          const sale = await createSale({owner, wallet})
          const endTime = await sale.endTime.call()
          await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
          await expect(sale.finish({from: nonOwner})).to.be.rejectedWith(evm.Revert)
        })
      })

      describe(`by owner`, () => {
        describe(`before hard cap has been reached`, () => {
          describe(`before sale has ended`, () => {
            it(`should not be possible`, async () => {
              const [owner, wallet] = accounts
              const sale = await createSale({owner, wallet, softCap: wei(100), hardCap: wei(200)})
              await expect(sale.finish({from: owner})).to.be.rejectedWith(evm.Revert)
            })
          })

          describe(`after sale has ended`, () => {
            describe(`when soft cap has not been reached`, () => {
              it(`should set finished flag`, async () => {
                const [owner, wallet] = accounts
                const sale = await createSale({owner, wallet, softCap: wei(100)})
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
                const sale = await createSale({owner, wallet, softCap: wei(100)})
                const startTime = await sale.startTime.call()
                await evm.increaseTimeTo(startTime.toNumber())
                const endTime = await sale.endTime.call()
                await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
                await expect(sale.refunding.call()).to.eventually.equal(false)
                await expect(sale.finish({from: owner})).to.be.fulfilled
                await expect(sale.refunding.call()).to.eventually.equal(true)
              })

              it(`should set finishedAt`, async () => {
                const [owner, wallet] = accounts
                const sale = await createSale({owner, wallet, softCap: wei(100)})
                const startTime = await sale.startTime.call()
                await evm.increaseTimeTo(startTime.toNumber())
                const endTime = await sale.endTime.call()
                await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
                await expect(sale.finishedAt.call()).to.eventually.bignumber.equal(0)
                await expect(sale.finish({from: owner})).to.be.fulfilled
                const now = await evm.latestTime()
                await expect(sale.finishedAt.call()).to.eventually.bignumber.be.at.least(endTime)
                await expect(sale.finishedAt.call()).to.eventually.bignumber.be.at.most(now)
              })

              it(`should fire Finalized event`, async () => {
                const [owner, wallet] = accounts
                const sale = await createSale({owner, wallet, softCap: wei(100)})
                const startTime = await sale.startTime.call()
                await evm.increaseTimeTo(startTime.toNumber())
                const endTime = await sale.endTime.call()
                await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
                const {logs} = await expect(sale.finish({from: owner})).to.be.fulfilled
                expect(logs.find(e => e.event === 'Finalized')).to.exist
              })

              it(`should fire Refunding event`, async () => {
                const [owner, wallet] = accounts
                const sale = await createSale({owner, wallet, softCap: wei(100)})
                const startTime = await sale.startTime.call()
                await evm.increaseTimeTo(startTime.toNumber())
                const endTime = await sale.endTime.call()
                await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
                const {logs} = await expect(sale.finish({from: owner})).to.be.fulfilled
                expect(logs.find(e => e.event === 'Refunding')).to.exist
              })

              it(`should not transfer balance to wallet`, async () => {
                const [owner, wallet] = accounts
                const sale = await createSale({owner, wallet, softCap: wei(100)})
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
                const sale = await createSale({owner, wallet, softCap: wei(100)})
                const startTime = await sale.startTime.call()
                await evm.increaseTimeTo(startTime.toNumber())
                const endTime = await sale.endTime.call()
                await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
                const balanceBefore = await evm.getBalance(sale.address)
                await expect(sale.finish({from: owner})).to.be.fulfilled
                const balanceAfter = await evm.getBalance(sale.address)
                expect(balanceAfter.minus(balanceBefore)).to.bignumber.equal(0)
              })

              it(`should finish sale token minting`, async () => {
                const [owner, wallet] = accounts
                const sale = await createSale({owner, wallet, softCap: wei(100)})
                const token = TelcoinSaleToken.at(await sale.saleToken.call())
                const startTime = await sale.startTime.call()
                await evm.increaseTimeTo(startTime.toNumber())
                const endTime = await sale.endTime.call()
                await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
                await expect(token.mintingFinished.call()).to.eventually.equal(false)
                await expect(sale.finish({from: owner})).to.be.fulfilled
                await expect(token.mintingFinished.call()).to.eventually.equal(true)
              })

              it(`should finish bonus token minting`, async () => {
                const [owner, wallet] = accounts
                const sale = await createSale({owner, wallet, softCap: wei(100)})
                const token = TelcoinSaleToken.at(await sale.bonusToken.call())
                const startTime = await sale.startTime.call()
                await evm.increaseTimeTo(startTime.toNumber())
                const endTime = await sale.endTime.call()
                await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
                await expect(token.mintingFinished.call()).to.eventually.equal(false)
                await expect(sale.finish({from: owner})).to.be.fulfilled
                await expect(token.mintingFinished.call()).to.eventually.equal(true)
              })

              it(`should not transfer ownership of sale token`, async () => {
                const [owner, wallet] = accounts
                const sale = await createSale({owner, wallet, softCap: wei(100)})
                const token = TelcoinSaleToken.at(await sale.saleToken.call())
                const startTime = await sale.startTime.call()
                await evm.increaseTimeTo(startTime.toNumber())
                const endTime = await sale.endTime.call()
                await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
                await expect(token.owner.call()).to.eventually.equal(sale.address)
                await expect(sale.finish({from: owner})).to.be.fulfilled
                await expect(token.owner.call()).to.eventually.equal(sale.address)
              })

              it(`should not transfer ownership of sale token`, async () => {
                const [owner, wallet] = accounts
                const sale = await createSale({owner, wallet, softCap: wei(100)})
                const token = TelcoinSaleToken.at(await sale.saleToken.call())
                const startTime = await sale.startTime.call()
                await evm.increaseTimeTo(startTime.toNumber())
                const endTime = await sale.endTime.call()
                await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
                await expect(token.owner.call()).to.eventually.equal(sale.address)
                await expect(sale.finish({from: owner})).to.be.fulfilled
                await expect(token.owner.call()).to.eventually.equal(sale.address)
              })

              it(`should not transfer ownership of bonus token`, async () => {
                const [owner, wallet] = accounts
                const sale = await createSale({owner, wallet, softCap: wei(100)})
                const token = TelcoinSaleToken.at(await sale.bonusToken.call())
                const startTime = await sale.startTime.call()
                await evm.increaseTimeTo(startTime.toNumber())
                const endTime = await sale.endTime.call()
                await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
                await expect(token.owner.call()).to.eventually.equal(sale.address)
                await expect(sale.finish({from: owner})).to.be.fulfilled
                await expect(token.owner.call()).to.eventually.equal(sale.address)
              })

              it(`should transfer all telcoin to wallet`, async () => {
                const [owner, wallet, investor1] = accounts
                const sale = await createSale({owner, wallet, softCap: wei(100)})
                const telcoin = Telcoin.at(await sale.telcoin.call())
                await expect(telcoin.transfer(sale.address, 1000000)).to.be.fulfilled
                const bonusToken = TelcoinSaleToken.at(await sale.bonusToken.call())
                const saleToken = TelcoinSaleToken.at(await sale.saleToken.call())
                await sale.whitelist(investor1, wei(1000), ether(1), 0, {from: owner})
                const startTime = await sale.startTime.call()
                await evm.increaseTimeTo(startTime.toNumber())
                await sale.buyTokens(investor1, {value: wei(50), from: investor1})
                const endTime = await sale.endTime.call()
                await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
                await expect(telcoin.balanceOf.call(saleToken.address)).to.eventually.bignumber.equal(0)
                await expect(telcoin.balanceOf.call(bonusToken.address)).to.eventually.bignumber.equal(0)
                await expect(telcoin.balanceOf.call(wallet)).to.eventually.bignumber.equal(0)
                await expect(sale.finish({from: owner})).to.be.fulfilled
                await expect(telcoin.balanceOf.call(saleToken.address)).to.eventually.bignumber.equal(0)
                await expect(telcoin.balanceOf.call(bonusToken.address)).to.eventually.bignumber.equal(0)
                await expect(telcoin.balanceOf.call(wallet)).to.eventually.bignumber.equal(1000000)
              })
            })

            describe(`when soft cap has been reached`, () => {
              it(`should set finished flag`, async () => {
                const [owner, wallet, investor] = accounts
                const sale = await createSale({owner, wallet, softCap: wei(100)})
                await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
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
                const sale = await createSale({owner, wallet, softCap: wei(100)})
                await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
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
                const sale = await createSale({owner, wallet, softCap: wei(100)})
                await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
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
                const sale = await createSale({owner, wallet, softCap: wei(100)})
                await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
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
                const softCap = wei(100)
                const sale = await createSale({owner, wallet, softCap})
                await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
                const startTime = await sale.startTime.call()
                await evm.increaseTimeTo(startTime.toNumber())
                await sale.buyTokens(investor, {value: softCap, from: investor})
                const endTime = await sale.endTime.call()
                await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
                const walletBalanceBefore = await evm.getBalance(wallet)
                const saleBalanceBefore = await evm.getBalance(sale.address)
                expect(saleBalanceBefore).to.bignumber.equal(softCap)
                await expect(sale.finish({from: owner})).to.be.fulfilled
                const walletBalanceAfter = await evm.getBalance(wallet)
                const saleBalanceAfter = await evm.getBalance(sale.address)
                expect(walletBalanceAfter.minus(walletBalanceBefore)).to.bignumber.equal(softCap)
                expect(saleBalanceAfter).to.bignumber.equal(0)
              })

              it(`should finish sale token minting`, async () => {
                const [owner, wallet, investor] = accounts
                const softCap = wei(100)
                const sale = await createSale({owner, wallet, softCap})
                const token = TelcoinSaleToken.at(await sale.saleToken.call())
                await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
                const startTime = await sale.startTime.call()
                await evm.increaseTimeTo(startTime.toNumber())
                await sale.buyTokens(investor, {value: softCap, from: investor})
                const endTime = await sale.endTime.call()
                await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
                await expect(token.mintingFinished.call()).to.eventually.equal(false)
                await expect(sale.finish({from: owner})).to.be.fulfilled
                await expect(token.mintingFinished.call()).to.eventually.equal(true)
              })

              it(`should finish bonus token minting`, async () => {
                const [owner, wallet, investor] = accounts
                const softCap = wei(100)
                const sale = await createSale({owner, wallet, softCap})
                const token = TelcoinSaleToken.at(await sale.bonusToken.call())
                await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
                const startTime = await sale.startTime.call()
                await evm.increaseTimeTo(startTime.toNumber())
                await sale.buyTokens(investor, {value: softCap, from: investor})
                const endTime = await sale.endTime.call()
                await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
                await expect(token.mintingFinished.call()).to.eventually.equal(false)
                await expect(sale.finish({from: owner})).to.be.fulfilled
                await expect(token.mintingFinished.call()).to.eventually.equal(true)
              })

              it(`should transfer ownership of sale token to sale owner`, async () => {
                const [owner, wallet, investor] = accounts
                const sale = await createSale({owner, wallet, softCap: wei(100)})
                const token = TelcoinSaleToken.at(await sale.saleToken.call())
                await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
                const startTime = await sale.startTime.call()
                await evm.increaseTimeTo(startTime.toNumber())
                await sale.buyTokens(investor, {value: wei(200), from: investor})
                const endTime = await sale.endTime.call()
                await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
                await expect(token.owner.call()).to.eventually.equal(sale.address)
                await expect(sale.finish({from: owner})).to.be.fulfilled
                await expect(token.owner.call()).to.eventually.equal(owner)
              })

              it(`should transfer ownership of bonus token to sale owner`, async () => {
                const [owner, wallet, investor] = accounts
                const sale = await createSale({owner, wallet, softCap: wei(100)})
                const token = TelcoinSaleToken.at(await sale.bonusToken.call())
                await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
                const startTime = await sale.startTime.call()
                await evm.increaseTimeTo(startTime.toNumber())
                await sale.buyTokens(investor, {value: wei(200), from: investor})
                const endTime = await sale.endTime.call()
                await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
                await expect(token.owner.call()).to.eventually.equal(sale.address)
                await expect(sale.finish({from: owner})).to.be.fulfilled
                await expect(token.owner.call()).to.eventually.equal(owner)
              })

              it(`should distribute proportionate amounts of telcoin to sale and bonus tokens`, async () => {
                const [owner, wallet, investor1, investor2, investor3] = accounts
                const sale = await createSale({owner, wallet, softCap: wei(100)})
                const telcoin = Telcoin.at(await sale.telcoin.call())
                await expect(telcoin.transfer(sale.address, 1000000)).to.be.fulfilled
                const bonusToken = TelcoinSaleToken.at(await sale.bonusToken.call())
                const saleToken = TelcoinSaleToken.at(await sale.saleToken.call())
                await sale.whitelist(investor1, wei(1000), ether(1), 0, {from: owner})
                await sale.whitelist(investor2, wei(2000), ether(1), 250, {from: owner})
                await sale.whitelist(investor3, wei(3000), ether(1), 350, {from: owner})
                const startTime = await sale.startTime.call()
                await evm.increaseTimeTo(startTime.toNumber())
                await sale.buyTokens(investor1, {value: wei(1000), from: investor1}) // 0 bonus
                await sale.buyTokens(investor2, {value: wei(2000), from: investor2}) // 500 bonus
                await sale.buyTokens(investor3, {value: wei(3000), from: investor3}) // 1050 bonus
                const endTime = await sale.endTime.call()
                await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
                await expect(telcoin.balanceOf.call(saleToken.address)).to.eventually.bignumber.equal(0)
                await expect(telcoin.balanceOf.call(bonusToken.address)).to.eventually.bignumber.equal(0)
                await expect(sale.finish({from: owner})).to.be.fulfilled
                await expect(telcoin.balanceOf.call(saleToken.address)).to.eventually.bignumber.equal(794701 + /* rounding */ 1)
                await expect(telcoin.balanceOf.call(bonusToken.address)).to.eventually.bignumber.equal(205298)
              })

              it(`should make sale tokens redeemable`, async () => {
                const [owner, wallet, investor1, investor2, investor3, other] = accounts
                const sale = await createSale({owner, wallet, softCap: wei(100)})
                const telcoin = Telcoin.at(await sale.telcoin.call())
                await expect(telcoin.transfer(sale.address, 1000000)).to.be.fulfilled
                const bonusToken = TelcoinSaleToken.at(await sale.bonusToken.call())
                const saleToken = TelcoinSaleToken.at(await sale.saleToken.call())
                await sale.whitelist(investor1, wei(1000), ether(1), 0, {from: owner})
                await sale.whitelist(investor2, wei(2000), ether(1), 250, {from: owner})
                await sale.whitelist(investor3, wei(3000), ether(1), 350, {from: owner})
                const startTime = await sale.startTime.call()
                await evm.increaseTimeTo(startTime.toNumber())
                await sale.buyTokens(investor1, {value: wei(1000), from: investor1}) // 0 bonus
                await sale.buyTokens(investor2, {value: wei(2000), from: investor2}) // 500 bonus
                await sale.buyTokens(investor3, {value: wei(3000), from: investor3}) // 1050 bonus
                const endTime = await sale.endTime.call()
                await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
                await expect(telcoin.balanceOf.call(saleToken.address)).to.eventually.bignumber.equal(0)
                await expect(telcoin.balanceOf.call(bonusToken.address)).to.eventually.bignumber.equal(0)
                await expect(sale.finish({from: owner})).to.be.fulfilled
                await expect(telcoin.balanceOf.call(saleToken.address)).to.eventually.bignumber.equal(794701 + /* rounding */ 1) // 1000000 * (6000 / 7550)
                await expect(telcoin.balanceOf.call(bonusToken.address)).to.eventually.bignumber.equal(205298) // 1000000 * (1550 / 7550)
                await expect(telcoin.balanceOf.call(investor1)).to.eventually.bignumber.equal(0)
                await expect(telcoin.balanceOf.call(investor2)).to.eventually.bignumber.equal(0)
                await expect(telcoin.balanceOf.call(investor3)).to.eventually.bignumber.equal(0)
                await expect(saleToken.redeem(investor1, {from: other})).to.be.fulfilled
                await expect(saleToken.redeem(investor2, {from: other})).to.be.fulfilled
                await expect(saleToken.redeem(investor3, {from: investor3})).to.be.fulfilled
                await expect(telcoin.balanceOf.call(investor1)).to.eventually.bignumber.equal(132450) // 794702 * 1000 / 6000
                await expect(telcoin.balanceOf.call(investor2)).to.eventually.bignumber.equal(264900) // 794702 * 2000 / 6000
                await expect(telcoin.balanceOf.call(investor3)).to.eventually.bignumber.equal(397351) // 794702 * 3000 / 6000
              })

              it(`should make bonus tokens redeemable`, async () => {
                const [owner, wallet, investor1, investor2, investor3, other] = accounts
                const sale = await createSale({owner, wallet, softCap: wei(100)})
                const telcoin = Telcoin.at(await sale.telcoin.call())
                await expect(telcoin.transfer(sale.address, 1000000)).to.be.fulfilled
                const bonusToken = TelcoinSaleToken.at(await sale.bonusToken.call())
                const saleToken = TelcoinSaleToken.at(await sale.saleToken.call())
                await sale.whitelist(investor1, wei(1000), ether(1), 0, {from: owner})
                await sale.whitelist(investor2, wei(2000), ether(1), 250, {from: owner})
                await sale.whitelist(investor3, wei(3000), ether(1), 350, {from: owner})
                const startTime = await sale.startTime.call()
                await evm.increaseTimeTo(startTime.toNumber())
                await sale.buyTokens(investor1, {value: wei(1000), from: investor1}) // 0 bonus
                await sale.buyTokens(investor2, {value: wei(2000), from: investor2}) // 500 bonus
                await sale.buyTokens(investor3, {value: wei(3000), from: investor3}) // 1050 bonus
                const endTime = await sale.endTime.call()
                await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
                await expect(telcoin.balanceOf.call(saleToken.address)).to.eventually.bignumber.equal(0)
                await expect(telcoin.balanceOf.call(bonusToken.address)).to.eventually.bignumber.equal(0)
                await expect(sale.finish({from: owner})).to.be.fulfilled
                await expect(telcoin.balanceOf.call(saleToken.address)).to.eventually.bignumber.equal(794701 + /* rounding */ 1)
                await expect(telcoin.balanceOf.call(bonusToken.address)).to.eventually.bignumber.equal(205298)
                await expect(telcoin.balanceOf.call(investor1)).to.eventually.bignumber.equal(0)
                await expect(telcoin.balanceOf.call(investor2)).to.eventually.bignumber.equal(0)
                await expect(telcoin.balanceOf.call(investor3)).to.eventually.bignumber.equal(0)
                await expect(bonusToken.redeem(investor1, {from: other})).to.be.fulfilled
                await expect(bonusToken.redeem(investor2, {from: other})).to.be.fulfilled
                await expect(bonusToken.redeem(investor3, {from: investor3})).to.be.fulfilled
                await expect(telcoin.balanceOf.call(investor1)).to.eventually.bignumber.equal(0)
                await expect(telcoin.balanceOf.call(investor2)).to.eventually.bignumber.equal(0)
                await expect(telcoin.balanceOf.call(investor3)).to.eventually.bignumber.equal(0)
                await evm.increaseTimeTo(endTime.toNumber() + duration.days(181))
                await expect(bonusToken.redeem(investor1, {from: other})).to.be.fulfilled
                await expect(bonusToken.redeem(investor2, {from: other})).to.be.fulfilled
                await expect(bonusToken.redeem(investor3, {from: investor3})).to.be.fulfilled
                await expect(telcoin.balanceOf.call(investor1)).to.eventually.bignumber.equal(0)
                await expect(telcoin.balanceOf.call(investor2)).to.eventually.bignumber.equal(66225)
                await expect(telcoin.balanceOf.call(investor3)).to.eventually.bignumber.equal(139072)
              })

              it(`should fire Withdrawal event if any balance left`, async () => {
                const [owner, wallet, investor] = accounts
                const softCap = wei(100)
                const sale = await createSale({owner, wallet, softCap})
                await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
                const startTime = await sale.startTime.call()
                await evm.increaseTimeTo(startTime.toNumber())
                await sale.buyTokens(investor, {value: softCap, from: investor})
                const endTime = await sale.endTime.call()
                await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
                const {logs} = await expect(sale.finish({from: owner})).to.be.fulfilled
                expect(logs.find(e => e.event === 'Withdrawal')).to.exist
              })

              it(`should not fire Withdrawal event no balance left`, async () => {
                const [owner, wallet, investor] = accounts
                const softCap = wei(100)
                const sale = await createSale({owner, wallet, softCap})
                await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
                const startTime = await sale.startTime.call()
                await evm.increaseTimeTo(startTime.toNumber())
                await sale.buyTokens(investor, {value: softCap, from: investor})
                const endTime = await sale.endTime.call()
                await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
                await expect(sale.withdraw({from: owner})).to.be.fulfilled
                const {logs} = await expect(sale.finish({from: owner})).to.be.fulfilled
                expect(logs.find(e => e.event === 'Withdrawal')).to.not.exist
              })
            })

            it(`should not be possible to finish after already finished`, async () => {
              const [owner, wallet] = accounts
              const sale = await createSale({owner, wallet, softCap: wei(100)})
              const startTime = await sale.startTime.call()
              await evm.increaseTimeTo(startTime.toNumber())
              const endTime = await sale.endTime.call()
              await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
              await expect(sale.finish({from: owner})).to.be.fulfilled
              await expect(sale.finish({from: owner})).to.be.rejectedWith(evm.Revert)
            })
          })
        })

        describe(`after hard cap has been reached`, () => {
          it(`should finish sale regardless of whether sale has ended`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet, softCap: wei(100), hardCap: wei(1000)})
            await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await expect(sale.buyTokens(investor, {value: wei(999), from: investor})).to.be.fulfilled
            await expect(sale.finish({from: owner})).to.be.rejectedWith(evm.Revert)
            await expect(sale.buyTokens(investor, {value: wei(1), from: investor})).to.be.fulfilled
            await expect(sale.finish({from: owner})).to.be.fulfilled
          })
        })
      })
    })

    describe(`refunds`, () => {
      describe(`when sale has not finished`, () => {
        it(`should not be possible`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createSale({owner, wallet, softCap: wei(100)})
          const sent = wei(15)
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
          await sale.buyTokens(investor, {value: sent, from: investor})
          await expect(sale.refund(investor, {from: investor})).to.be.rejectedWith(evm.Revert)
        })
      })

      describe(`when sale has finished`, () => {
        describe(`when refunding flag is not set`, () => {
          it(`should not be possible`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet, softCap: wei(100)})
            const sent = wei(150)
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
            await sale.buyTokens(investor, {value: sent, from: investor})
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            await expect(sale.finish({from: owner})).to.be.fulfilled
            await expect(sale.refund(investor, {from: investor})).to.be.rejectedWith(evm.Revert)
          })
        })

        describe(`when refunding flag is set`, () => {
          it(`should transfer investor's deposited amount back to the investor`, async () => {
            const [owner, wallet, investor1, investor2] = accounts
            const sale = await createSale({owner, wallet, softCap: wei(100)})
            const sent1 = wei(15)
            const sent2 = wei(27)
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.whitelist(investor1, ether(1), ether(1), 0, {from: owner})
            await sale.whitelist(investor2, ether(1), ether(1), 0, {from: owner})
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

          it(`should transfer multiple investor's deposited amount back to the investor`, async () => {
            const [owner, wallet, investor1, investor2] = accounts
            const sale = await createSale({owner, wallet, softCap: wei(100)})
            const sent1 = wei(15)
            const sent2 = wei(27)
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.whitelist(investor1, ether(1), ether(1), 0, {from: owner})
            await sale.whitelist(investor2, ether(1), ether(1), 0, {from: owner})
            await sale.buyTokens(investor1, {value: sent1, from: investor1})
            await sale.buyTokens(investor2, {value: sent2, from: investor2})
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            await expect(sale.finish({from: owner})).to.be.fulfilled
            const investor1BalanceBefore = await evm.getBalance(investor1)
            const investor2BalanceBefore = await evm.getBalance(investor2)
            await expect(sale.refundMany([investor1, investor2], {from: investor1, gasPrice: 0})).to.be.fulfilled
            const investor1BalanceAfter = await evm.getBalance(investor1)
            const investor2BalanceAfter = await evm.getBalance(investor2)
            expect(investor1BalanceAfter.minus(investor1BalanceBefore)).to.bignumber.equal(sent1)
            expect(investor2BalanceAfter.minus(investor2BalanceBefore)).to.bignumber.equal(sent2)
          })

          it(`should not transfer investor's alt deposited amount back to the investor`, async () => {
            const [owner, wallet, investor1, investor2] = accounts
            const sale = await createSale({owner, wallet, softCap: wei(400)})
            const sent1 = wei(15)
            const sent2 = wei(27)
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.whitelist(investor1, ether(1), ether(1), 0, {from: owner})
            await sale.whitelist(investor2, ether(1), ether(1), 0, {from: owner})
            await sale.buyTokens(investor1, {value: sent1, from: investor1})
            await sale.buyTokens(investor2, {value: sent2, from: investor2})
            await expect(sale.registerAltPurchase(investor1, 'BTC', 'foo', wei(18))).to.be.fulfilled
            await expect(sale.registerAltPurchase(investor2, 'BTC', 'foo', wei(160))).to.be.fulfilled
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
            const sale = await createSale({owner, wallet, softCap: wei(100)})
            const sent = wei(15)
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
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
            const sale = await createSale({owner, wallet, softCap: wei(100)})
            const sent = wei(15)
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
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
            const sale = await createSale({owner, wallet, softCap: wei(100)})
            const sent = wei(15)
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
            await sale.buyTokens(investor, {value: sent, from: investor})
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            await expect(sale.finish({from: owner})).to.be.fulfilled
            const {logs} = await expect(sale.refund(investor, {from: investor})).to.be.fulfilled
            expect(logs.find(e => e.event === 'Refunded')).to.exist
          })

          it(`should not be possible if deposit is 0`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createSale({owner, wallet, softCap: wei(100)})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.whitelist(investor, ether(1), ether(1), 0, {from: owner})
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            await expect(sale.finish({from: owner})).to.be.fulfilled
            await expect(sale.refund(investor, {from: investor})).to.be.rejectedWith(evm.Revert)
          })
        })
      })
    })
  })
})
