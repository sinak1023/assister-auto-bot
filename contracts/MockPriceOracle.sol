// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IPriceOracle.sol";

/**
 * @title MockPriceOracle
 * @notice Owner-controlled price feed for testnet demos.
 *
 * @dev Arc Testnet has no live cirBTC/USD feed, so this stand-in lets the
 *      owner set an initial price and nudge it during a demo — which is what
 *      makes a position visibly slide toward liquidation in real time. It
 *      implements {IPriceOracle}, so on mainnet it can be replaced by a
 *      Chainlink adapter with zero changes to {LendingBorrowingV2}.
 *
 *      The price is the USD value of ONE whole collateral token, scaled by
 *      10**decimals(). With 8 decimals, $100,000 is passed as 100000 * 1e8.
 */
contract MockPriceOracle is IPriceOracle, Ownable {
    /// @dev Thrown when a zero price is supplied.
    error InvalidPrice();

    uint8 private immutable _decimals;
    uint256 private _price;

    /// @notice Emitted whenever the owner updates the price.
    /// @param previousPrice The price before the update.
    /// @param newPrice The price after the update.
    event PriceUpdated(uint256 previousPrice, uint256 newPrice);

    /**
     * @param initialPrice Starting price (USD per whole token, scaled by 10**decimals_).
     * @param decimals_ Number of decimals the price is scaled by (use 8 to mirror Chainlink USD feeds).
     */
    constructor(uint256 initialPrice, uint8 decimals_) {
        if (initialPrice == 0) revert InvalidPrice();
        _decimals = decimals_;
        _price = initialPrice;
        emit PriceUpdated(0, initialPrice);
    }

    /// @inheritdoc IPriceOracle
    function getPrice() external view override returns (uint256) {
        return _price;
    }

    /// @inheritdoc IPriceOracle
    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Update the collateral price. Testnet/demo only.
     * @param newPrice New price (USD per whole token, scaled by 10**decimals()).
     */
    function setPrice(uint256 newPrice) external onlyOwner {
        if (newPrice == 0) revert InvalidPrice();
        uint256 previous = _price;
        _price = newPrice;
        emit PriceUpdated(previous, newPrice);
    }
}
