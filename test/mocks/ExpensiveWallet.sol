pragma solidity 0.4.18;

contract ExpensiveWallet {
    mapping (address => uint256) deposited;

    function () public payable {
        deposited[msg.sender] = msg.value;
    }
}
