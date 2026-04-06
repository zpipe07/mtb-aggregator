-- LLM classification hints: optional rubric text per category (editable in admin).
ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
