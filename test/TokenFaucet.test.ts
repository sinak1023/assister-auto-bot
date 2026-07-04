/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const DAY = 24 * 60 * 60;
const usdc = (n: string | number) => ethers.parseUnits(String(n), 8);
const cir = (n: string | number) => ethers.parseUnits(String(n), 8);

async function deploy() {
  const [owner, user] = await ethers.getSigners();
  const ERC20 = await ethers.getContractFactory("TestnetERC20");
  const usd = await ERC20.deploy("USD Coin", "USDC", 8);
  const btc = await ERC20.deploy("Circle BTC", "cirBTC", 8);

  const Faucet = await ethers.getContractFactory("TokenFaucet");
  const faucet = await Faucet.deploy(DAY);
  const faucetAddr = await faucet.getAddress();

  // Authorize the faucet to mint, and set fixed drip amounts.
  await usd.setMinter(faucetAddr, true);
  await btc.setMinter(faucetAddr, true);
  await faucet.setDrip(await usd.getAddress(), usdc(150));
  await faucet.setDrip(await btc.getAddress(), cir("0.01"));

  return { owner, user, usd, btc, faucet };
}

describe("TokenFaucet", () => {
  it("mints the fixed drip amount on claim", async () => {
    const { user, usd, btc, faucet } = await deploy();
    await faucet.connect(user).claim(await usd.getAddress());
    await faucet.connect(user).claim(await btc.getAddress());
    expect(await usd.balanceOf(user.address)).to.equal(usdc(150));
    expect(await btc.balanceOf(user.address)).to.equal(cir("0.01"));
  });

  it("enforces the per-wallet cooldown", async () => {
    const { user, usd, faucet } = await deploy();
    const token = await usd.getAddress();
    await faucet.connect(user).claim(token);
    await expect(faucet.connect(user).claim(token)).to.be.revertedWithCustomError(faucet, "CooldownActive");
    expect(await faucet.claimableIn(token, user.address)).to.be.gt(0n);

    await time.increase(DAY);
    await expect(faucet.connect(user).claim(token)).to.not.be.reverted;
    expect(await usd.balanceOf(user.address)).to.equal(usdc(300));
  });

  it("rejects unsupported tokens and blocks direct minting by users", async () => {
    const { user, usd, faucet } = await deploy();
    const ERC20 = await ethers.getContractFactory("TestnetERC20");
    const other = await ERC20.deploy("Other", "OTH", 8);
    await expect(faucet.connect(user).claim(await other.getAddress())).to.be.revertedWithCustomError(
      faucet,
      "TokenNotSupported",
    );
    // A user can't bypass the faucet by minting directly.
    await expect(usd.connect(user).allocateTo(user.address, usdc(1_000_000))).to.be.revertedWithCustomError(
      usd,
      "NotMinter",
    );
  });

  it("only the owner can configure drips and cooldown", async () => {
    const { user, usd, faucet } = await deploy();
    await expect(faucet.connect(user).setDrip(await usd.getAddress(), usdc(1))).to.be.revertedWith(
      "Ownable: caller is not the owner",
    );
    await expect(faucet.connect(user).setCooldown(1)).to.be.revertedWith("Ownable: caller is not the owner");
  });
});
