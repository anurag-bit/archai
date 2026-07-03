import os
import json
import logging
import redis
import core.config

logger = logging.getLogger(__name__)

_valkey_client = None

def get_valkey_client():
    """
    Returns a connected Redis client if Valkey is reachable, or None.
    Caches the client connection state to avoid repeatedly failing connection attempts.
    """
    global _valkey_client
    if _valkey_client is None:
        try:
            client = redis.Redis(
                host=core.config.VALKEY_HOST,
                port=core.config.VALKEY_PORT,
                db=0,
                decode_responses=True,
                socket_connect_timeout=2
            )
            # Send ping to confirm connectivity
            client.ping()
            _valkey_client = client
            logger.info(f"Successfully connected to Valkey database at {core.config.VALKEY_HOST}:{core.config.VALKEY_PORT}")
        except Exception as e:
            logger.warning(f"Valkey in-memory DB is unreachable at {core.config.VALKEY_HOST}:{core.config.VALKEY_PORT} ({e}). Falling back to local file-based cache.")
            _valkey_client = False # Sentinel for unreachable
            
    return _valkey_client if _valkey_client is not False else None


def get_cached_design(document_id: str) -> dict or None:
    """
    Attempts to retrieve cached design from Valkey. Falls back to on-disk json file.
    """
    client = get_valkey_client()
    if client:
        try:
            cached = client.get(f"design:{document_id}")
            if cached:
                logger.info(f"✓ Cache hit (Valkey) for document: {document_id}")
                return json.loads(cached)
        except Exception as e:
            logger.error(f"Valkey cache read error: {e}")

    # Fallback: disk cache
    cache_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "cache")
    cache_path = os.path.join(cache_dir, f"{document_id}.json")
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                logger.info(f"✓ Cache hit (Local Disk) for document: {document_id}")
                return json.load(f)
        except Exception as e:
            logger.error(f"Local file cache read error: {e}")
            
    return None


def set_cached_design(document_id: str, data: dict):
    """
    Caches design in Valkey and persists on local disk as backup/durability.
    """
    client = get_valkey_client()
    if client:
        try:
            client.set(f"design:{document_id}", json.dumps(data))
            logger.info(f"✓ Cached design (Valkey) for document: {document_id}")
        except Exception as e:
            logger.error(f"Valkey cache write error: {e}")

    # Backup: Disk persistence
    cache_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "cache")
    os.makedirs(cache_dir, exist_ok=True)
    cache_path = os.path.join(cache_dir, f"{document_id}.json")
    try:
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        logger.info(f"✓ Persisted design to disk for document: {document_id}")
    except Exception as e:
        logger.error(f"Local file cache write error: {e}")


from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.redis import RedisSaver, AsyncRedisSaver
from langgraph.checkpoint.memory import MemorySaver

class DynamicSaver(BaseCheckpointSaver):
    """
    A LangGraph checkpoint saver that dynamically delegates to AsyncRedisSaver
    for async methods and RedisSaver for sync methods when online,
    falling back to MemorySaver when Valkey is unreachable.
    """
    def __init__(self, valkey_url: str):
        super().__init__()
        self.valkey_url = valkey_url
        self.memory_saver = MemorySaver()
        self._sync_redis_saver = None
        self._async_redis_saver = None
        self._is_redis_dead = False
        
    @property
    def sync_saver(self):
        if self._is_redis_dead:
            return self.memory_saver
        if self._sync_redis_saver is None:
            try:
                # Test connectivity
                client = redis.Redis.from_url(self.valkey_url, socket_connect_timeout=2)
                client.ping()
                self._sync_redis_saver = RedisSaver(redis_url=self.valkey_url)
                logger.info(f"Successfully initialized sync persistent Valkey checkpointer at {self.valkey_url}")
            except Exception as e:
                logger.warning(f"Valkey unreachable for sync checkpointer saver ({e}). Falling back to memory-based checkpointer.")
                self._is_redis_dead = True
                return self.memory_saver
        return self._sync_redis_saver

    @property
    def async_saver(self):
        if self._is_redis_dead:
            return self.memory_saver
        if self._async_redis_saver is None:
            try:
                # Test connectivity
                client = redis.Redis.from_url(self.valkey_url, socket_connect_timeout=2)
                client.ping()
                self._async_redis_saver = AsyncRedisSaver(redis_url=self.valkey_url)
                logger.info(f"Successfully initialized async persistent Valkey checkpointer at {self.valkey_url}")
            except Exception as e:
                logger.warning(f"Valkey unreachable for async checkpointer saver ({e}). Falling back to memory-based checkpointer.")
                self._is_redis_dead = True
                return self.memory_saver
        return self._async_redis_saver

    def get_tuple(self, config):
        return self.sync_saver.get_tuple(config)

    def put(self, config, checkpoint, metadata, new_versions):
        return self.sync_saver.put(config, checkpoint, metadata, new_versions)

    def put_writes(self, config, writes, task_id, task_path=""):
        return self.sync_saver.put_writes(config, writes, task_id, task_path)

    def list(self, config, *, filter=None, before=None, limit=None):
        return self.sync_saver.list(config, filter=filter, before=before, limit=limit)

    async def aget_tuple(self, config):
        saver = self.async_saver
        if isinstance(saver, MemorySaver):
            return saver.get_tuple(config)
        return await saver.aget_tuple(config)

    async def aput(self, config, checkpoint, metadata, new_versions):
        saver = self.async_saver
        if isinstance(saver, MemorySaver):
            return saver.put(config, checkpoint, metadata, new_versions)
        return await saver.aput(config, checkpoint, metadata, new_versions)

    async def aput_writes(self, config, writes, task_id, task_path=""):
        saver = self.async_saver
        if isinstance(saver, MemorySaver):
            return saver.put_writes(config, writes, task_id, task_path)
        return await saver.aput_writes(config, writes, task_id, task_path)

    async def alist(self, config, *, filter=None, before=None, limit=None):
        saver = self.async_saver
        if isinstance(saver, MemorySaver):
            for x in saver.list(config, filter=filter, before=before, limit=limit):
                yield x
        else:
            async for x in saver.alist(config, filter=filter, before=before, limit=limit):
                yield x
