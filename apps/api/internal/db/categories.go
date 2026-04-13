package db

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/lib/pq"
)

// Category is one row in the categories table.
type Category struct {
	ID          int    `json:"id"`
	Slug        string `json:"slug"`
	Name        string `json:"name"`
	ParentID    *int   `json:"parent_id,omitempty"`
	SortOrder   int    `json:"sort_order"`
	Depth       int    `json:"depth"`
	Description string `json:"description"`
	CreatedAt   string `json:"created_at,omitempty"`
	UpdatedAt   string `json:"updated_at,omitempty"`
}

// CategoryPathWithDescription is one valid LLM path (root to leaf) with the leaf node's classification hint.
type CategoryPathWithDescription struct {
	Path        []string
	Description string
}

// CategoryTreeNode is a category with nested children for API response.
// DealCount is the number of in-stock, visible listings in this category or any descendant
// (same subtree semantics as GET /deals?category_slug= without variant grouping).
// ProductCount is distinct product groups in that subtree (same semantics as GET /deals?group_variants=true&category_slug=).
type CategoryTreeNode struct {
	Category
	DealCount    int                `json:"deal_count"`
	ProductCount int                `json:"product_count"`
	Children     []CategoryTreeNode `json:"children,omitempty"`
}

// ListCategories returns all categories flat, ordered by depth, then sort_order, then id.
func (db *DB) ListCategories(ctx context.Context) ([]Category, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT id, slug, name, parent_id, sort_order, depth, COALESCE(description, ''), created_at::text, updated_at::text
		FROM categories
		ORDER BY depth, sort_order, id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []Category
	for rows.Next() {
		var c Category
		var parentID *int
		if err := rows.Scan(&c.ID, &c.Slug, &c.Name, &parentID, &c.SortOrder, &c.Depth, &c.Description, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		c.ParentID = parentID
		list = append(list, c)
	}
	return list, rows.Err()
}

// ListCategoriesTree returns the category hierarchy as a nested tree with deal_count and product_count per node.
func (db *DB) ListCategoriesTree(ctx context.Context) ([]CategoryTreeNode, error) {
	list, err := db.ListCategories(ctx)
	if err != nil {
		return nil, err
	}
	counts, err := db.categorySubtreeDealCounts(ctx)
	if err != nil {
		return nil, err
	}
	productCounts, err := db.categorySubtreeProductCounts(ctx)
	if err != nil {
		return nil, err
	}
	tree := buildCategoryTree(list, nil)
	annotateCategoryTreeDealCounts(tree, counts)
	annotateCategoryTreeProductCounts(tree, productCounts)
	return tree, nil
}

// categorySubtreeDealCounts returns, for each category id, the count of listings with
// category_id in that category's subtree (including self), in stock and not hidden.
func (db *DB) categorySubtreeDealCounts(ctx context.Context) (map[int]int, error) {
	rows, err := db.pool.Query(ctx, `
		WITH RECURSIVE descendants AS (
			SELECT id AS root_id, id AS cat_id FROM categories
			UNION ALL
			SELECT d.root_id, c.id
			FROM categories c
			INNER JOIN descendants d ON c.parent_id = d.cat_id
		),
		listing_counts AS (
			SELECT category_id, COUNT(*)::int AS cnt
			FROM store_listings
			WHERE is_in_stock = true AND hidden = false AND category_id IS NOT NULL
			GROUP BY category_id
		)
		SELECT d.root_id, COALESCE(SUM(lc.cnt), 0)::int
		FROM descendants d
		LEFT JOIN listing_counts lc ON lc.category_id = d.cat_id
		GROUP BY d.root_id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[int]int)
	for rows.Next() {
		var id, cnt int
		if err := rows.Scan(&id, &cnt); err != nil {
			return nil, err
		}
		out[id] = cnt
	}
	return out, rows.Err()
}

// categorySubtreeProductCounts returns, for each category id, the count of distinct product groups
// (COALESCE(product_group_key, 'single:'||id)) for in-stock, visible listings whose category_id
// lies in that category's subtree — matching GET /deals with group_variants=true.
func (db *DB) categorySubtreeProductCounts(ctx context.Context) (map[int]int, error) {
	rows, err := db.pool.Query(ctx, `
		WITH RECURSIVE descendants AS (
			SELECT id AS root_id, id AS cat_id FROM categories
			UNION ALL
			SELECT d.root_id, c.id
			FROM categories c
			INNER JOIN descendants d ON c.parent_id = d.cat_id
		),
		grouped AS (
			SELECT d.root_id,
				COALESCE(l.product_group_key, 'single:' || l.id::text) AS gk
			FROM descendants d
			INNER JOIN store_listings l ON l.category_id = d.cat_id
			WHERE l.is_in_stock = true AND l.hidden = false
		)
		SELECT root_id, COUNT(DISTINCT gk)::int
		FROM grouped
		GROUP BY root_id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[int]int)
	for rows.Next() {
		var id, cnt int
		if err := rows.Scan(&id, &cnt); err != nil {
			return nil, err
		}
		out[id] = cnt
	}
	return out, rows.Err()
}

func annotateCategoryTreeDealCounts(nodes []CategoryTreeNode, counts map[int]int) {
	for i := range nodes {
		nodes[i].DealCount = counts[nodes[i].ID]
		if len(nodes[i].Children) > 0 {
			annotateCategoryTreeDealCounts(nodes[i].Children, counts)
		}
	}
}

func annotateCategoryTreeProductCounts(nodes []CategoryTreeNode, counts map[int]int) {
	for i := range nodes {
		nodes[i].ProductCount = counts[nodes[i].ID]
		if len(nodes[i].Children) > 0 {
			annotateCategoryTreeProductCounts(nodes[i].Children, counts)
		}
	}
}

func buildCategoryTree(list []Category, parentID *int) []CategoryTreeNode {
	var nodes []CategoryTreeNode
	for _, c := range list {
		var match bool
		if parentID == nil {
			match = c.ParentID == nil
		} else {
			match = c.ParentID != nil && *c.ParentID == *parentID
		}
		if !match {
			continue
		}
		pid := &c.ID
		node := CategoryTreeNode{Category: c, Children: buildCategoryTree(list, pid)}
		nodes = append(nodes, node)
	}
	return nodes
}

// GetCategoryByID returns a category by id, or nil if not found.
func (db *DB) GetCategoryByID(ctx context.Context, id int) (*Category, error) {
	var c Category
	var parentID *int
	err := db.pool.QueryRow(ctx, `
		SELECT id, slug, name, parent_id, sort_order, depth, COALESCE(description, ''), created_at::text, updated_at::text
		FROM categories WHERE id = $1
	`, id).Scan(&c.ID, &c.Slug, &c.Name, &parentID, &c.SortOrder, &c.Depth, &c.Description, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		if err.Error() == "no rows in result set" {
			return nil, nil
		}
		return nil, err
	}
	c.ParentID = parentID
	return &c, nil
}

// GetCategoryBySlug returns a category by slug, or nil if not found.
func (db *DB) GetCategoryBySlug(ctx context.Context, slug string) (*Category, error) {
	var c Category
	var parentID *int
	err := db.pool.QueryRow(ctx, `
		SELECT id, slug, name, parent_id, sort_order, depth, COALESCE(description, ''), created_at::text, updated_at::text
		FROM categories WHERE slug = $1
	`, slug).Scan(&c.ID, &c.Slug, &c.Name, &parentID, &c.SortOrder, &c.Depth, &c.Description, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		if err.Error() == "no rows in result set" {
			return nil, nil
		}
		return nil, err
	}
	c.ParentID = parentID
	return &c, nil
}

// CreateCategory inserts a category and returns its id.
func (db *DB) CreateCategory(ctx context.Context, slug, name string, parentID *int, sortOrder int, description string) (int, error) {
	depth := 0
	if parentID != nil {
		parent, err := db.GetCategoryByID(ctx, *parentID)
		if err != nil {
			return 0, err
		}
		if parent == nil {
			return 0, fmt.Errorf("parent category not found")
		}
		depth = parent.Depth + 1
	}
	var id int
	err := db.pool.QueryRow(ctx, `
		INSERT INTO categories (slug, name, parent_id, sort_order, depth, description) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id
	`, slug, name, parentID, sortOrder, depth, description).Scan(&id)
	return id, err
}

// UpdateCategory updates a category by id.
func (db *DB) UpdateCategory(ctx context.Context, id int, slug, name string, sortOrder int, description string) error {
	_, err := db.pool.Exec(ctx, `
		UPDATE categories SET slug = $1, name = $2, sort_order = $3, description = $4, updated_at = NOW() WHERE id = $5
	`, slug, name, sortOrder, description, id)
	return err
}

// DeleteCategory deletes a category by id. Fails if it has children or is referenced.
func (db *DB) DeleteCategory(ctx context.Context, id int) error {
	var childCount int
	if err := db.pool.QueryRow(ctx, `SELECT COUNT(*) FROM categories WHERE parent_id = $1`, id).Scan(&childCount); err != nil {
		return err
	}
	if childCount > 0 {
		return fmt.Errorf("cannot delete category with %d children", childCount)
	}
	_, err := db.pool.Exec(ctx, `DELETE FROM categories WHERE id = $1`, id)
	return err
}

// ResolveCategoryIDFromPath returns the category ID whose path (root to node names) matches the given array, or nil if not found.
func (db *DB) ResolveCategoryIDFromPath(ctx context.Context, path []string) (*int, error) {
	if len(path) == 0 {
		return nil, nil
	}
	var id int
	err := db.pool.QueryRow(ctx, `
		WITH RECURSIVE cat_tree(id, path) AS (
			SELECT id, (ARRAY[name])::text[] FROM categories WHERE parent_id IS NULL
			UNION ALL
			SELECT c.id, (ct.path || c.name)::text[]
			FROM categories c JOIN cat_tree ct ON c.parent_id = ct.id
		)
		SELECT id FROM cat_tree WHERE path = $1
	`, pq.Array(path)).Scan(&id)
	if err != nil {
		if err.Error() == "no rows in result set" {
			return nil, nil
		}
		return nil, err
	}
	return &id, nil
}

// GetAllCategoryPaths returns all category paths from root to each node (including intermediates),
// ordered by depth then sort_order. Used by the LLM category classifier to derive valid outputs from the live tree.
func (db *DB) GetAllCategoryPaths(ctx context.Context) ([][]string, error) {
	rows, err := db.pool.Query(ctx, `
		WITH RECURSIVE cat_tree(id, path, depth, sort_order) AS (
			SELECT id, (ARRAY[name])::text[], depth, sort_order FROM categories WHERE parent_id IS NULL
			UNION ALL
			SELECT c.id, (ct.path || c.name)::text[], c.depth, c.sort_order
			FROM categories c JOIN cat_tree ct ON c.parent_id = ct.id
		)
		SELECT path FROM cat_tree ORDER BY depth, sort_order, id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var paths [][]string
	for rows.Next() {
		var path pgtype.FlatArray[string]
		if err := rows.Scan(&path); err != nil {
			return nil, err
		}
		if len(path) > 0 {
			paths = append(paths, []string(path))
		}
	}
	return paths, rows.Err()
}

// GetAllCategoryPathsWithDescriptions returns each category's path (root to leaf) with the leaf node's description,
// in the same order as GetAllCategoryPaths. Used by the LLM classifier to attach rubric text per selectable path.
func (db *DB) GetAllCategoryPathsWithDescriptions(ctx context.Context) ([]CategoryPathWithDescription, error) {
	rows, err := db.pool.Query(ctx, `
		WITH RECURSIVE cat_tree(id, path, depth, sort_order, description) AS (
			SELECT id, (ARRAY[name])::text[], depth, sort_order, COALESCE(description, '') FROM categories WHERE parent_id IS NULL
			UNION ALL
			SELECT c.id, (ct.path || c.name)::text[], c.depth, c.sort_order, COALESCE(c.description, '')
			FROM categories c JOIN cat_tree ct ON c.parent_id = ct.id
		)
		SELECT path, description FROM cat_tree ORDER BY depth, sort_order, id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []CategoryPathWithDescription
	for rows.Next() {
		var path pgtype.FlatArray[string]
		var desc string
		if err := rows.Scan(&path, &desc); err != nil {
			return nil, err
		}
		if len(path) == 0 {
			continue
		}
		out = append(out, CategoryPathWithDescription{
			Path:        []string(path),
			Description: desc,
		})
	}
	return out, rows.Err()
}

// ClassifierPathsFromTreeRows splits GetAllCategoryPathsWithDescriptions into valid paths and a description map.
// pathSeparator must match llm.CategoryPathSeparator (e.g. " > ").
func ClassifierPathsFromTreeRows(rows []CategoryPathWithDescription, pathSeparator string) ([][]string, map[string]string) {
	validPaths := make([][]string, len(rows))
	desc := make(map[string]string)
	for i, r := range rows {
		validPaths[i] = r.Path
		if r.Description != "" {
			desc[strings.Join(r.Path, pathSeparator)] = r.Description
		}
	}
	return validPaths, desc
}

// GetCategorySubtreeIDs returns the given category ID plus all descendant IDs, for subtree filtering (e.g. "Bikes" includes Bikes, Mountain, Electric, etc.).
func (db *DB) GetCategorySubtreeIDs(ctx context.Context, categoryID int) ([]int, error) {
	rows, err := db.pool.Query(ctx, `
		WITH RECURSIVE subtree(id) AS (
			SELECT id FROM categories WHERE id = $1
			UNION ALL
			SELECT c.id FROM categories c JOIN subtree s ON c.parent_id = s.id
		)
		SELECT id FROM subtree
	`, categoryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
