// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.28;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

contract Faucet {
    address public owner;
    
    mapping(address => mapping(address => uint256)) public lastClaimed;
    mapping(address => uint256) public faucetAmounts;
    
    uint256 public constant COOLDOWN = 24 hours;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setFaucetAmount(address token, uint256 amount) external onlyOwner {
        faucetAmounts[token] = amount;
    }

    function claim(address token) external {
        uint256 amount = faucetAmounts[token];
        require(amount > 0, "Token not supported");
        require(block.timestamp >= lastClaimed[token][msg.sender] + COOLDOWN, "Cooldown not elapsed");
        
        lastClaimed[token][msg.sender] = block.timestamp;
        require(IERC20(token).transfer(msg.sender, amount), "Transfer failed");
    }

    function getLastClaimed(address token, address user) external view returns (uint256) {
        return lastClaimed[token][user];
    }
}
