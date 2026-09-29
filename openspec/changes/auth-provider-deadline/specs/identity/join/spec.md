## ADDED Requirements

### Requirement: A join whose account creation went unanswered leaves no account behind

When the identity provider does not answer the request that creates the joiner's account (identity
`provider-calls`: an unknown outcome), the application SHALL remove any account that request may
have created before it reports the failure. It SHALL NOT send the creation again. The joiner SHALL
see the same failure text as any other failed join. The invitation SHALL stay unspent, as for every
join that does not complete. The address the joiner gave, or the invited profile's own, SHALL then
be usable again: a retry SHALL NOT be refused as an address already in use.

The same holds for registering a household: an unanswered account creation leaves no account
behind, and the address can be registered again.

If removing the account also gets no answer, the failure SHALL be logged. The joiner still sees the
ordinary failure text.

#### Scenario: The account creation reached the provider but its answer was lost
- **WHEN** a joiner submits, the provider creates the account, and its answer never arrives
- **THEN** the joiner sees the ordinary failure text, no account for them exists at the provider,
  and the invitation is not spent
- **AND** submitting again with the same details joins them

#### Scenario: A lost answer at registration
- **WHEN** a household registers, the provider creates the account, and its answer never arrives
- **THEN** the registration fails, no account exists for that address, and registering again with
  the same address succeeds
