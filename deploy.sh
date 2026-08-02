#!/bin/bash
# Script de déploiement Plesk — lancé automatiquement après git pull
# Le dist/ est déjà pré-compilé et commité dans git depuis Replit.
# On installe uniquement les dépendances production — pas de rebuild serveur.
set -e

echo "=== WestPay Deploy ==="

echo "[1/2] Installation des dépendances..."
npm install

echo "[2/2] Nettoyage des devDependencies..."
npm prune --omit=dev

echo "=== Déploiement terminé. Redémarre l'app dans Plesk. ==="
