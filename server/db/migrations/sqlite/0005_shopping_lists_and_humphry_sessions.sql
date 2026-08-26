CREATE TABLE `shopping_lists` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `list_date` TEXT NOT NULL,
  `title` TEXT,
  `status` TEXT NOT NULL DEFAULT 'draft',
  `generated_at` INTEGER,
  `created_at` INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  `updated_at` INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE UNIQUE INDEX `shopping_lists_user_date_uidx` ON `shopping_lists` (`user_id`, `list_date`);
CREATE INDEX `shopping_lists_user_id_idx` ON `shopping_lists` (`user_id`);

CREATE TABLE `shopping_list_recipes` (
  `list_id` TEXT NOT NULL REFERENCES `shopping_lists`(`id`) ON DELETE CASCADE,
  `recipe_id` TEXT NOT NULL REFERENCES `recipes`(`id`) ON DELETE CASCADE,
  `created_at` INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  PRIMARY KEY (`list_id`, `recipe_id`)
);

CREATE TABLE `shopping_list_items` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `list_id` TEXT NOT NULL REFERENCES `shopping_lists`(`id`) ON DELETE CASCADE,
  `ingredient_id` TEXT REFERENCES `ingredients`(`id`) ON DELETE SET NULL,
  `name` TEXT NOT NULL,
  `total_amount` TEXT NOT NULL DEFAULT '',
  `total_unit` TEXT NOT NULL DEFAULT '',
  `display_amount` TEXT NOT NULL DEFAULT '',
  `aisle` TEXT,
  `package_suggestion` TEXT,
  `substitution_note` TEXT,
  `needs_review` INTEGER NOT NULL DEFAULT 0,
  `checked` INTEGER NOT NULL DEFAULT 0,
  `contributions` TEXT NOT NULL DEFAULT '[]',
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  `updated_at` INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX `shopping_list_items_list_id_idx` ON `shopping_list_items` (`list_id`);

CREATE TABLE `humphry_chat_sessions` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `user_id` TEXT NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `title` TEXT NOT NULL DEFAULT 'New chat',
  `created_at` INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  `updated_at` INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  `last_message_at` INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX `humphry_chat_sessions_user_last_idx` ON `humphry_chat_sessions` (`user_id`, `last_message_at`);

CREATE TABLE `humphry_chat_messages` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `session_id` TEXT NOT NULL REFERENCES `humphry_chat_sessions`(`id`) ON DELETE CASCADE,
  `message_id` TEXT NOT NULL,
  `role` TEXT NOT NULL,
  `parts` TEXT NOT NULL DEFAULT '[]',
  `search_text` TEXT NOT NULL DEFAULT '',
  `created_at` INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
);

CREATE INDEX `humphry_chat_messages_session_created_idx` ON `humphry_chat_messages` (`session_id`, `created_at`);
CREATE UNIQUE INDEX `humphry_chat_messages_session_message_uidx` ON `humphry_chat_messages` (`session_id`, `message_id`);
