#!/bin/bash
# Script de déploiement Plesk — lancé automatiquement après git pull
set -e

echo "=== WestPay Deploy ==="

echo "[1/3] Installation des dépendances (dev inclus pour le build)..."
npm install

echo "[2/3] Build du projet..."
npm run build

echo "[3/3] Nettoyage des devDependencies..."
npm prune --omit=dev

echo "=== Déploiement terminé. Redémarre l'app dans Plesk. ==="
