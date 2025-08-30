#!/bin/bash

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing Python dependencies..."
pip install -r requirements.txt

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    if [ -f "env_example.txt" ]; then
        cp env_example.txt .env
    else
        cat > .env <<'EOF'
# Example configuration
# OPENAI_API_KEY=your_actual_api_key_here
# Optional: limit local scan to a safe path
# SCAN_BASE_DIR=/absolute/path/you/want/to/allow
EOF
    fi
    echo ""
    echo "⚠️  Please edit the .env file and add your OpenAI API key and optional SCAN_BASE_DIR."
    echo ""
fi

# Load environment variables
set -a
# First, load project root env if present (for dev parity with Next.js)
if [ -f "../.env.local" ]; then
    echo "Loading ../.env.local"
    source ../.env.local
fi
# Also support env.local (without dot) used in this repo
if [ -f "../env.local" ]; then
    echo "Loading ../env.local"
    source ../env.local
fi

# Then load backend-specific overrides
[ -f ".env" ] && source .env
set +a

# Start the server
PORT=${BACKEND_PORT:-8000}
echo "Starting FastAPI server in debug mode on port ${PORT}..."
python -m uvicorn main:app --reload --host 0.0.0.0 --port "$PORT" --log-level debug