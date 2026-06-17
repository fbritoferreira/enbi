CREATE TABLE `_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`collection` text NOT NULL,
	`entry_id` text NOT NULL,
	`version` integer NOT NULL,
	`snapshot` text NOT NULL,
	`author_id` text,
	`created_at` text NOT NULL
);

--> statement-breakpoint
CREATE TABLE `_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`hashed_key` text NOT NULL,
	`role` text NOT NULL,
	`label` text,
	`created_at` text NOT NULL,
	`last_used_at` text
);

--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`views` integer DEFAULT 0 NOT NULL
);

--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`emailVerified` integer NOT NULL,
	`image` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`role` text,
	`banned` integer,
	`banReason` text,
	`banExpires` integer
);

--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL,
	`token` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`userId` text NOT NULL,
	`impersonatedBy` text
);

--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`grantedScopes` text,
	`password` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);

--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);

