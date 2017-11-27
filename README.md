# Telcoin ICO

## Pre-sale

### Build requirements

* Yarn
* Node.js 8.6.0 or newer

### Testing

First, make sure you've installed development dependencies by running:

```bash
yarn
```

Next, start [`ganache-cli`](https://github.com/trufflesuite/ganache-cli):

```bash
make ganache
```

Finally, to run tests, simply execute:

```bash
make test
```

### Expected flow

1. A `PreSale` contract is deployed with the agreed upon `goal`, `startTime`, `endTime`, `rate` and `wallet` arguments. These values cannot be changed later. A non-zero value must be sent to the contract, which will then be sent to the wallet as a way to verify that the wallet is capable of actually receiving funds.
2. It is not possible to participate in the sale until the sale starts.
3. Before or after the sale starts, the contract owner must call `.whitelist(address)` to whitelist investors one by one.
4. Once the sale starts, whitelisted participants are able to either send ether, or anyone can call `.buyTokens(address)` for a whitelisted address to purchase pre-sale tokens.
5. Sent Ether is locked in the `PreSale` until `.goalReached()`, at which point due to it already being obvious that the sale will succeed and therefore no refunds will be issued, the contract owner will be able to `.withdraw()` the balance accumulated so far in order to reduce the risk of either the contract getting hacked or the full amount of funds getting permanently locked in the contract due to an error interacting with the wallet.
6. Once the `PreSale`'s `endTime` passes, the contract owner calls `.finish()` on the contract. This finishes the minting of `PreSaleToken`, and depending on whether `goalReached()` or not, may either cause a final withdrawal, or allow refunds to be processed by setting the `refunding` flag.
7. If the goal was not reached, anyone will be able to call `.refund(address)` for any participant address, which will transfer the total amount deposited for the participant address to the participant address (importantly, not to `msg.sender`).
8. If the goal was reached, the contract owner gains ownership of the `PreSaleToken` contract.
9. The token owner is able to `.allowExchanger(address)` to add a trusted "exchanger" contract to the token contract.
10. The exchanger has an e.g. `.redeem(address)` method, which calls `.balanceOf(address)` on the pre-sale token, calculates the amount of final or intermediary tokens to grant for their balance, and calls `.exchange(address, uint256, string, uint256)` to transfer the participant's pre-sale token balance to the exchanger's address. The exchanger should then grant the previously calculated amount of tokens to the participant. This requires a degree of trust from the participant, as the exchanger is able to make any decision based on the pre-sale token balance or any other factor.
