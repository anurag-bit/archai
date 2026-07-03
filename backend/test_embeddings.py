from langchain_openai import OpenAIEmbeddings
import json

try:
    embeddings = OpenAIEmbeddings(
        openai_api_key="dummy_key",
        openai_api_base="https://openrouter.ai/api/v1",
        model="nvidia/llama-nemotron-embed-vl-1b-v2:free",
        default_headers={"HTTP-Referer": "http://localhost:3000", "X-Title": "Archai"}
    )
    print("OpenAIEmbeddings initialized successfully.")
except Exception as e:
    print(f"Error initializing: {e}")
