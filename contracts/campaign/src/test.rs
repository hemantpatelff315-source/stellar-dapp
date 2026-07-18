#![cfg(test)]
extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    Address, Env, String as SdkString,
};
use stellarfund_treasury::{TreasuryContract, TreasuryContractClient};

struct World {
    env: Env,
    campaign: CampaignContractClient<'static>,
    treasury: TreasuryContractClient<'static>,
    token_admin: StellarAssetClient<'static>,
    token: TokenClient<'static>,
    factory: Address,
}

fn world() -> World {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let factory = Address::generate(&env);

    let issuer = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(issuer);
    let token = TokenClient::new(&env, &sac.address());
    let token_admin = StellarAssetClient::new(&env, &sac.address());

    let treasury_id = env.register(TreasuryContract, ());
    let campaign_id = env.register(CampaignContract, ());

    let treasury = TreasuryContractClient::new(&env, &treasury_id);
    // The Campaign contract is the authorised mover of treasury funds.
    treasury.initialize(&admin, &sac.address(), &campaign_id);

    let campaign = CampaignContractClient::new(&env, &campaign_id);
    campaign.initialize(&admin, &factory, &treasury_id);

    World {
        env,
        campaign,
        treasury,
        token_admin,
        token,
        factory,
    }
}

fn mint(w: &World, who: &Address, amount: i128) {
    w.token_admin.mint(who, &amount);
}

fn new_campaign(w: &World, creator: &Address, goal: i128, duration: u64) -> u64 {
    w.campaign.register(
        creator,
        &SdkString::from_str(&w.env, "Save the Reefs"),
        &SdkString::from_str(&w.env, "A campaign to restore coral reefs."),
        &goal,
        &duration,
    )
}

#[test]
fn test_register_creates_active_campaign() {
    let w = world();
    let creator = Address::generate(&w.env);
    let id = new_campaign(&w, &creator, 100_000_000, 86_400);
    let c = w.campaign.get_campaign(&id);
    assert_eq!(c.id, id);
    assert_eq!(c.goal, 100_000_000);
    assert_eq!(c.raised, 0);
    assert_eq!(c.status, CampaignStatus::Active);
}

#[test]
fn test_register_rejects_low_goal() {
    let w = world();
    let creator = Address::generate(&w.env);
    let res = w.campaign.try_register(
        &creator,
        &SdkString::from_str(&w.env, "x"),
        &SdkString::from_str(&w.env, "y"),
        &1,
        &86_400,
    );
    assert!(res.is_err());
}

#[test]
fn test_register_rejects_bad_duration() {
    let w = world();
    let creator = Address::generate(&w.env);
    let res = w.campaign.try_register(
        &creator,
        &SdkString::from_str(&w.env, "x"),
        &SdkString::from_str(&w.env, "y"),
        &100_000_000,
        &1,
    );
    assert!(res.is_err());
}

#[test]
fn test_donate_updates_raised_and_balance() {
    let w = world();
    let creator = Address::generate(&w.env);
    let donor = Address::generate(&w.env);
    mint(&w, &donor, 100_000_000);
    let id = new_campaign(&w, &creator, 100_000_000, 86_400);

    w.campaign.donate(&id, &donor, &40_000_000);
    let c = w.campaign.get_campaign(&id);
    assert_eq!(c.raised, 40_000_000);
    assert_eq!(c.donors_count, 1);
    assert_eq!(w.treasury.get_balance(&id), 40_000_000);
}

#[test]
fn test_donate_below_minimum_fails() {
    let w = world();
    let creator = Address::generate(&w.env);
    let donor = Address::generate(&w.env);
    mint(&w, &donor, 100_000_000);
    let id = new_campaign(&w, &creator, 100_000_000, 86_400);
    let res = w.campaign.try_donate(&id, &donor, &100);
    assert!(res.is_err());
}

#[test]
fn test_donate_tracks_unique_donors() {
    let w = world();
    let creator = Address::generate(&w.env);
    let d1 = Address::generate(&w.env);
    let d2 = Address::generate(&w.env);
    mint(&w, &d1, 100_000_000);
    mint(&w, &d2, 100_000_000);
    let id = new_campaign(&w, &creator, 200_000_000, 86_400);
    w.campaign.donate(&id, &d1, &10_000_000);
    w.campaign.donate(&id, &d1, &10_000_000);
    w.campaign.donate(&id, &d2, &10_000_000);
    assert_eq!(w.campaign.get_campaign(&id).donors_count, 2);
}

#[test]
fn test_goal_reached_marks_successful() {
    let w = world();
    let creator = Address::generate(&w.env);
    let donor = Address::generate(&w.env);
    mint(&w, &donor, 200_000_000);
    let id = new_campaign(&w, &creator, 100_000_000, 86_400);
    w.campaign.donate(&id, &donor, &100_000_000);
    assert_eq!(
        w.campaign.get_campaign(&id).status,
        CampaignStatus::Successful
    );
}

