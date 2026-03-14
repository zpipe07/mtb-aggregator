package db

import (
	"context"
	"fmt"

	"github.com/lib/pq"
)

// Category is one row in the categories table.
type Category struct {
	ID        int     `json:"id"`
	Slug      string  `json:"slug"`
	Name      string  `json:"name"`
	ParentID  *int    `json:"parent_id,omitempty"`
	SortOrder int     `json:"sort_order"`
	Depth     int     `json:"depth"`
	CreatedAt string  `json:"created_at,omitempty"`
	UpdatedAt string  `json:"updated_at,omitempty"`
}

// CategoryTreeNode is a category with nested children for API response.
type CategoryTreeNode struct {
	Category
	Children []CategoryTreeNode `json:"children,omitempty"`
}

// ListCategories returns all categories flat, ordered by depth, then sort_order, then id.
func (db *DB) ListCategories(ctx context.Context) ([]Category, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT id, slug, name, parent_id, sort_order, depth, created_at::text, updated_at::text
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
		if err := rows.Scan(&c.ID, &c.Slug, &c.Name, &parentID, &c.SortOrder, &c.Depth, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		c.ParentID = parentID
		list = append(list, c)
	}
	return list, rows.Err()
}

// ListCategoriesTree returns the category hierarchy as a nested tree.
func (db *DB) ListCategoriesTree(ctx context.Context) ([]CategoryTreeNode, error) {
	list, err := db.ListCategories(ctx)
	if err != nil {
		return nil, err
	}
	return buildCategoryTree(list, nil), nil
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
		SELECT id, slug, name, parent_id, sort_order, depth, created_at::text, updated_at::text
		FROM categories WHERE id = $1
	`, id).Scan(&c.ID, &c.Slug, &c.Name, &parentID, &c.SortOrder, &c.Depth, &c.CreatedAt, &c.UpdatedAt)
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
		SELECT id, slug, name, parent_id, sort_order, depth, created_at::text, updated_at::text
		FROM categories WHERE slug = $1
	`, slug).Scan(&c.ID, &c.Slug, &c.Name, &parentID, &c.SortOrder, &c.Depth, &c.CreatedAt, &c.UpdatedAt)
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
func (db *DB) CreateCategory(ctx context.Context, slug, name string, parentID *int, sortOrder int) (int, error) {
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
		INSERT INTO categories (slug, name, parent_id, sort_order, depth) VALUES ($1, $2, $3, $4, $5) RETURNING id
	`, slug, name, parentID, sortOrder, depth).Scan(&id)
	return id, err
}

// UpdateCategory updates a category by id.
func (db *DB) UpdateCategory(ctx context.Context, id int, slug, name string, sortOrder int) error {
	_, err := db.pool.Exec(ctx, `
		UPDATE categories SET slug = $1, name = $2, sort_order = $3, updated_at = NOW() WHERE id = $4
	`, slug, name, sortOrder, id)
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
