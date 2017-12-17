pragma solidity 0.4.18;

contract RevertingWallet {
    function () public payable {
        revert();
    }
}
