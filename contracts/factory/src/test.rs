#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::Address as _, token::StellarAssetClient, Address, Env, String as SdkString,
};
use stellarfund_campaign::{CampaignContract, CampaignContractClient};
use stellarfund_treasury::{TreasuryContract, TreasuryContractClient};

struct World {
    env: Env,
    factory: FactoryContractClient<'static>,
    campaign: CampaignContractClient<'static>,
    treasury: TreasuryContractClient<'static>,
    token_admin: StellarAssetClient<'static>,
}

fn world() -> World {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);

    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let token_admin = StellarAssetClient::new(&env, &sac.address());

    let treasury_id = env.register(TreasuryContract, ());
    let campaign_id = env.register(CampaignContract, ());
    let factory_id = env.register(FactoryContract, ());

    let treasury = TreasuryContractClient::new(&env, &treasury_id);
    let campaign = CampaignContractClient::new(&env, &campaign_id);
    let factory = FactoryContractClient::new(&env, &factory_id);

    // The Campaign contract is the authorised mover of treasury funds.
    treasury.initialize(&admin, &sac.address(), &campaign_id);
    campaign.initialize(&admin, &factory_id, &treasury_id);
    factory.initialize(&admin, &campaign_id, &treasury_id);

    World {
        env,
        factory,
        campaign,
        treasury,
        token_admin,
    }
}

fn create(w: &World, creator: &Address) -> u64 {
    w.factory.create_campaign(
        creator,
        &SdkString::from_str(&w.env, "Open Source Fund"),
        &SdkString::from_str(&w.env, "Funding maintainers."),
        &100_000_000,
        &86_400,
    )
}

#[test]
fn test_factory_creates_and_indexes() {
    let w = world();
    let creator = Address::generate(&w.env);
    let id = create(&w, &creator);
    assert_eq!(id, 1);
    assert_eq!(w.factory.count(), 1);
    assert_eq!(w.factory.list_campaigns().len(), 1);
}

#[test]
fn test_factory_campaign_readable_via_campaign_contract() {
    let w = world();
    let creator = Address::generate(&w.env);
    let id = create(&w, &creator);
    let c = w.campaign.get_campaign(&id);
    assert_eq!(c.creator, creator);
    assert_eq!(c.goal, 100_000_000);
}

#[test]
fn test_factory_by_creator_index() {
    let w = world();
    let a = Address::generate(&w.env);
    let b = Address::generate(&w.env);
    create(&w, &a);
    create(&w, &a);
    create(&w, &b);
    assert_eq!(w.factory.campaigns_by(&a).len(), 2);
    assert_eq!(w.factory.campaigns_by(&b).len(), 1);
}

#[test]
fn test_factory_pagination() {
    let w = world();
    let creator = Address::generate(&w.env);
    for _ in 0..5 {
        create(&w, &creator);
    }
    let page = w.factory.list_paged(&1, &2);
    assert_eq!(page.len(), 2);
    assert_eq!(page.get(0).unwrap(), 2);
    assert_eq!(page.get(1).unwrap(), 3);
}

#[test]
fn test_end_to_end_donate_and_withdraw_via_factory() {
    let w = world();
    let creator = Address::generate(&w.env);
    let donor = Address::generate(&w.env);
    w.token_admin.mint(&donor, &200_000_000);

    let id = create(&w, &creator);
    w.campaign.donate(&id, &donor, &100_000_000);
    assert_eq!(w.treasury.get_balance(&id), 100_000_000);

    let amount = w.campaign.withdraw(&id);
    assert_eq!(amount, 100_000_000);
    assert_eq!(w.treasury.get_balance(&id), 0);
}

#[test]
fn test_factory_get_config() {
    let w = world();
    let cfg = w.factory.get_config();
    assert_eq!(cfg.campaign, w.campaign.address);
    assert_eq!(cfg.treasury, w.treasury.address);
}
