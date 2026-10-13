# User guide

FlightPilot currently runs in either **SIMULATION** or **DUFFEL TEST** mode. Neither gives a travel-valid ticket. Simulation uses fabricated fares and schedules; Duffel test uses the supplier's sandbox. Do not make real travel plans from either environment.

## Connect your workspace

Run the commands in [README](../README.md), keep `pnpm dev` running, then open the local web address. Read the access token privately from the ignored `.env` and paste it into the sign-in form. Do not paste the token, identity documents or payment details into an AI conversation.

Run `pnpm setup:agents` in an interactive terminal to connect Codex or Claude Code. Approve a client configuration change only when the displayed paths identify this checkout. Restart the client and use `/mcp` to confirm its connection. You can also use the web search form without an AI client.

## Find and compare flights

Provide origin, destination, an explicit future travel date/year, the number of adults, and each child's or infant's exact age on the travel date. Include checked-bag requirements, maximum stops, connection preferences and a total party budget if desired.

Ambiguous cities need a specific airport. For example, Goa can mean GOI or GOX. The built-in directory is limited; an unknown location does not trigger a guessed airport. It is not a nearby-airport search service.

The three recommendation categories answer different questions:

| Category           | Meaning                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------- |
| Cheapest suitable  | Lowest known comparable total among returned offers meeting your constraints                  |
| Best overall value | Lowest configured penalty for price, duration, stops, timing, restrictions and transfer risks |
| Fastest suitable   | Shortest total journey time among suitable returned offers                                    |

One offer can win more than one category. Read the explanations and exclusions. If baggage entitlement or a required extra cost is unknown, FlightPilot does not assume it is free. If the provider currency differs from your requested currency, there is no automatic FX estimate; change your preference to the actual quoted currency if appropriate.

The conversational `find_cheapest_dates` tool searches at most seven dates around the supplied departure. For return/multi-city requests it shifts every slice by the same offset, preserving trip length. Ordinary `search_flights` searches the specified dates. Its optional `flexibleDays` setting authorizes up to three days either side (at most seven actual searches); no prices are interpolated. Bounded searches shift all itinerary dates together.

## Review and approve

1. Select an offer or ask the assistant to prepare checkout.
2. Open the returned FlightPilot checkout link and sign in if required.
3. Review the itinerary, all-traveller total, baggage and known fare conditions.
4. Use fictional traveller details in these test environments. The dates of birth must match the searched ages on every journey date. If a birthday changes an age across the trip, search separate journeys.
5. Tick the explicit approval checkbox and press the approval button yourself.

Preparing a link never books or charges. Approval refreshes the fare again. If details change, review the new version and approve again. An expired offer requires a fresh search. No credit card, CVV, OTP or passport upload is collected by this build.

Passport-required offers and separately purchased baggage are currently unsupported. Choose a supported test fare with included baggage. Seated infants are available in the local simulator but are not implemented in the Duffel adapter.

## Understand the result

| Status              | What to do                                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------- |
| Reserved            | A reservation exists; it is not evidence of ticket issuance                                                |
| Pending             | Wait and refresh provider status; do not submit another order                                              |
| Confirmed           | Booking confirmation exists, but issued tickets have not been verified                                     |
| Ticketed            | Provider/test documents indicate issuance in the stated environment; test tickets are not valid for travel |
| Cancelled           | The provider reports cancellation; refund handling is separate                                             |
| Failed              | Read the stated failure/recovery instructions before making another selection                              |
| Unknown / uncertain | Do not retry the purchase; reconcile the attempt with the supplier/operator                                |

Use **My bookings** or `get_booking_status` to refresh saved status. If an uncertain attempt has no provider ID, automatic status polling cannot locate it. Keep the checkout ID and consult the supplier dashboard/support; this MVP has no automated operator reconciliation console.

For local testing, the checkout's **Simulation scenario** menu offers successful issuance, decline, timeout and pending outcomes. These controls never contact a payment service. A pending simulation can progress when status is refreshed. Synthetic references are visibly marked and must never be presented as real PNRs.

## Troubleshooting

- Run `pnpm run doctor` after starting the backend. A valid-looking test token does not establish actual supplier access.
- If the assistant cannot connect, restart it and inspect `/mcp`; then review [agent installation](agent-installation.md).
- If checkout says the price changed, reload/review and give new approval. Repeated clicks do not override the consent check.
- If required baggage leaves no suitable offers, change dates/provider selection or choose an inclusive fare; the app cannot sell extra services yet.
- If a provider call fails, preserve its error code/request ID. Never include traveller identity or secrets in diagnostic messages.

For future real travel, independently verify visa and entry requirements using official government sources. FlightPilot does not decide eligibility to enter a country.
