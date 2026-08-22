CREATE TABLE recipe_favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  PRIMARY KEY (user_id, recipe_id)
);

CREATE INDEX recipe_favorites_user_id_idx ON recipe_favorites(user_id);
CREATE INDEX recipe_favorites_recipe_id_idx ON recipe_favorites(recipe_id);
