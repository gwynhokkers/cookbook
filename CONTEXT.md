# CookBook

Recipe management for a household cookbook: capture recipes (including from images), search and browse them, chat with a sous-chef assistant, and build shopping lists.

## Language

### Capture

**Extraction**:
Turning recipe images into a structured **Extracted draft**.
_Avoid_: Scan (UI gesture), pipeline (config detail), OCR (one stage inside Extraction)

**Extracted draft**:
The structured recipe fields produced by Extraction before a human edits them (title, description, ingredients, steps, tags, servings).
_Avoid_: ExtractedRecipe (type name), prefill payload

**Prefill**:
Applying an Extracted draft onto an editable recipe form.
_Avoid_: Merge, hydrate (implementation steps inside Prefill)

### Assistant

**Humphry turn**:
One signed-in chat exchange: prior messages in, a UI stream (and tool outcomes) out.
_Avoid_: Chat session (multi-turn state), completion, generation

### Recipe editing

**Recipe editor**:
The form state and validation for creating or updating a recipe.
_Avoid_: RecipeForm (the Vue file), scan UI

**Recipe save**:
Persisting a recipe editor's state through today's create/update and ingredient-link routes.
_Avoid_: PersistRecipe (deferred deepening: one server write of the full aggregate)
