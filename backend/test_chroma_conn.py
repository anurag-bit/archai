import chromadb
import time

def test_conn():
    for host in ["127.0.0.1", "localhost"]:
        print(f"Testing Chroma HTTP Client connection on {host}:8000...")
        start = time.time()
        try:
            client = chromadb.HttpClient(host=host, port=8000)
            collections = client.list_collections()
            print(f"✓ Success! Collections: {[c.name for c in collections]}")
            print(f"Time taken: {time.time() - start:.3f}s")
            return host
        except Exception as e:
            print(f"✗ Failed for {host}: {e}")
    return None

if __name__ == "__main__":
    test_conn()
