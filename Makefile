.PHONY: default build lint test coverage wallet

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

wallet: $(GNOSIS)/contracts/MultiSigWallet.sol $(GNOSIS)/contracts/MultiSigWalletWithDailyLimit.sol
	(cat $(GNOSIS)/contracts/MultiSigWallet.sol && \
		sed '/^$$/,$$!d' $(GNOSIS)/contracts/MultiSigWalletWithDailyLimit.sol) > contracts/Wallet.sol
