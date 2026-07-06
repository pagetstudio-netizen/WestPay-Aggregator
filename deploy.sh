#!/bin/bash
# Script de déploiement Plesk — lancé automatiquement après git pull
set -e

echo "=== WestPay Deploy ==="
echo "[1/3] Installation des dépendances..."
npm install --omit=dev

echo "[2/3] Build du projet..."
npm run build

echo "[3/3] Déploiement terminé. Redémarre l'app dans Plesk."
