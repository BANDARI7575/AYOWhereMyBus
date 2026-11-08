#!/bin/bash

cd "$(dirname "$0")/.." || exit 1

git add .
git diff --cached --quiet && exit 0

git commit -m "Update AYOWhereMyBus website"
git push origin main