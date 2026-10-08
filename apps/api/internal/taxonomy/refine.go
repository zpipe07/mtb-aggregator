package taxonomy

// RefineListing applies title-based leaf corrections after path mapping or LLM
// classify (wheels/tires, brakes, apparel vs Bikes, gloves vs Clothing, then Electric bleed).
// Call this instead of chaining individual refiners at ingest sites.
func RefineListing(canonical []string, productName string) []string {
	return RefineElectric(RefineGloves(RefineApparel(RefineBrakes(RefineWheelsTires(canonical, productName), productName), productName), productName), productName)
}
