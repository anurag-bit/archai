import sys
import os

# Add app directory to Python's path so we can import from services
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app'))

from services.embeddings import LocalHuggingFaceEmbeddings

def test_embeddings():
    print("Initializing LocalHuggingFaceEmbeddings...")
    embeddings = LocalHuggingFaceEmbeddings()
    
    query = "What is a neural network?"
    print(f"Embedding query: '{query}'...")
    try:
        vector = embeddings.embed_query(query)
        print("✓ Successfully generated embedding vector!")
        print(f"Vector length: {len(vector)}")
        print(f"First 5 dimensions: {vector[:5]}")
    except Exception as e:
        print(f"Embedding failed: {e}")

if __name__ == "__main__":
    test_embeddings()
