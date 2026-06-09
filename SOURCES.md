# BMW downpipe sources (US + Brazil)

Research summary for **iNeedDownpipe** — ranked for catalog quality and scrape reliability.

| Priority | Retailer | Why | Scrape method |
|----------|----------|-----|----------------|
| 1 | [BimmerWorld](https://www.bimmerworld.com/Exhaust/Downpipes/) | Dedicated downpipe category, BMW-focused, real fitment titles | HTTP fetch (reliable) |
| 2 | [IND Distribution](https://ind-distribution.com/) | High-end BMW aftermarket; Shopify suggest API | HTTP fetch (works) |
| 2b | [ARM Motorsports](https://armmotorsports.com/) | Popular downpipe brand; Shopify | HTTP fetch (works) |
| 3 | [Amazon](https://www.amazon.com/) | Broad marketplace; often blocks datacenter IPs (AWS/ECS) — keeps prior cache on failure | Playwright |
| 4 | [Nova Racing](https://www.novaracing.com.br/downpipes) | Brazilian BMW downpipes (BRL); Loja Integrada | HTTP fetch |
| 4b | [Turbo Brothers](https://www.turbobrothers.com.br/downpipe) | Brazilian BMW downpipes (BRL); Loja Integrada | HTTP fetch |
| 5 | [EuroSport Tuning](https://eurosporttuning.com/exhaust/downpipe/) | BigCommerce downpipe category; BMW/MINI filtered | HTTP fetch |
| 6 | [VRSF](https://www.vr-speed.com/) | WooCommerce Store API (`/wp-json/wc/store/v1/products`); exhaust category + search | HTTP fetch |

### Skipped (Cloudflare challenge / bot block)

These US retailers sit behind Cloudflare or similar bot protection that blocks reliable server-side scraping from AWS/ECS:

- ECS Tuning, FCP Euro, Dinan Cars, Turner Motorsport, MAPerformance, Active Autowerke, VRSF, Evolution Racewerks, R44 Performance, Vivid Racing, CTS Turbo

### Product filter

Only titles that contain **downpipe** (and pass exclusion list for clamps, gaskets, hoses, midpipes, etc.) are stored.
