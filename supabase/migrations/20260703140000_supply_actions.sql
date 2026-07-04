-- Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.
--
-- SPDX-License-Identifier: Apache-2.0

-- The supply side adds two more user actions: supplying liquidity to earn yield
-- and withdrawing it. Widen the action check constraint accordingly.

alter table public.transactions
  drop constraint if exists transactions_action_check;

alter table public.transactions
  add constraint transactions_action_check
  check (action in (
    'deposit', 'withdraw', 'borrow', 'repay',
    'mint_usdc', 'mint_cirbtc', 'open', 'liquidate',
    'supply', 'withdraw_supply'
  ));
