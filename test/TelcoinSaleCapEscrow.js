/* global artifacts:false, contract:false, before: false, describe: false, it:false */

const evm = require('./helpers/evm')
const {expect} = require('./helpers/chai')
const {wei} = require('./helpers/denominations')

const TelcoinSaleCapEscrow = artifacts.require('./TelcoinSaleCapEscrow.sol')
const ExpensiveWallet = artifacts.require('./mocks/ExpensiveWallet.sol')
const RevertingWallet = artifacts.require('./mocks/RevertingWallet.sol')

contract('TelcoinSaleCapEscrow', accounts => {
  before(async () => {
    return await evm.advanceBlock()
  })

  describe('contract', () => {
    describe('creation', () => {
      it(`should reject 0x0 as wallet`, async () => {
        const [owner, wallet] = accounts
        await expect(TelcoinSaleCapEscrow.new(evm.ZERO, {from: owner, value: wei(1)})).to.be.rejectedWith(evm.Revert)
        await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
      })

      it(`should set wallet`, async () => {
        const [owner, wallet] = accounts
        const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
        await expect(escrow.wallet.call()).to.eventually.equal(wallet)
      })

      it(`should require a greater than 0 value`, async () => {
        const [owner, wallet] = accounts
        await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner})).to.be.rejectedWith(evm.Revert)
        await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
      })

      it(`should transfer sent value to wallet`, async () => {
        const [owner, wallet] = accounts
        const balance1 = await evm.getBalance(wallet)
        await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1616)})).to.be.fulfilled
        await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
        const balance2 = await evm.getBalance(wallet)
        expect(balance2.minus(balance1)).to.bignumber.equal(wei(1617))
      })
    })

    describe('ownership', () => {
      it(`should not be transferrable by non-owner`, async () => {
        const [owner, nonOwner, wallet] = accounts
        const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
        await expect(escrow.transferOwnership(nonOwner, {from: nonOwner})).to.be.rejectedWith(evm.Revert)
        await expect(escrow.transferOwnership(nonOwner, {from: owner})).to.be.fulfilled
      })

      it(`should be transferrable by owner`, async () => {
        const [owner, nonOwner, wallet] = accounts
        const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
        await expect(escrow.transferOwnership(nonOwner, {from: owner})).to.be.fulfilled
        await expect(escrow.owner.call()).to.eventually.equal(nonOwner)
      })

      it(`should not allow 0x0 as owner`, async () => {
        const [owner, wallet] = accounts
        const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
        await expect(escrow.transferOwnership(evm.ZERO, {from: owner})).to.be.rejectedWith(evm.Revert)
      })

      it(`should fire OwnershipTransferred event on ownership change`, async () => {
        const [owner, nonOwner, wallet] = accounts
        const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
        const {logs} = await expect(escrow.transferOwnership(nonOwner, {from: owner})).to.be.fulfilled
        const log = logs.find(e => e.event === 'OwnershipTransferred')
        expect(log).to.exist
        expect(log.args.previousOwner).to.equal(owner)
        expect(log.args.newOwner).to.equal(nonOwner)
      })
    })

    describe('wallet', () => {
      it(`should not be changeable by non-owner`, async () => {
        const [owner, nonOwner, wallet, otherWallet] = accounts
        const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
        await expect(escrow.changeWallet(otherWallet, {from: nonOwner, value: wei(1)})).to.be.rejectedWith(evm.Revert)
        await expect(escrow.changeWallet(otherWallet, {from: owner, value: wei(1)})).to.be.fulfilled
      })

      it(`should require a value greater than 0`, async () => {
        const [owner, wallet, otherWallet] = accounts
        const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
        await expect(escrow.changeWallet(otherWallet, {from: owner})).to.be.rejectedWith(evm.Revert)
        await expect(escrow.changeWallet(otherWallet, {from: owner, value: wei(1)})).to.be.fulfilled
      })

      it(`should transfer sent value to the new wallet`, async () => {
        const [owner, wallet, otherWallet] = accounts
        const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
        const balance1 = await evm.getBalance(otherWallet)
        await expect(escrow.changeWallet(otherWallet, {from: owner, value: wei(634)})).to.be.fulfilled
        const balance2 = await evm.getBalance(otherWallet)
        expect(balance2.minus(balance1)).to.bignumber.equal(wei(634))
      })

      it(`should be changeable by owner`, async () => {
        const [owner, wallet, otherWallet] = accounts
        const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
        await expect(escrow.changeWallet(otherWallet, {from: owner, value: wei(1)})).to.be.fulfilled
        await expect(escrow.wallet.call()).to.eventually.equal(otherWallet)
      })

      it(`should not allow 0x0 as wallet`, async () => {
        const [owner, wallet, otherWallet] = accounts
        const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
        await expect(escrow.changeWallet(evm.ZERO, {from: owner, value: wei(1)})).to.be.rejectedWith(evm.Revert)
        await expect(escrow.changeWallet(otherWallet, {from: owner, value: wei(1)})).to.be.fulfilled
      })

      it(`should fire WalletChanged event on wallet change`, async () => {
        const [owner, wallet, otherWallet] = accounts
        const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
        const {logs} = await expect(escrow.changeWallet(otherWallet, {from: owner, value: wei(1)})).to.be.fulfilled
        const log = logs.find(e => e.event === 'WalletChanged')
        expect(log).to.exist
        expect(log.args.previousWallet).to.equal(wallet)
        expect(log.args.newWallet).to.equal(otherWallet)
      })
    })

    describe('sending money', () => {
      describe('when escrow is closed', () => {
        it(`should not be possible`, async () => {
          const [owner, wallet, participant] = accounts
          const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
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
          const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
          await expect(escrow.placeValue(participant, {value: wei(1000), from: participant})).to.be.fulfilled
          await expect(escrow.placeValue(evm.ZERO, {value: wei(1000), from: participant})).to.be.rejectedWith(evm.Revert)
        })

        it(`should require non-zero value`, async () => {
          const [owner, wallet, participant] = accounts
          const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant})).to.be.fulfilled
          await expect(escrow.placeValue(participant, {value: wei(1000), from: participant})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(0), from: participant})).to.be.rejectedWith(evm.Revert)
          await expect(escrow.placeValue(participant, {value: wei(0), from: participant})).to.be.rejectedWith(evm.Revert)
        })

        it(`should store deposited value`, async () => {
          const [owner, wallet, participant] = accounts
          const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
          await expect(escrow.deposited.call(participant)).to.eventually.bignumber.equal(0)
          await expect(escrow.placeValue(participant, {value: wei(1000), from: participant})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant})).to.be.fulfilled
          await expect(escrow.deposited.call(participant)).to.eventually.bignumber.equal(2000)
        })

        it(`should fire ValuePlaced event`, async () => {
          const [owner, wallet, participant1, participant2] = accounts
          const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
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
          const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
          await expect(escrow.close({from: owner})).to.be.fulfilled
          await expect(escrow.close({from: nonOwner})).to.be.rejectedWith(evm.Revert)
        })
      })

      describe(`by owner`, () => {
        it(`should set finished flag`, async () => {
          const [owner, wallet] = accounts
          const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
          await expect(escrow.closed.call()).to.eventually.equal(false)
          await expect(escrow.close({from: owner})).to.be.fulfilled
          await expect(escrow.closed.call()).to.eventually.equal(true)
        })

        it(`should not be closable twice`, async () => {
          const [owner, wallet] = accounts
          const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
          await expect(escrow.close({from: owner})).to.be.fulfilled
          await expect(escrow.close({from: owner})).to.be.rejectedWith(evm.Revert)
        })

        it(`should fire Closed event`, async () => {
          const [owner, wallet] = accounts
          const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
          const {logs} = await expect(escrow.close({from: owner})).to.be.fulfilled
          expect(logs.find(e => e.event === 'Closed')).to.exist
        })
      })
    })

    describe(`rejecting participants`, () => {
      describe(`by non-owner`, () => {
        it(`should not be possible`, async () => {
          const [owner, wallet, nonOwner, participant1, participant2] = accounts
          const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
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
          const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
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
          const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
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
          const [owner, wallet, participant1, participant2, participant3] = accounts
          const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
          const escrowBalance1 = await evm.getBalance(escrow.address)
          await expect(escrow.sendTransaction({value: wei(1000), from: participant1})).to.be.fulfilled
          await expect(escrow.placeValue(participant1, {value: wei(1000), from: participant1})).to.be.fulfilled
          const balance1 = await evm.getBalance(participant1)
          await expect(escrow.reject(participant1, {from: owner})).to.be.fulfilled
          const balance2 = await evm.getBalance(participant1)
          expect(balance2.minus(balance1)).to.bignumber.equal(wei(2000))
          await expect(escrow.placeValue(participant2, {value: wei(150), from: participant2})).to.be.fulfilled
          await expect(escrow.placeValue(participant3, {value: wei(450), from: participant3})).to.be.fulfilled
          const balance3 = await evm.getBalance(participant2)
          await expect(escrow.rejectMany([participant2], {from: owner})).to.be.fulfilled
          const balance4 = await evm.getBalance(participant2)
          expect(balance4.minus(balance3)).to.bignumber.equal(wei(150))
          const escrowBalance2 = await evm.getBalance(escrow.address)
          expect(escrowBalance2.minus(escrowBalance1)).to.bignumber.equal(wei(450))
        })

        it(`should pass enough gas for expensive refunds`, async () => {
          const [owner, wallet, participant1] = accounts
          const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
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
          const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
          const revertingWallet = await expect(RevertingWallet.new()).to.be.fulfilled
          await expect(escrow.placeValue(revertingWallet.address, {value: wei(1000), from: participant1})).to.be.fulfilled
          await expect(escrow.reject(revertingWallet.address, {from: owner})).to.be.rejectedWith(evm.Revert)
        })

        it(`should fire Rejected event`, async () => {
          const [owner, wallet, participant1, participant2] = accounts
          const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
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
          const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant1})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant2})).to.be.fulfilled
          await expect(escrow.approve(participant1, wei(1000), {from: nonOwner})).to.be.rejectedWith(evm.Revert)
          await expect(escrow.approveMany([participant1], wei(1000), {from: nonOwner})).to.be.rejectedWith(evm.Revert)
          await expect(escrow.approve(participant1, wei(1000), {from: owner})).to.be.fulfilled
          await expect(escrow.approveMany([participant2], wei(1000), {from: owner})).to.be.fulfilled
        })
      })

      describe(`by owner`, () => {
        it(`should require non-zero deposit`, async () => {
          const [owner, wallet, participant1, participant2] = accounts
          const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant1})).to.be.fulfilled
          await expect(escrow.approve(participant1, wei(1000), {from: owner})).to.be.fulfilled
          await expect(escrow.approve(participant1, wei(1000), {from: owner})).to.be.rejectedWith(evm.Revert)
          await expect(escrow.approveMany([participant2], wei(1000), {from: owner})).to.be.rejectedWith(evm.Revert)
          await expect(escrow.sendTransaction({value: wei(1000), from: participant2})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant1})).to.be.fulfilled
          await expect(escrow.approveMany([participant2, participant1], wei(1000), {from: owner})).to.be.fulfilled
        })

        it(`should not allow approval greater than deposit`, async () => {
          const [owner, wallet, participant1] = accounts
          const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant1})).to.be.fulfilled
          await expect(escrow.approve(participant1, wei(1001), {from: owner})).to.be.rejectedWith(evm.Revert)
          await expect(escrow.approve(participant1, wei(1000), {from: owner})).to.be.fulfilled
        })

        it(`should decrease balance by approved amount`, async () => {
          const [owner, wallet, participant1, participant2] = accounts
          const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
          await expect(escrow.deposited.call(participant1)).to.eventually.bignumber.equal(wei(0))
          await expect(escrow.sendTransaction({value: wei(1000), from: participant1})).to.be.fulfilled
          await expect(escrow.deposited.call(participant1)).to.eventually.bignumber.equal(wei(1000))
          await expect(escrow.approve(participant1, wei(200), {from: owner})).to.be.fulfilled
          await expect(escrow.deposited.call(participant1)).to.eventually.bignumber.equal(wei(800))
          await expect(escrow.approve(participant1, wei(500), {from: owner})).to.be.fulfilled
          await expect(escrow.deposited.call(participant1)).to.eventually.bignumber.equal(wei(300))
          await expect(escrow.approve(participant1, wei(300), {from: owner})).to.be.fulfilled
          await expect(escrow.deposited.call(participant1)).to.eventually.bignumber.equal(wei(0))
          await expect(escrow.deposited.call(participant2)).to.eventually.bignumber.equal(wei(0))
          await expect(escrow.sendTransaction({value: wei(1000), from: participant2})).to.be.fulfilled
          await expect(escrow.deposited.call(participant2)).to.eventually.bignumber.equal(wei(1000))
          await expect(escrow.sendTransaction({value: wei(2000), from: participant1})).to.be.fulfilled
          await expect(escrow.deposited.call(participant1)).to.eventually.bignumber.equal(wei(2000))
          await expect(escrow.approveMany([participant1, participant2], wei(1000), {from: owner})).to.be.fulfilled
          await expect(escrow.deposited.call(participant1)).to.eventually.bignumber.equal(wei(1000))
          await expect(escrow.deposited.call(participant2)).to.eventually.bignumber.equal(wei(0))
        })

        it(`should send approved amount to wallet`, async () => {
          const [owner, wallet, participant1] = accounts
          const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant1})).to.be.fulfilled
          await expect(escrow.placeValue(participant1, {value: wei(1000), from: participant1})).to.be.fulfilled
          const balance1 = await evm.getBalance(wallet)
          await expect(escrow.approve(participant1, wei(800), {from: owner})).to.be.fulfilled
          const balance2 = await evm.getBalance(wallet)
          expect(balance2.minus(balance1)).to.bignumber.equal(wei(800))
          await expect(escrow.approve(participant1, wei(1200), {from: owner})).to.be.fulfilled
          const balance3 = await evm.getBalance(wallet)
          expect(balance3.minus(balance1)).to.bignumber.equal(wei(2000))
        })

        it(`should fire Approved event`, async () => {
          const [owner, wallet, participant1, participant2] = accounts
          const escrow = await expect(TelcoinSaleCapEscrow.new(wallet, {from: owner, value: wei(1)})).to.be.fulfilled
          await expect(escrow.sendTransaction({value: wei(1000), from: participant1})).to.be.fulfilled
          await expect(escrow.placeValue(participant1, {value: wei(1000), from: participant1})).to.be.fulfilled
          const {logs: logs1} = await expect(escrow.approve(participant1, wei(1000), {from: owner})).to.be.fulfilled
          const log1 = logs1.find(e => e.event === 'Approved')
          expect(log1).to.exist
          expect(log1.args.participant).to.equal(participant1)
          expect(log1.args.amount).to.bignumber.equal(wei(1000))
          await expect(escrow.placeValue(participant2, {value: wei(150), from: participant2})).to.be.fulfilled
          const {logs: logs2} = await expect(escrow.approveMany([participant2], wei(150), {from: owner})).to.be.fulfilled
          const log2 = logs2.find(e => e.event === 'Approved')
          expect(log2).to.exist
          expect(log2.args.participant).to.equal(participant2)
          expect(log2.args.amount).to.bignumber.equal(wei(150))
        })
      })
    })
  })
})
