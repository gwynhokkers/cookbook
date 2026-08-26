# Megwyn CookBook

Recipe management app: recipes, shopping lists, and Humphry (AI kitchen assistant), with role-based access.

## Language

**Recipe**:
A cookable dish stored in the cookbook, with ingredients, steps, and visibility.
_Avoid_: Post, document, content item

**Visibility**:
Whether a recipe is `public` (guests may view) or `private` (signed-in users only).
_Avoid_: Access level, privacy setting

**Ability**:
A named permission (e.g. `viewRecipe`, `manageShoppingList`) evaluated for a user (and often a resource).
_Avoid_: Permission check, ACL rule, authz policy

**Role**:
A user’s capability tier: `viewer`, `editor`, or `admin`.
_Avoid_: Permission level, access group

**Shopping list**:
A dated, per-user list of recipes and amalgamated ingredients for shopping.
_Avoid_: Cart, basket, grocery list (as a synonym in code/docs)

**Amalgamation**:
Merging ingredients across a shopping list’s recipes into combined line items (units reconciled where possible).
_Avoid_: Aggregation, merge-pass, consolidate

**Humphry session**:
A persisted chat thread with the AI assistant, owned by one user.
_Avoid_: Conversation, thread (unless clearly UI-only)
