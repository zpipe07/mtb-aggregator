/**
 * Load .env before any other app code runs, so BROWSER_WS_ENDPOINT etc. are set
 * when browser.ts and other modules read process.env.
 * Tries cwd (e.g. apps/scraper) then monorepo root.
 */
import dotenv from "dotenv";
import { join } from "path";

dotenv.config();
dotenv.config({ path: join(process.cwd(), "../../.env") });
