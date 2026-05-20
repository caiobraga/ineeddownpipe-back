# BMW downpipe sources (US market)

Research summary for **iNeedDownpipe** — ranked for catalog quality and scrape reliability.

| Priority | Retailer | Why | Scrape method |
|----------|----------|-----|----------------|
| 1 | [BimmerWorld](https://www.bimmerworld.com/Exhaust/Downpipes/) | Dedicated downpipe category, BMW-focused, real fitment titles | HTTP fetch (reliable) |
| 2 | [IND Distribution](https://ind-distribution.com/) | High-end BMW aftermarket; Shopify `.js` API | HTTP fetch (works) |
| 2b | [ARM Motorsports](https://armmotorsports.com/) | Popular downpipe brand; Shopify | HTTP fetch (works) |
| — | [ECS Tuning](https://www.ecstuning.com/) | Blocked by Cloudflare in headless scrape | Not integrated |
| 3 | [Turner Motorsport](https://www.turnermotorsport.com/c-807-bmw-downpipes) | Strong BMW performance brand, downpipe category | Playwright (Cloudflare) |
| 4 | [FCP Euro](https://www.fcpeuro.com/) | OEM + aftermarket BMW parts, good search | Playwright |
| 5 | [Amazon](https://www.amazon.com/) | Broad marketplace; noisy listings — strict title filter required | Playwright |
| 6 | [Dinan Cars](https://www.dinancars.com/) | OEM-adjacent; few products named “downpipe” | Playwright (Cloudflare) |

### Not included (yet)

- **MAPerformance / Vivid Racing** — heavy bot protection
- **eBay** — API/partner program needed for stable access
- **Turn14 / distribution** — B2B, not consumer listings

### Product filter

Only titles that contain **downpipe** (and pass exclusion list for clamps, gaskets, hoses, midpipes, etc.) are stored.
