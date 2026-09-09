package taxonomy

// RefineListing applies title-based leaf corrections after path mapping or LLM
// classify. Call this instead of chaining individual refiners at ingest sites.
func RefineListing(canonical []string, productName string) []string {
	return RefineBrakes(RefineWheelsTires(canonical, productName), productName)
}
