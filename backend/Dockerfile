FROM python:3.10-slim

# Set environment variables to run Python and configure pythonpath
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/app

WORKDIR /app

# Install build dependencies that might be needed for packages like hnswlib
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all application code
COPY . .

# Expose backend default port
EXPOSE 8080

# Run the FastAPI app via the python entrypoint
CMD ["python", "app/main.py"]
