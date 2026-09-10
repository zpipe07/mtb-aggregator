package taxonomy

// RefineListing applies title-based leaf corrections after path mapping or LLM
// classify (wheels/tires, brakes, then apparel vs Bikes). Call this instead of
// chaining individual refiners at ingest sites.
func RefineListing(canonical []string, productName string) []string {
	return RefineApparel(RefineBrakes(RefineWheelsTires(canonical, productName), productName), productName)
}
