-- Migrate from Open Food Facts to Spoonacular
-- Rename columns in ingredients table

ALTER TABLE "ingredients" 
  RENAME COLUMN "off_product_id" TO "spoonacular_ingredient_id";

ALTER TABLE "ingredients" 
  RENAME COLUMN "off_product_data" TO "spoonacular_data";
