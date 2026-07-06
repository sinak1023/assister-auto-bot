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

"use client";

import { useState } from "react";
import Link from "next/link";
import { ConnectWallet } from "./wallet/ConnectWallet";

// Uses /public/logo.png when present; falls back to the ◈ mark otherwise.
function Logo() {
  const [ok, setOk] = useState(true);
  if (ok) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src="/logo.png" alt="LendArc" onError={() => setOk(false)} className="h-7 w-7 rounded-lg object-contain" />
    );
  }
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-inset ring-primary/25">
      ◈
    </span>
  );
}

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-white/[0.06] bg-background/70 backdrop-blur-xl">
      <div className="container mx-auto flex max-w-5xl flex-col gap-2 px-3 py-2 sm:h-14 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-4 sm:py-0">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <Logo />
          <span className="font-display text-base font-semibold tracking-tight sm:text-lg">LendArc</span>
        </Link>
        <ConnectWallet />
      </div>
    </nav>
  );
}
