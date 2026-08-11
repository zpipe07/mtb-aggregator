package db

// touchVariantSiblingsLastScrapedSQL refreshes last_scraped on variant rows whose parent
// was upserted during the current scrape. Without this, HideStaleListings hides UC
// variant siblings created by PDP enrichment (ZAC-196).
const touchVariantSiblingsLastScrapedSQL = `
		UPDATE store_listings child
		SET last_scraped = NOW()
		FROM store_listings parent
		WHERE child.store_id = $1
		  AND child.store_id = parent.store_id
		  AND child.store_sku LIKE '%-%'
		  AND parent.store_sku NOT LIKE '%-%'
		  AND child.store_sku LIKE parent.store_sku || '-%'
		  AND parent.last_scraped >= $2
		  AND child.last_scraped < $2
	`

func touchVariantSiblingsLastScrapedSQLString() string {
	return touchVariantSiblingsLastScrapedSQL
}

// hideStaleListingsSQL hides listings not re-confirmed by the most recent scrape.
const hideStaleListingsSQL = `
		UPDATE store_listings
		SET hidden = true
		WHERE store_id = $1
		  AND hidden = false
		  AND last_scraped < $2
	`

func hideStaleListingsSQLString() string {
	return hideStaleListingsSQL
}