#[test]
fn test_withdraw_after_goal() {
    let w = world();
    let creator = Address::generate(&w.env);
    let donor = Address::generate(&w.env);
    mint(&w, &donor, 200_000_000);
    let id = new_campaign(&w, &creator, 100_000_000, 86_400);
    w.campaign.donate(&id, &donor, &120_000_000);

    let amount = w.campaign.withdraw(&id);
    assert_eq!(amount, 120_000_000);
    assert_eq!(w.token.balance(&creator), 120_000_000);
    assert_eq!(
        w.campaign.get_campaign(&id).status,
        CampaignStatus::Withdrawn
    );
}

#[test]
fn test_withdraw_before_goal_fails() {
    let w = world();
    let creator = Address::generate(&w.env);
    let donor = Address::generate(&w.env);
    mint(&w, &donor, 200_000_000);
    let id = new_campaign(&w, &creator, 100_000_000, 86_400);
    w.campaign.donate(&id, &donor, &10_000_000);
    let res = w.campaign.try_withdraw(&id);
    assert!(res.is_err());
}

#[test]
fn test_double_withdraw_fails() {
    let w = world();
    let creator = Address::generate(&w.env);
    let donor = Address::generate(&w.env);
    mint(&w, &donor, 200_000_000);
    let id = new_campaign(&w, &creator, 100_000_000, 86_400);
    w.campaign.donate(&id, &donor, &100_000_000);
    w.campaign.withdraw(&id);
    let res = w.campaign.try_withdraw(&id);
    assert!(res.is_err());
}

#[test]
fn test_refund_after_deadline_failure() {
    let w = world();
    let creator = Address::generate(&w.env);
    let donor = Address::generate(&w.env);
    mint(&w, &donor, 200_000_000);
    let id = new_campaign(&w, &creator, 100_000_000, 3_600);
    w.campaign.donate(&id, &donor, &30_000_000);

    // Advance past the deadline.
    w.env.ledger().with_mut(|l| l.timestamp += 7_200);

    let refunded = w.campaign.refund(&id, &donor);
    assert_eq!(refunded, 30_000_000);
    assert_eq!(w.token.balance(&donor), 200_000_000);
}

#[test]
fn test_refund_when_successful_fails() {
    let w = world();
    let creator = Address::generate(&w.env);
    let donor = Address::generate(&w.env);
    mint(&w, &donor, 200_000_000);
    let id = new_campaign(&w, &creator, 100_000_000, 3_600);
    w.campaign.donate(&id, &donor, &100_000_000);
    let res = w.campaign.try_refund(&id, &donor);
    assert!(res.is_err());
}

#[test]
fn test_double_refund_fails() {
    let w = world();
    let creator = Address::generate(&w.env);
    let donor = Address::generate(&w.env);
    mint(&w, &donor, 200_000_000);
    let id = new_campaign(&w, &creator, 100_000_000, 3_600);
    w.campaign.donate(&id, &donor, &30_000_000);
    w.env.ledger().with_mut(|l| l.timestamp += 7_200);
    w.campaign.refund(&id, &donor);
    let res = w.campaign.try_refund(&id, &donor);
    assert!(res.is_err());
}

#[test]
fn test_donate_after_deadline_fails() {
    let w = world();
    let creator = Address::generate(&w.env);
    let donor = Address::generate(&w.env);
    mint(&w, &donor, 200_000_000);
    let id = new_campaign(&w, &creator, 100_000_000, 3_600);
    w.env.ledger().with_mut(|l| l.timestamp += 7_200);
    let res = w.campaign.try_donate(&id, &donor, &10_000_000);
    assert!(res.is_err());
}

#[test]
fn test_close_marks_failed_and_enables_refund() {
    let w = world();
    let creator = Address::generate(&w.env);
    let donor = Address::generate(&w.env);
    mint(&w, &donor, 200_000_000);
    let id = new_campaign(&w, &creator, 100_000_000, 86_400);
    w.campaign.donate(&id, &donor, &20_000_000);
    w.campaign.close(&id);
    assert_eq!(w.campaign.get_campaign(&id).status, CampaignStatus::Failed);
    let refunded = w.campaign.refund(&id, &donor);
    assert_eq!(refunded, 20_000_000);
}

#[test]
fn test_donation_history_recorded() {
    let w = world();
    let creator = Address::generate(&w.env);
    let donor = Address::generate(&w.env);
    mint(&w, &donor, 200_000_000);
    let id = new_campaign(&w, &creator, 100_000_000, 86_400);
    w.campaign.donate(&id, &donor, &10_000_000);
    w.campaign.donate(&id, &donor, &15_000_000);
    let history = w.campaign.get_donations(&id);
    assert_eq!(history.len(), 2);
    assert_eq!(history.get(0).unwrap().amount, 10_000_000);
    assert_eq!(history.get(1).unwrap().amount, 15_000_000);
}

#[test]
fn test_get_contribution() {
    let w = world();
    let creator = Address::generate(&w.env);
    let donor = Address::generate(&w.env);
    mint(&w, &donor, 200_000_000);
    let id = new_campaign(&w, &creator, 100_000_000, 86_400);
    w.campaign.donate(&id, &donor, &12_000_000);
    assert_eq!(w.campaign.get_contribution(&id, &donor), 12_000_000);
}
