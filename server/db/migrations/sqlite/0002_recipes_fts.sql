CREATE VIRTUAL TABLE IF NOT EXISTS recipes_fts USING fts5(
  recipe_id UNINDEXED,
  title,
  description,
  tags,
  source,
  book,
  author,
  ingredients,
  steps,
  contributor,
  tokenize='unicode61 remove_diacritics 1'
);
