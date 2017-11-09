.PHONY: default build lint test coverage bundle

GNOSIS := vendor/GnosisMultiSigWallet

default: build

build:
	./node_modules/.bin/truffle compile

lint:
	./node_modules/.bin/solium -d contracts

test: lint
	./node_modules/.bin/truffle test

coverage: lint
	./node_modules/.bin/solidity-coverage

bundle:
	mkdir -p bundle/contracts
	rm -f bundle/contracts/Wallet.sol
	cat $(GNOSIS)/contracts/MultiSigWallet.sol >> bundle/contracts/Wallet.sol
	sed '/^$$/,$$!d' $(GNOSIS)/contracts/MultiSigWalletWithDailyLimit.sol >> bundle/contracts/Wallet.sol
	rm -f bundle/contracts/PreSale.sol
	cat contracts/lib/SafeMath.sol >> bundle/contracts/PreSale.sol
	echo >> bundle/contracts/PreSale.sol
	echo >> bundle/contracts/PreSale.sol
	sed '/contract/,$$!d' contracts/PreSaleToken.sol >> bundle/contracts/PreSale.sol
	echo >> bundle/contracts/PreSale.sol
	echo >> bundle/contracts/PreSale.sol
	sed '/contract/,$$!d' contracts/PreSale.sol >> bundle/contracts/PreSale.sol
