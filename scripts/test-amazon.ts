import "dotenv/config";
import { chromium } from "playwright";
import { scrapeAmazon } from "../src/scrapers/amazon.js";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const items = await scrapeAmazon(page);
console.log("amazon filtered:", items.length);
items.slice(0, 8).forEach((p) => console.log("-", p.title.slice(0, 72), p.price));
await browser.close();
