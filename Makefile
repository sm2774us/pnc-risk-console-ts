.PHONY: docker-up tf-validate help install dev verify test integration e2e lint build docker-up docker-down k8s-render tf-fmt tf-validate
help:
	@echo "make install | dev | verify | test | integration | e2e | lint | build"
	@echo "make docker-up | docker-down | k8s-render | tf-validate"
install:
	npm ci --no-audit --no-fund
dev:
	npm run dev
verify:
	npm run verify
test:
	npm test
integration:
	npm run test:integration
e2e: build
	npx playwright install --with-deps chromium
	npm run test:e2e
lint:
	npm run lint
build:
	npm run build
docker-up:
	docker compose up --build
docker-down:
	docker compose down -v
k8s-render:
	kubectl kustomize k8s/overlays/dev
	kubectl kustomize k8s/overlays/prod
tf-fmt:
	terraform fmt -recursive infra/terraform
tf-validate:
	@for d in infra/terraform/envs/*; do terraform -chdir=$$d init -backend=false -input=false && terraform -chdir=$$d validate; done
docker-up:
	docker compose up -d --build   ## alias of up
tf-validate:
	for d in infra/terraform/envs/*/; do terraform -chdir=$$d init -backend=false -input=false >/dev/null && terraform -chdir=$$d validate; done   ## validate all envs
