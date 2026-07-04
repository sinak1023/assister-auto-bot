// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TestnetERC20
 * @notice A mintable ERC20 for testnet use. Minting is gated to authorized
 *         minters (the deployer and the {TokenFaucet}) so the faucet's
 *         per-wallet limits actually mean something — users can't bypass them
 *         by calling allocateTo directly.
 */
contract TestnetERC20 is ERC20, Ownable {
    uint8 private _decimals;
    mapping(address => bool) public isMinter;

    error NotMinter();

    event MinterSet(address indexed minter, bool allowed);

    constructor(string memory name, string memory symbol, uint8 decimals_) ERC20(name, symbol) {
        _decimals = decimals_;
        isMinter[msg.sender] = true; // deployer can mint (pool seeding, tests)
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Authorize or revoke a minter (e.g. the faucet contract).
    function setMinter(address minter, bool allowed) external onlyOwner {
        isMinter[minter] = allowed;
        emit MinterSet(minter, allowed);
    }

    /// @notice Mint `value` tokens to `to`. Restricted to authorized minters.
    function allocateTo(address to, uint256 value) external {
        if (!isMinter[msg.sender]) revert NotMinter();
        _mint(to, value);
    }
}
