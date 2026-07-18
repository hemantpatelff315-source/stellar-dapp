//! Typed clients for the contracts this contract calls into.
//!
//! We declare the *interface* of the Treasury here with `#[contractclient]`
//! rather than depending on the treasury crate's `#[contractimpl]` directly.
//! That keeps the treasury's exported wasm symbols out of the campaign wasm
//! (avoiding duplicate-symbol link errors) while still giving us a fully
//! typed, checked client for the inter-contract call.

use soroban_sdk::{contractclient, Address, Env};

#[contractclient(name = "TreasuryClient")]
pub trait TreasuryInterface {
    fn deposit(env: Env, campaign_id: u64, from: Address, amount: i128) -> i128;
    fn release(env: Env, campaign_id: u64, to: Address) -> i128;
    fn refund(env: Env, campaign_id: u64, to: Address, amount: i128) -> i128;
    fn get_balance(env: Env, campaign_id: u64) -> i128;
}
