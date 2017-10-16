.PHONY: default test

default: test

test:
	./node_modules/.bin/truffle test
