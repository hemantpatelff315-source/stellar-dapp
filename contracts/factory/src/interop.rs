//! Typed client for the Campaign contract that the factory orchestrates.
//!
//! Declared as an interface (`#[contractclient]`) so the campaign contract's
//! exported wasm symbols do not leak into the factory wasm.

use soroban_sdk::{contractclient, Address, Env, String};

#[contractclient(name = "CampaignClient")]
pub trait CampaignInterface {
    fn register(
        env: Env,
        creator: Address,
        title: String,
        description: String,
        goal: i128,
        duration_secs: u64,
    ) -> u64;
}
