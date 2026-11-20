#!/bin/bash
# ===================================================================
# Build Frontend and Copy to Backend for Railway Deployment
# Run this before building the backend Docker image
# ===================================================================

set -e

echo "🌿 Building Sango Fiora Frontend..."

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing npm dependencies..."
    npm ci
fi

# Build Eleventy site
echo "🔨 Building Eleventy site..."
npm run build

# Create backend static-frontend directory
echo "📁 Preparing backend static resources..."
mkdir -p backend/src/main/resources/static-frontend

# Copy Eleventy output to backend resources
echo "📋 Copying _site to backend/src/main/resources/static-frontend..."
cp -r _site/* backend/src/main/resources/static-frontend/

# Verify copy
echo "✅ Verifying copied files..."
FILE_COUNT=$(find backend/src/main/resources/static-frontend -type f | wc -l)
echo "   Files copied: $FILE_COUNT"

# Check key files exist
for FILE in "index.html" "products/index.html" "css/main.css" "js/api-client.js"; do
    if [ -f "backend/src/main/resources/static-frontend/$FILE" ]; then
        echo "   ✓ $FILE"
    else
        echo "   ✗ $FILE (MISSING)"
        exit 1
    fi
done

echo "🎉 Frontend build complete! Ready for backend Docker build."