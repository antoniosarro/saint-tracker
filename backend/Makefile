ifneq (,$(wildcard ./.env))
    include .env
    export
endif

DB_FILENAME ?= database.db
DB_PATH ?= ./$(DB_FILENAME)
MIGRATIONS_PATH = internal/migrations

GREEN = \033[0;32m
YELLOW = \033[0;33m
RED = \033[0;31m
NC = \033[0m

# Create a new migration file
.PHONY: create-migration
create-migration:
	@read -p "Enter migration name: " name; \
	migrate create -ext sql -dir $(MIGRATIONS_PATH) -seq $$name
	@printf "$(GREEN)Migration created successfully$(NC)\n"

# Run all pending migrations
.PHONY: migrate-up
migrate-up:
	@printf "$(YELLOW)Running migrations up...$(NC)\n"
	@migrate -path $(MIGRATIONS_PATH) -database "sqlite3://$(DB_PATH)" -verbose up
	@printf "$(GREEN)Migrations completed successfully$(NC)\n"

# Rollback one migration
.PHONY: migrate-down
migrate-down:
	@printf "$(YELLOW)Rolling back one migration...$(NC)\n"
	@migrate -path $(MIGRATIONS_PATH) -database "sqlite3://$(DB_PATH)" -verbose down 1
	@printf "$(GREEN)Rollback completed successfully$(NC)\n"

# Rollback all migrations
.PHONY: migrate-down-all
migrate-down-all:
	@printf "$(RED)Rolling back ALL migrations...$(NC)\n"
	@read -p "Are you sure? (y/N): " confirm; \
	if [ "$$confirm" = "y" ] || [ "$$confirm" = "Y" ]; then \
		migrate -path $(MIGRATIONS_PATH) -database "sqlite3://$(DB_PATH)" -verbose down; \
		printf "$(GREEN)All migrations rolled back$(NC)\n"; \
	else \
		printf "$(YELLOW)Rollback cancelled$(NC)\n"; \
	fi

# Force set migration version (use with caution)
.PHONY: migrate-force
migrate-force:
	@read -p "Enter version to force: " version; \
	migrate -path $(MIGRATIONS_PATH) -database "sqlite3://$(DB_PATH)" force $$version
	@printf "$(GREEN)Migration version forced to $$version$(NC)\n"

# Show current migration version
.PHONY: migrate-version
migrate-version:
	@printf "$(YELLOW)Current migration version:$(NC)\n"
	@migrate -path $(MIGRATIONS_PATH) -database "sqlite3://$(DB_PATH)" version

# Drop everything in database
.PHONY: migrate-drop
migrate-drop:
	@printf "$(RED)WARNING: This will drop everything in the database!$(NC)\n"
	@read -p "Are you sure? Type 'DROP' to confirm: " confirm; \
	if [ "$$confirm" = "DROP" ]; then \
		migrate -path $(MIGRATIONS_PATH) -database "sqlite3://$(DB_PATH)" drop -f; \
		printf "$(GREEN)Database dropped$(NC)\n"; \
	else \
		printf "$(YELLOW)Drop cancelled$(NC)\n"; \
	fi

# Apply specific number of migrations
.PHONY: migrate-up-by
migrate-up-by:
	@read -p "Number of migrations to apply: " n; \
	migrate -path $(MIGRATIONS_PATH) -database "sqlite3://$(DB_PATH)" -verbose up $$n
	@printf "$(GREEN)Applied $n migration(s)$(NC)\n"

# Rollback specific number of migrations
.PHONY: migrate-down-by
migrate-down-by:
	@read -p "Number of migrations to rollback: " n; \
	migrate -path $(MIGRATIONS_PATH) -database "sqlite3://$(DB_PATH)" -verbose down $$n
	@printf "$(GREEN)Rolled back $n migration(s)$(NC)\n"

# Goto specific migration version
.PHONY: migrate-goto
migrate-goto:
	@read -p "Enter target version: " version; \
	migrate -path $(MIGRATIONS_PATH) -database "sqlite3://$(DB_PATH)" -verbose goto $$version
	@printf "$(GREEN)Migrated to version $$version$(NC)\n"

# Validate migrations without applying
.PHONY: migrate-validate
migrate-validate:
	@printf "$(YELLOW)Validating migrations...$(NC)\n"
	@migrate -path $(MIGRATIONS_PATH) -database "sqlite3://$(DB_PATH)" version 2>/dev/null || true
	@printf "$(GREEN)Validation completed$(NC)\n"

# Create initial migration structure
.PHONY: init-migrations
init-migrations:
	@mkdir -p $(MIGRATIONS_PATH)
	@printf "$(GREEN)Migrations directory created at $(MIGRATIONS_PATH)$(NC)\n"
	@$(MAKE) create-migration

# Development helpers
.PHONY: dev-reset
dev-reset: migrate-down-all migrate-up
	@printf "$(GREEN)Database reset completed$(NC)\n"

.PHONY: dev-fresh
dev-fresh: migrate-drop
	@rm -f $(DB_PATH)
	@printf "$(YELLOW)Database file removed$(NC)\n"
	@$(MAKE) migrate-up
	@printf "$(GREEN)Fresh database created$(NC)\n"

# Help command
.PHONY: help
help:
	@printf "$(YELLOW)Available migration commands:$(NC)\n"
	@printf "  $(GREEN)make create-migration$(NC)   - Create a new migration file\n"
	@printf "  $(GREEN)make migrate-up$(NC)         - Run all pending migrations\n"
	@printf "  $(GREEN)make migrate-down$(NC)       - Rollback one migration\n"
	@printf "  $(GREEN)make migrate-down-all$(NC)   - Rollback all migrations\n"
	@printf "  $(GREEN)make migrate-version$(NC)    - Show current migration version\n"
	@printf "  $(GREEN)make migrate-force$(NC)      - Force set migration version\n"
	@printf "  $(GREEN)make migrate-drop$(NC)       - Drop everything in database\n"
	@printf "  $(GREEN)make migrate-up-by$(NC)      - Apply N migrations\n"
	@printf "  $(GREEN)make migrate-down-by$(NC)    - Rollback N migrations\n"
	@printf "  $(GREEN)make migrate-goto$(NC)       - Go to specific version\n"
	@printf "  $(GREEN)make migrate-validate$(NC)   - Validate migrations\n"
	@printf "  $(GREEN)make init-migrations$(NC)    - Initialize migrations directory\n"
	@printf "  $(GREEN)make dev-reset$(NC)          - Reset database (down all, then up)\n"
	@printf "  $(GREEN)make dev-fresh$(NC)          - Drop and recreate database\n"

# Default target
.DEFAULT_GOAL := help