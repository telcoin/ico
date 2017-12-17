/* global artifacts:false, contract:false, before: false, describe: false, it:false */

const duration = require('./helpers/duration')
const evm = require('./helpers/evm')
const {expect} = require('./helpers/chai')
const {wei, ether} = require('./helpers/denominations')

const Telcoin = artifacts.require('./Telcoin.sol')
const TelcoinSale = artifacts.require('./TelcoinSale.sol')
const TelcoinSaleKYCEscrow = artifacts.require('./TelcoinSaleKYCEscrow.sol')
const ExpensiveWallet = artifacts.require('./mocks/ExpensiveWallet.sol')
const RevertingWallet = artifacts.require('./mocks/RevertingWallet.sol')

contract('TelcoinSaleKYCEscrow', accounts => {
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
      it(`should reject 0x0 as sale`, async () => {
        const [owner, wallet] = accounts
        const sale = await expect(createSale({owner, wallet})).to.be.fulfilled
        await expect(TelcoinSaleKYCEscrow.new(evm.ZERO, {from: owner})).to.be.rejectedWith(evm.Revert)
        await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
      })
    })

    describe('ownership', () => {
      it(`should not be transferrable by non-owner`, async () => {
        const [owner, nonOwner, wallet] = accounts
        const sale = await createSale({owner, wallet})
        const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
        await expect(escrow.transferOwnership(nonOwner, {from: nonOwner})).to.be.rejectedWith(evm.Revert)
        await expect(escrow.transferOwnership(nonOwner, {from: owner})).to.be.fulfilled
      })

      it(`should be transferrable by owner`, async () => {
        const [owner, nonOwner, wallet] = accounts
        const sale = await createSale({owner, wallet})
        const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
        await escrow.transferOwnership(nonOwner, {from: owner})
        await expect(escrow.owner.call()).to.eventually.equal(nonOwner)
      })

      it(`should not allow 0x0 as owner`, async () => {
        const [owner, wallet] = accounts
        const sale = await createSale({owner, wallet})
        const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
        await expect(escrow.transferOwnership(evm.ZERO, {from: owner})).to.be.rejectedWith(evm.Revert)
      })

      it(`should fire OwnershipTransferred event on ownership change`, async () => {
        const [owner, nonOwner, wallet] = accounts
        const sale = await createSale({owner, wallet})
        const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
        const {logs} = await expect(escrow.transferOwnership(nonOwner, {from: owner})).to.be.fulfilled
        expect(logs.find(e => e.event === 'OwnershipTransferred')).to.exist
      })
    })

    describe('sending money', () => {
      describe('when escrow is closed', () => {
        it(`should not be possible`, async () => {
          const [owner, wallet, participant] = accounts
          const sale = await createSale({owner, wallet})
          const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant})).to.be.fulfilled
          await expect(escrow.placeValue(participant, {value: wei(1000), from: participant})).to.be.fulfilled
          await expect(escrow.close({from: owner})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant})).to.be.rejectedWith(evm.Revert)
          await expect(escrow.placeValue(participant, {value: wei(1000), from: participant})).to.be.rejectedWith(evm.Revert)
        })
      })

      describe('when escrow is not closed', () => {
        it(`should not allow 0x0 as beneficiary`, async () => {
          const [owner, wallet, participant] = accounts
          const sale = await createSale({owner, wallet})
          const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
          await expect(escrow.placeValue(participant, {value: wei(1000), from: participant})).to.be.fulfilled
          await expect(escrow.placeValue(evm.ZERO, {value: wei(1000), from: participant})).to.be.rejectedWith(evm.Revert)
        })

        it(`should require non-zero value`, async () => {
          const [owner, wallet, participant] = accounts
          const sale = await createSale({owner, wallet})
          const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant})).to.be.fulfilled
          await expect(escrow.placeValue(participant, {value: wei(1000), from: participant})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(0), from: participant})).to.be.rejectedWith(evm.Revert)
          await expect(escrow.placeValue(participant, {value: wei(0), from: participant})).to.be.rejectedWith(evm.Revert)
        })

        it(`should store deposited value`, async () => {
          const [owner, wallet, participant] = accounts
          const sale = await createSale({owner, wallet})
          const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
          await expect(escrow.deposited.call(participant)).to.eventually.bignumber.equal(0)
          await expect(escrow.placeValue(participant, {value: wei(1000), from: participant})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant})).to.be.fulfilled
          await expect(escrow.deposited.call(participant)).to.eventually.bignumber.equal(2000)
        })

        it(`should fire ValuePlaced event`, async () => {
          const [owner, wallet, participant1, participant2] = accounts
          const sale = await createSale({owner, wallet})
          const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
          const {logs: logs1} = await expect(escrow.placeValue(participant1, {value: wei(1000), from: participant2})).to.be.fulfilled
          const log1 = logs1.find(e => e.event === 'ValuePlaced')
          expect(log1).to.exist
          expect(log1.args.purchaser).to.equal(participant2)
          expect(log1.args.beneficiary).to.equal(participant1)
          expect(log1.args.amount).to.bignumber.equal(wei(1000))
          const {logs: logs2} = await expect(escrow.sendTransaction({value: wei(1000), from: participant1})).to.be.fulfilled
          const log2 = logs2.find(e => e.event === 'ValuePlaced')
          expect(log2).to.exist
          expect(log2.args.purchaser).to.equal(participant1)
          expect(log2.args.beneficiary).to.equal(participant1)
          expect(log2.args.amount).to.bignumber.equal(wei(1000))
        })
      })
    })

    describe('closing', () => {
      describe(`by non-owner`, () => {
        it(`should not be possible`, async () => {
          const [owner, wallet, nonOwner] = accounts
          const sale = await createSale({owner, wallet})
          const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
          await expect(escrow.close({from: owner})).to.be.fulfilled
          await expect(escrow.close({from: nonOwner})).to.be.rejectedWith(evm.Revert)
        })
      })

      describe(`by owner`, () => {
        it(`should set finished flag`, async () => {
          const [owner, wallet] = accounts
          const sale = await createSale({owner, wallet})
          const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
          await expect(escrow.closed.call()).to.eventually.equal(false)
          await expect(escrow.close({from: owner})).to.be.fulfilled
          await expect(escrow.closed.call()).to.eventually.equal(true)
        })

        it(`should not be closable twice`, async () => {
          const [owner, wallet] = accounts
          const sale = await createSale({owner, wallet})
          const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
          await expect(escrow.close({from: owner})).to.be.fulfilled
          await expect(escrow.close({from: owner})).to.be.rejectedWith(evm.Revert)
        })

        it(`should fire Closed event`, async () => {
          const [owner, wallet] = accounts
          const sale = await createSale({owner, wallet})
          const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
          const {logs} = await expect(escrow.close({from: owner})).to.be.fulfilled
          expect(logs.find(e => e.event === 'Closed')).to.exist
        })
      })
    })

    describe(`rejecting participants`, () => {
      describe(`by non-owner`, () => {
        it(`should not be possible`, async () => {
          const [owner, wallet, nonOwner, participant1, participant2] = accounts
          const sale = await createSale({owner, wallet})
          const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant1})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant2})).to.be.fulfilled
          await expect(escrow.reject(participant1, {from: nonOwner})).to.be.rejectedWith(evm.Revert)
          await expect(escrow.rejectMany([participant1], {from: nonOwner})).to.be.rejectedWith(evm.Revert)
          await expect(escrow.reject(participant1, {from: owner})).to.be.fulfilled
          await expect(escrow.rejectMany([participant2], {from: owner})).to.be.fulfilled
        })
      })

      describe(`by owner`, () => {
        it(`should require non-zero deposit`, async () => {
          const [owner, wallet, participant1, participant2] = accounts
          const sale = await createSale({owner, wallet})
          const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant1})).to.be.fulfilled
          await expect(escrow.reject(participant1, {from: owner})).to.be.fulfilled
          await expect(escrow.reject(participant1, {from: owner})).to.be.rejectedWith(evm.Revert)
          await expect(escrow.rejectMany([participant2], {from: owner})).to.be.rejectedWith(evm.Revert)
          await expect(escrow.sendTransaction({value: wei(1000), from: participant2})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant1})).to.be.fulfilled
          await expect(escrow.rejectMany([participant2, participant1], {from: owner})).to.be.fulfilled
        })

        it(`should set balance to 0`, async () => {
          const [owner, wallet, participant1, participant2] = accounts
          const sale = await createSale({owner, wallet})
          const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
          await expect(escrow.deposited.call(participant1)).to.eventually.bignumber.equal(wei(0))
          await expect(escrow.sendTransaction({value: wei(1000), from: participant1})).to.be.fulfilled
          await expect(escrow.deposited.call(participant1)).to.eventually.bignumber.equal(wei(1000))
          await expect(escrow.reject(participant1, {from: owner})).to.be.fulfilled
          await expect(escrow.deposited.call(participant1)).to.eventually.bignumber.equal(wei(0))
          await expect(escrow.deposited.call(participant2)).to.eventually.bignumber.equal(wei(0))
          await expect(escrow.sendTransaction({value: wei(1000), from: participant2})).to.be.fulfilled
          await expect(escrow.deposited.call(participant2)).to.eventually.bignumber.equal(wei(1000))
          await expect(escrow.sendTransaction({value: wei(2000), from: participant1})).to.be.fulfilled
          await expect(escrow.deposited.call(participant1)).to.eventually.bignumber.equal(wei(2000))
          await expect(escrow.rejectMany([participant2, participant1], {from: owner})).to.be.fulfilled
          await expect(escrow.deposited.call(participant1)).to.eventually.bignumber.equal(wei(0))
          await expect(escrow.deposited.call(participant2)).to.eventually.bignumber.equal(wei(0))
        })

        it(`should refund balance`, async () => {
          const [owner, wallet, participant1, participant2] = accounts
          const sale = await createSale({owner, wallet})
          const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant1})).to.be.fulfilled
          await expect(escrow.placeValue(participant1, {value: wei(1000), from: participant1})).to.be.fulfilled
          const balance1 = await evm.getBalance(participant1)
          await expect(escrow.reject(participant1, {from: owner})).to.be.fulfilled
          const balance2 = await evm.getBalance(participant1)
          expect(balance2.minus(balance1)).to.bignumber.equal(wei(2000))
          await expect(escrow.placeValue(participant2, {value: wei(150), from: participant2})).to.be.fulfilled
          const balance3 = await evm.getBalance(participant2)
          await expect(escrow.rejectMany([participant2], {from: owner})).to.be.fulfilled
          const balance4 = await evm.getBalance(participant2)
          expect(balance4.minus(balance3)).to.bignumber.equal(wei(150))
        })

        it(`should pass enough gas for expensive refunds`, async () => {
          const [owner, wallet, participant1] = accounts
          const sale = await createSale({owner, wallet})
          const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
          const expensiveWallet = await expect(ExpensiveWallet.new()).to.be.fulfilled
          await expect(escrow.placeValue(expensiveWallet.address, {value: wei(1000), from: participant1})).to.be.fulfilled
          await expect(escrow.reject(expensiveWallet.address, {from: owner, gas: 30000})).to.be.rejectedWith(evm.OutOfGas)
          const balance1 = await evm.getBalance(expensiveWallet.address)
          await expect(escrow.reject(expensiveWallet.address, {from: owner, gas: 1000000})).to.be.fulfilled
          const balance2 = await evm.getBalance(expensiveWallet.address)
          expect(balance2.minus(balance1)).to.bignumber.equal(wei(1000))
        })

        it(`should give up on reverting wallets`, async () => {
          const [owner, wallet, participant1] = accounts
          const sale = await createSale({owner, wallet})
          const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
          const revertingWallet = await expect(RevertingWallet.new()).to.be.fulfilled
          await expect(escrow.placeValue(revertingWallet.address, {value: wei(1000), from: participant1})).to.be.fulfilled
          await expect(escrow.reject(revertingWallet.address, {from: owner})).to.be.rejectedWith(evm.Revert)
        })

        it(`should fire Rejected event`, async () => {
          const [owner, wallet, participant1, participant2] = accounts
          const sale = await createSale({owner, wallet})
          const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant1})).to.be.fulfilled
          await expect(escrow.placeValue(participant1, {value: wei(1000), from: participant1})).to.be.fulfilled
          const {logs: logs1} = await expect(escrow.reject(participant1, {from: owner})).to.be.fulfilled
          const log1 = logs1.find(e => e.event === 'Rejected')
          expect(log1).to.exist
          expect(log1.args.participant).to.equal(participant1)
          await expect(escrow.placeValue(participant2, {value: wei(150), from: participant2})).to.be.fulfilled
          const {logs: logs2} = await expect(escrow.rejectMany([participant2], {from: owner})).to.be.fulfilled
          const log2 = logs2.find(e => e.event === 'Rejected')
          expect(log2).to.exist
          expect(log2.args.participant).to.equal(participant2)
        })
      })
    })

    describe(`approving participants`, () => {
      describe(`by non-owner`, () => {
        it(`should not be possible`, async () => {
          const [owner, wallet, nonOwner, participant1, participant2] = accounts
          const sale = await createSale({owner, wallet})
          const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant1})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant2})).to.be.fulfilled
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await expect(sale.whitelist(participant1, wei(0), wei(2000), 50, {from: owner})).to.be.fulfilled
          await expect(sale.whitelist(participant2, wei(0), wei(2000), 50, {from: owner})).to.be.fulfilled
          await expect(escrow.approve(participant1, {from: nonOwner})).to.be.rejectedWith(evm.Revert)
          await expect(escrow.approveMany([participant1], {from: nonOwner})).to.be.rejectedWith(evm.Revert)
          await expect(escrow.approve(participant1, {from: owner})).to.be.fulfilled
          await expect(escrow.approveMany([participant2], {from: owner})).to.be.fulfilled
        })
      })

      describe(`by owner`, () => {
        it(`should require non-zero deposit`, async () => {
          const [owner, wallet, participant1, participant2] = accounts
          const sale = await createSale({owner, wallet})
          const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant1})).to.be.fulfilled
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await expect(sale.whitelist(participant1, wei(0), wei(2000), 50, {from: owner})).to.be.fulfilled
          await expect(escrow.approve(participant1, {from: owner})).to.be.fulfilled
          await expect(escrow.approve(participant1, {from: owner})).to.be.rejectedWith(evm.Revert)
          await expect(escrow.approveMany([participant2], {from: owner})).to.be.rejectedWith(evm.Revert)
          await expect(escrow.sendTransaction({value: wei(1000), from: participant2})).to.be.fulfilled
          await expect(sale.whitelist(participant2, wei(0), wei(2000), 50, {from: owner})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant1})).to.be.fulfilled
          await expect(escrow.approveMany([participant2, participant1], {from: owner})).to.be.fulfilled
        })

        it(`should set balance to 0`, async () => {
          const [owner, wallet, participant1, participant2] = accounts
          const sale = await createSale({owner, wallet})
          const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
          await expect(escrow.deposited.call(participant1)).to.eventually.bignumber.equal(wei(0))
          await expect(escrow.sendTransaction({value: wei(1000), from: participant1})).to.be.fulfilled
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await expect(sale.whitelist(participant1, wei(0), wei(3000), 50, {from: owner})).to.be.fulfilled
          await expect(escrow.deposited.call(participant1)).to.eventually.bignumber.equal(wei(1000))
          await expect(escrow.approve(participant1, {from: owner})).to.be.fulfilled
          await expect(escrow.deposited.call(participant1)).to.eventually.bignumber.equal(wei(0))
          await expect(escrow.deposited.call(participant2)).to.eventually.bignumber.equal(wei(0))
          await expect(escrow.sendTransaction({value: wei(1000), from: participant2})).to.be.fulfilled
          await expect(sale.whitelist(participant2, wei(0), wei(2000), 50, {from: owner})).to.be.fulfilled
          await expect(escrow.deposited.call(participant2)).to.eventually.bignumber.equal(wei(1000))
          await expect(escrow.sendTransaction({value: wei(2000), from: participant1})).to.be.fulfilled
          await expect(escrow.deposited.call(participant1)).to.eventually.bignumber.equal(wei(2000))
          await expect(escrow.approveMany([participant1, participant2], {from: owner})).to.be.fulfilled
          await expect(escrow.deposited.call(participant1)).to.eventually.bignumber.equal(wei(0))
          await expect(escrow.deposited.call(participant2)).to.eventually.bignumber.equal(wei(0))
        })

        it(`should send deposit to sale`, async () => {
          const [owner, wallet, participant1] = accounts
          const sale = await createSale({owner, wallet})
          const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant1})).to.be.fulfilled
          await expect(escrow.placeValue(participant1, {value: wei(1000), from: participant1})).to.be.fulfilled
          await expect(sale.deposited.call(participant1)).to.eventually.bignumber.equal(wei(0))
          await expect(escrow.approve(participant1, {from: owner})).to.be.rejectedWith(evm.Revert)
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await expect(escrow.approve(participant1, {from: owner})).to.be.rejectedWith(evm.Revert)
          await expect(sale.whitelist(participant1, wei(0), wei(2000), 50, {from: owner})).to.be.fulfilled
          const balance1 = await evm.getBalance(sale.address)
          await expect(escrow.approve(participant1, {from: owner})).to.be.fulfilled
          const balance2 = await evm.getBalance(sale.address)
          expect(balance2.minus(balance1)).to.bignumber.equal(wei(2000))
          await expect(sale.deposited.call(participant1)).to.eventually.bignumber.equal(wei(2000))
        })

        it(`should fire Approved event`, async () => {
          const [owner, wallet, participant1, participant2] = accounts
          const sale = await createSale({owner, wallet})
          const escrow = await expect(TelcoinSaleKYCEscrow.new(sale.address, {from: owner})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant1})).to.be.fulfilled
          await expect(escrow.placeValue(participant1, {value: wei(1000), from: participant1})).to.be.fulfilled
          const startTime = await sale.startTime.call()
          await evm.increaseTimeTo(startTime.toNumber())
          await expect(sale.whitelist(participant1, wei(0), wei(2000), 50, {from: owner})).to.be.fulfilled
          const {logs: logs1} = await expect(escrow.approve(participant1, {from: owner})).to.be.fulfilled
          const log1 = logs1.find(e => e.event === 'Approved')
          expect(log1).to.exist
          expect(log1.args.participant).to.equal(participant1)
          await expect(sale.whitelist(participant2, wei(0), wei(2000), 50, {from: owner})).to.be.fulfilled
          await expect(escrow.placeValue(participant2, {value: wei(150), from: participant2})).to.be.fulfilled
          const {logs: logs2} = await expect(escrow.approveMany([participant2], {from: owner})).to.be.fulfilled
          const log2 = logs2.find(e => e.event === 'Approved')
          expect(log2).to.exist
          expect(log2.args.participant).to.equal(participant2)
        })
      })
    })
  })
})
