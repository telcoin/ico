pragma solidity ^0.4.15;

import './lib/SafeMath.sol';

contract PreSaleToken {
    using SafeMath for uint256;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event Mint(address indexed to, uint256 amount);
    event Burn(address indexed from, uint256 amount);
    event MintFinished();
    event Transfer(address indexed from, address indexed to, uint256 value);

    uint256 public totalSupply;
    mapping(address => uint256) balances;
    bool public mintingFinished = false;
    address public owner;

    modifier onlyOwner() {
      require(msg.sender == owner);
      _;
    }

    function PreSaleToken() {
        owner = msg.sender;
    }

    function mint(address _to, uint256 _amount) onlyOwner public returns (bool) {
        require(!mintingFinished);

        totalSupply = totalSupply.add(_amount);
        balances[_to] = balances[_to].add(_amount);
        Mint(_to, _amount);
        Transfer(0x0, _to, _amount);

        return true;
    }

    function burn(address _from, uint256 _amount) onlyOwner public returns (bool) {
        require(!mintingFinished);
        require(_amount > 0);
        require(_amount <= balances[_from]);

        totalSupply = totalSupply.sub(_amount);
        balances[_from] = balances[_from].sub(_amount);
        Burn(_from, _amount);
        Transfer(_from, 0x0, _amount);

        return true;
    }

    function finishMinting() onlyOwner public returns (bool) {
        require(!mintingFinished);

        mintingFinished = true;
        MintFinished();

        return true;
    }

    function transferOwnership(address _to) onlyOwner public {
      require(_to != address(0));
      OwnershipTransferred(owner, _to);
      owner = _to;
    }

    function balanceOf(address _owner) public constant returns (uint256) {
        return balances[_owner];
    }
}
