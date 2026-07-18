#![no_std]
//! # Factory Contract
//!
//! The public entry point of StellarFund and the on-chain registry. End users
//! interact with the factory to create campaigns and to enumerate them; the
//! factory delegates to the [`Campaign`](../campaign) contract as the source
//! of truth and indexes ids for cheap discovery.
//!
//! Inter-contract map:
//! - `Factory` → `Campaign::register` (create)
//! - `Factory` keeps the id ↔ creator index and paginated lists.

use soroban_sdk::{contract, contractimpl, contracttype, vec, Address, Env, String, Vec};
use stellarfund_shared::Error;

mod interop;
use interop::CampaignClient;

#[contracttype]
enum DataKey {
    Config,
    /// All campaign ids in creation order.
    AllCampaigns,
    /// Campaign ids created by a given address.
    ByCreator(Address),
}

#[contracttype]
#[derive(Clone)]
pub struct Config {
    pub admin: Address,
    pub campaign: Address,
    pub treasury: Address,
}

#[contract]
pub struct FactoryContract;

#[contractimpl]
impl FactoryContract {
    /// Wire the factory to the campaign + treasury contracts it orchestrates.
    pub fn initialize(
        env: Env,
        admin: Address,
        campaign: Address,
        treasury: Address,
    ) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(
            &DataKey::Config,
            &Config {
                admin,
                campaign,
                treasury,
            },
        );
        env.storage()
            .instance()
            .set(&DataKey::AllCampaigns, &vec![&env] as &Vec<u64>);
        Ok(())
    }

    /// Create a campaign on behalf of `creator`. Requires the creator's auth,
    /// forwards to the campaign contract, and indexes the resulting id.
    pub fn create_campaign(
        env: Env,
        creator: Address,
        title: String,
        description: String,
        goal: i128,
        duration_secs: u64,
    ) -> Result<u64, Error> {
        creator.require_auth();
        let config = Self::load_config(&env)?;

        // Inter-contract call: delegate creation to the campaign contract.
        let campaign = CampaignClient::new(&env, &config.campaign);
        let id = campaign.register(&creator, &title, &description, &goal, &duration_secs);

        // Index globally and by creator.
        let mut all: Vec<u64> = env
            .storage()
            .instance()
            .get(&DataKey::AllCampaigns)
            .unwrap_or(vec![&env]);
        all.push_back(id);
        env.storage().instance().set(&DataKey::AllCampaigns, &all);

        let key = DataKey::ByCreator(creator.clone());
        let mut mine: Vec<u64> = env.storage().persistent().get(&key).unwrap_or(vec![&env]);
        mine.push_back(id);
        env.storage().persistent().set(&key, &mine);

        Ok(id)
    }

    /// All campaign ids, newest last.
    pub fn list_campaigns(env: Env) -> Vec<u64> {
        env.storage()
            .instance()
            .get(&DataKey::AllCampaigns)
            .unwrap_or(vec![&env])
    }

    /// Paginated slice of campaign ids for scalable frontends.
    pub fn list_paged(env: Env, start: u32, limit: u32) -> Vec<u64> {
        let all: Vec<u64> = env
            .storage()
            .instance()
            .get(&DataKey::AllCampaigns)
            .unwrap_or(vec![&env]);
        let mut out = vec![&env];
        let len = all.len();
        let mut i = start;
        while i < len && i < start + limit {
            out.push_back(all.get(i).unwrap());
            i += 1;
        }
        out
    }

    /// Campaign ids created by a specific address.
    pub fn campaigns_by(env: Env, creator: Address) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::ByCreator(creator))
            .unwrap_or(vec![&env])
    }

    /// Total registered campaigns.
    pub fn count(env: Env) -> u32 {
        let all: Vec<u64> = env
            .storage()
            .instance()
            .get(&DataKey::AllCampaigns)
            .unwrap_or(vec![&env]);
        all.len()
    }

    /// Read the factory configuration (addresses of orchestrated contracts).
    pub fn get_config(env: Env) -> Result<Config, Error> {
        Self::load_config(&env)
    }

    fn load_config(env: &Env) -> Result<Config, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Config)
            .ok_or(Error::NotInitialized)
    }
}

mod test;
