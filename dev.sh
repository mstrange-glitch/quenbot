#!/bin/bash
# Launch script for QUENbot development
# Unsets ELECTRON_RUN_AS_NODE which is set by VSCode/Claude Code
unset ELECTRON_RUN_AS_NODE
npx electron-vite dev
