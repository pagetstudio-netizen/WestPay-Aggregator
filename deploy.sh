#!/bin/bash
# Script de déploiement Plesk — lancé automatiquement après git pull
# Le dist/ est déjà pré-compilé et commité dans git depuis Replit.
# On installe uniquement les dépendances production — pas de rebuild serveur.
set -e

echo "=== WestPay Deploy ==="

echo "[1/3] Restauration des fichiers dist/ depuis git (au cas où supprimés)..."
git checkout -- dist/ 2>/dev/null || git restore dist/ 2>/dev/null || true

echo "[2/3] Installation des dépendances..."
npm install

echo "[3/3] Nettoyage des devDependencies..."
npm prune --omit=dev

echo "=== Déploiement terminé. Redémarre l'app dans Plesk. ==="
