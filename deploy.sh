#!/bin/bash
# Script de déploiement Plesk — lancé automatiquement après git pull
# Le dist/ est déjà pré-compilé et commité dans git depuis Replit.
# On installe uniquement les dépendances de production — pas de rebuild serveur.
set -e

cd "$(dirname "$(realpath "$0")")"

echo "=== WestPay Deploy ==="

echo "[1/3] Restauration des fichiers dist/ depuis git (au cas où supprimés)..."
git checkout -- dist/ 2>/dev/null || git restore dist/ 2>/dev/null || true

echo "[2/3] Installation reproductible des dépendances de production..."
npm ci --omit=dev

echo "[3/3] Vérification de l'artefact serveur pré-compilé..."
test -s dist/index.cjs
test -s dist/public/index.html

echo "=== Déploiement terminé. Redémarre l'app dans Plesk. ==="
