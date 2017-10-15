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
      await expect(sale.transferOwnership(evm.ZERO, {from: owner})).to.be.rejectedWith(evm.Throw)
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

      it(`should not allow whitelisting 0x0`, async () => {
        const [owner, wallet] = accounts
        const sale = await createPreSale({owner, wallet})
        await expect(sale.whitelist(evm.ZERO, true, {from: owner})).to.be.rejectedWith(evm.Throw)
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
      describe(`for a non-whitelisted beneficiary`, () => {
        it(`should not be possible`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet})
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await expect(sale.sendTransaction({value: evm.wei(1, 'ether'), from: investor})).to.be.rejectedWith(evm.Throw)
          await expect(sale.buyTokens(investor, {value: evm.wei(1, 'ether'), from: investor})).to.be.rejectedWith(evm.Throw)
        })
      })

      describe(`for a whitelisted beneficiary`, () => {
        describe(`from a non-whitelisted sender`, () => {
          it(`should not be possible`, async () => {
            const [owner, wallet, sender, beneficiary] = accounts
            const sale = await createPreSale({owner, wallet})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.whitelist(beneficiary, true, {from: owner})
            await expect(sale.buyTokens(beneficiary, {value: evm.wei(1, 'ether'), from: sender})).to.be.rejectedWith(evm.Throw)
          })
        })

        describe(`from a whitelisted sender`, () => {
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
            const sale = await createPreSale({owner, wallet, goal: evm.wei(100, 'wei')})
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
            const sale = await createPreSale({owner, wallet, goal: evm.wei(100, 'wei')})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            await expect(sale.refunding.call()).to.eventually.equal(false)
            await expect(sale.finish({from: owner})).to.be.fulfilled
            await expect(sale.refunding.call()).to.eventually.equal(true)
          })

          it(`should not transfer balance to wallet`, async () => {
            const [owner, wallet] = accounts
            const sale = await createPreSale({owner, wallet, goal: evm.wei(100, 'wei')})
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
            const sale = await createPreSale({owner, wallet, goal: evm.wei(100, 'wei')})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            const balanceBefore = await evm.getBalance(sale.address)
            await expect(sale.finish({from: owner})).to.be.fulfilled
            const balanceAfter = await evm.getBalance(sale.address)
            expect(balanceAfter.minus(balanceBefore)).to.bignumber.equal(0)
          })
        })

        describe(`when goal has been reached`, () => {
          it(`should set finished flag`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createPreSale({owner, wallet, goal: evm.wei(100, 'wei')})
            await sale.whitelist(investor, true, {from: owner})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.buyTokens(investor, {value: evm.wei(100, 'wei'), from: investor})
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            await expect(sale.finished.call()).to.eventually.equal(false)
            await expect(sale.finish({from: owner})).to.be.fulfilled
            await expect(sale.finished.call()).to.eventually.equal(true)
          })

          it(`should not set refunding flag`, async () => {
            const [owner, wallet, investor] = accounts
            const sale = await createPreSale({owner, wallet, goal: evm.wei(100, 'wei')})
            await sale.whitelist(investor, true, {from: owner})
            const startTime = await sale.startTime.call()
            await evm.increaseTimeTo(startTime.toNumber())
            await sale.buyTokens(investor, {value: evm.wei(100, 'wei'), from: investor})
            const endTime = await sale.endTime.call()
            await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
            await expect(sale.refunding.call()).to.eventually.equal(false)
            await expect(sale.finish({from: owner})).to.be.fulfilled
            await expect(sale.refunding.call()).to.eventually.equal(false)
          })

          it(`should transfer whole balance to wallet`, async () => {
            const [owner, wallet, investor] = accounts
            const goal = evm.wei(100, 'wei')
            const sale = await createPreSale({owner, wallet, goal})
            await sale.whitelist(investor, true, {from: owner})
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
        })

        it(`should not be possible to finish after already finished`, async () => {
          const [owner, wallet] = accounts
          const sale = await createPreSale({owner, wallet, goal: evm.wei(100, 'wei')})
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
        const sale = await createPreSale({owner, wallet, goal: evm.wei(100, 'wei')})
        const sent = evm.wei(15, 'wei')
        const startTime = await sale.startTime.call()
        await evm.increaseTimeTo(startTime.toNumber())
        await sale.whitelist(investor, true, {from: owner})
        await sale.buyTokens(investor, {value: sent, from: investor})
        await expect(sale.refund(investor, {from: investor})).to.be.rejectedWith(evm.Throw)
      })
    })

    describe(`when sale has finished`, () => {
      describe(`when refunding flag is not set`, () => {
        it(`should not be possible`, async () => {
          const [owner, wallet, investor] = accounts
          const sale = await createPreSale({owner, wallet, goal: evm.wei(100, 'wei')})
          const sent = evm.wei(150, 'wei')
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await sale.whitelist(investor, true, {from: owner})
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
          const sale = await createPreSale({owner, wallet, goal: evm.wei(100, 'wei')})
          const sent1 = evm.wei(15, 'wei')
          const sent2 = evm.wei(27, 'wei')
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await sale.whitelist(investor1, true, {from: owner})
          await sale.whitelist(investor2, true, {from: owner})
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
          const sale = await createPreSale({owner, wallet, goal: evm.wei(100, 'wei')})
          const sent = evm.wei(15, 'wei')
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await sale.whitelist(investor, true, {from: owner})
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
          const sale = await createPreSale({owner, wallet, goal: evm.wei(100, 'wei')})
          const sent = evm.wei(15, 'wei')
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await sale.whitelist(investor, true, {from: owner})
          await sale.buyTokens(investor, {value: sent, from: investor})
          const endTime = await sale.endTime.call()
          await evm.increaseTimeTo(endTime.toNumber() + duration.hours(1))
          await expect(sale.finish({from: owner})).to.be.fulfilled
          await expect(sale.depositOf.call(investor)).to.eventually.bignumber.equal(sent)
          await expect(sale.refund(investor, {from: investor})).to.be.fulfilled
          await expect(sale.depositOf.call(investor)).to.eventually.bignumber.equal(0)
        })
      })
    })
  })
})
