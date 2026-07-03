import os
import json
import logging
import pickle
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


def _clean_markdown(text: str) -> str:
    if not text or not isinstance(text, str):
        return text
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


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
                res = json.loads(cached)
                if isinstance(res, dict) and "systemDesignMarkdown" in res:
                    res["systemDesignMarkdown"] = _clean_markdown(res["systemDesignMarkdown"])
                return res
        except Exception as e:
            logger.error(f"Valkey cache read error: {e}")

    # Fallback: disk cache
    cache_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "cache")
    cache_path = os.path.join(cache_dir, f"{document_id}.json")
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                logger.info(f"✓ Cache hit (Local Disk) for document: {document_id}")
                res = json.load(f)
                if isinstance(res, dict) and "systemDesignMarkdown" in res:
                    res["systemDesignMarkdown"] = _clean_markdown(res["systemDesignMarkdown"])
                return res
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


from langgraph.checkpoint.base import BaseCheckpointSaver, CheckpointTuple, Checkpoint, CheckpointMetadata
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.runnables import RunnableConfig
from typing import Iterator, AsyncIterator, Sequence, Any

class DynamicSaver(BaseCheckpointSaver):
    """
    A LangGraph checkpoint saver that dynamically delegates to a custom Valkey/Redis
    key-value store when online, falling back to MemorySaver when Valkey is unreachable.
    Does not require RedisJSON/redisvl commands (like JSON.SET or JSON.GET).
    """
    def __init__(self, valkey_url: str):
        super().__init__()
        self.valkey_url = valkey_url
        self.memory_saver = MemorySaver()
        self._sync_client = None
        self._async_client = None
        self._is_valkey_dead = False
        
    @property
    def is_active(self) -> bool:
        if self._is_valkey_dead:
            return False
        if self._sync_client is None:
            try:
                # Test connectivity
                client = redis.Redis.from_url(self.valkey_url, socket_connect_timeout=2)
                client.ping()
                # Create actual sync/async binary clients
                self._sync_client = redis.Redis.from_url(self.valkey_url, decode_responses=False)
                self._async_client = redis.asyncio.Redis.from_url(self.valkey_url, decode_responses=False)
                logger.info(f"Successfully initialized custom persistent Valkey checkpointer at {self.valkey_url}")
            except Exception as e:
                logger.warning(f"Valkey database unreachable ({e}). Falling back to MemorySaver.")
                self._is_valkey_dead = True
                return False
        return True

    def get_tuple(self, config: RunnableConfig) -> CheckpointTuple | None:
        if not self.is_active:
            return self.memory_saver.get_tuple(config)
            
        thread_id = config["configurable"]["thread_id"]
        checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
        checkpoint_id = config["configurable"].get("checkpoint_id")
        
        if not checkpoint_id:
            latest_key = f"latest:{thread_id}:{checkpoint_ns}"
            checkpoint_id_bytes = self._sync_client.get(latest_key)
            if not checkpoint_id_bytes:
                return None
            checkpoint_id = checkpoint_id_bytes.decode("utf-8")
            
        checkpoint_key = f"checkpoint:{thread_id}:{checkpoint_ns}:{checkpoint_id}"
        data = self._sync_client.get(checkpoint_key)
        if not data:
            return None
            
        saved = pickle.loads(data)
        
        # Load writes
        writes = []
        write_pattern = f"writes:{thread_id}:{checkpoint_ns}:{checkpoint_id}:*"
        for key in self._sync_client.scan_iter(write_pattern):
            write_data = self._sync_client.get(key)
            if write_data:
                writes.append(pickle.loads(write_data))
                
        return CheckpointTuple(
            config=saved["config"],
            checkpoint=saved["checkpoint"],
            metadata=saved["metadata"],
            parent_config=saved.get("parent_config"),
            pending_writes=writes
        )

    def put(self, config: RunnableConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata, new_versions: Any) -> RunnableConfig:
        if not self.is_active:
            return self.memory_saver.put(config, checkpoint, metadata, new_versions)
            
        thread_id = config["configurable"]["thread_id"]
        checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
        checkpoint_id = checkpoint["id"]
        
        saved = {
            "checkpoint": checkpoint,
            "metadata": metadata,
            "parent_config": config.get("parent_config"),
            "config": {
                "configurable": {
                    "thread_id": thread_id,
                    "checkpoint_ns": checkpoint_ns,
                    "checkpoint_id": checkpoint_id,
                }
            }
        }
        
        checkpoint_key = f"checkpoint:{thread_id}:{checkpoint_ns}:{checkpoint_id}"
        self._sync_client.set(checkpoint_key, pickle.dumps(saved))
        
        latest_key = f"latest:{thread_id}:{checkpoint_ns}"
        self._sync_client.set(latest_key, checkpoint_id.encode("utf-8"))
        
        return saved["config"]

    def put_writes(self, config: RunnableConfig, writes: Sequence[tuple[str, Any]], task_id: str, task_path: str = "") -> None:
        if not self.is_active:
            return self.memory_saver.put_writes(config, writes, task_id, task_path)
            
        thread_id = config["configurable"]["thread_id"]
        checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
        checkpoint_id = config["configurable"]["checkpoint_id"]
        
        for idx, (channel, value) in enumerate(writes):
            write_key = f"writes:{thread_id}:{checkpoint_ns}:{checkpoint_id}:{task_id}:{idx}"
            self._sync_client.set(write_key, pickle.dumps((task_id, task_path, channel, value)))

    def list(self, config: RunnableConfig | None, *, filter: dict[str, Any] | None = None, before: RunnableConfig | None = None, limit: int | None = None) -> Iterator[CheckpointTuple]:
        if not self.is_active:
            for x in self.memory_saver.list(config, filter=filter, before=before, limit=limit):
                yield x
            return
            
        if config:
            thread_id = config["configurable"]["thread_id"]
            checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
            pattern = f"checkpoint:{thread_id}:{checkpoint_ns}:*"
        else:
            pattern = "checkpoint:*"
            
        count = 0
        for key in self._sync_client.scan_iter(pattern):
            if limit and count >= limit:
                break
            data = self._sync_client.get(key)
            if data:
                saved = pickle.loads(data)
                if before and saved["config"]["configurable"]["checkpoint_id"] >= before["configurable"]["checkpoint_id"]:
                    continue
                if filter:
                    match = True
                    for k, v in filter.items():
                        if saved["metadata"].get(k) != v:
                            match = False
                            break
                    if not match:
                        continue
                        
                yield CheckpointTuple(
                    config=saved["config"],
                    checkpoint=saved["checkpoint"],
                    metadata=saved["metadata"],
                    parent_config=saved.get("parent_config"),
                    pending_writes=[]
                )
                count += 1

    async def aget_tuple(self, config: RunnableConfig) -> CheckpointTuple | None:
        if not self.is_active:
            return self.memory_saver.get_tuple(config)
            
        thread_id = config["configurable"]["thread_id"]
        checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
        checkpoint_id = config["configurable"].get("checkpoint_id")
        
        if not checkpoint_id:
            latest_key = f"latest:{thread_id}:{checkpoint_ns}"
            checkpoint_id_bytes = await self._async_client.get(latest_key)
            if not checkpoint_id_bytes:
                return None
            checkpoint_id = checkpoint_id_bytes.decode("utf-8")
            
        checkpoint_key = f"checkpoint:{thread_id}:{checkpoint_ns}:{checkpoint_id}"
        data = await self._async_client.get(checkpoint_key)
        if not data:
            return None
            
        saved = pickle.loads(data)
        
        # Load writes
        writes = []
        write_pattern = f"writes:{thread_id}:{checkpoint_ns}:{checkpoint_id}:*"
        async for key in self._async_client.scan_iter(write_pattern):
            write_data = await self._async_client.get(key)
            if write_data:
                writes.append(pickle.loads(write_data))
                
        return CheckpointTuple(
            config=saved["config"],
            checkpoint=saved["checkpoint"],
            metadata=saved["metadata"],
            parent_config=saved.get("parent_config"),
            pending_writes=writes
        )

    async def aput(self, config: RunnableConfig, checkpoint: Checkpoint, metadata: CheckpointMetadata, new_versions: Any) -> RunnableConfig:
        if not self.is_active:
            return self.memory_saver.put(config, checkpoint, metadata, new_versions)
            
        thread_id = config["configurable"]["thread_id"]
        checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
        checkpoint_id = checkpoint["id"]
        
        saved = {
            "checkpoint": checkpoint,
            "metadata": metadata,
            "parent_config": config.get("parent_config"),
            "config": {
                "configurable": {
                    "thread_id": thread_id,
                    "checkpoint_ns": checkpoint_ns,
                    "checkpoint_id": checkpoint_id,
                }
            }
        }
        
        checkpoint_key = f"checkpoint:{thread_id}:{checkpoint_ns}:{checkpoint_id}"
        await self._async_client.set(checkpoint_key, pickle.dumps(saved))
        
        latest_key = f"latest:{thread_id}:{checkpoint_ns}"
        await self._async_client.set(latest_key, checkpoint_id.encode("utf-8"))
        
        return saved["config"]

    async def aput_writes(self, config: RunnableConfig, writes: Sequence[tuple[str, Any]], task_id: str, task_path: str = "") -> None:
        if not self.is_active:
            return self.memory_saver.put_writes(config, writes, task_id, task_path)
            
        thread_id = config["configurable"]["thread_id"]
        checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
        checkpoint_id = config["configurable"]["checkpoint_id"]
        
        for idx, (channel, value) in enumerate(writes):
            write_key = f"writes:{thread_id}:{checkpoint_ns}:{checkpoint_id}:{task_id}:{idx}"
            await self._async_client.set(write_key, pickle.dumps((task_id, task_path, channel, value)))

    async def alist(self, config: RunnableConfig | None, *, filter: dict[str, Any] | None = None, before: RunnableConfig | None = None, limit: int | None = None) -> AsyncIterator[CheckpointTuple]:
        if not self.is_active:
            for x in self.memory_saver.list(config, filter=filter, before=before, limit=limit):
                yield x
            return
            
        if config:
            thread_id = config["configurable"]["thread_id"]
            checkpoint_ns = config["configurable"].get("checkpoint_ns", "")
            pattern = f"checkpoint:{thread_id}:{checkpoint_ns}:*"
        else:
            pattern = "checkpoint:*"
            
        count = 0
        async for key in self._async_client.scan_iter(pattern):
            if limit and count >= limit:
                break
            data = await self._async_client.get(key)
            if data:
                saved = pickle.loads(data)
                if before and saved["config"]["configurable"]["checkpoint_id"] >= before["configurable"]["checkpoint_id"]:
                    continue
                if filter:
                    match = True
                    for k, v in filter.items():
                        if saved["metadata"].get(k) != v:
                            match = False
                            break
                    if not match:
                        continue
                        
                yield CheckpointTuple(
                    config=saved["config"],
                    checkpoint=saved["checkpoint"],
                    metadata=saved["metadata"],
                    parent_config=saved.get("parent_config"),
                    pending_writes=[]
                )
                count += 1

    def delete_thread(self, thread_id: str) -> None:
        if not self.is_active:
            return
        pattern = f"checkpoint:{thread_id}:*"
        for key in self._sync_client.scan_iter(pattern):
            self._sync_client.delete(key)
        pattern = f"latest:{thread_id}:*"
        for key in self._sync_client.scan_iter(pattern):
            self._sync_client.delete(key)
        pattern = f"writes:{thread_id}:*"
        for key in self._sync_client.scan_iter(pattern):
            self._sync_client.delete(key)

    async def adelete_thread(self, thread_id: str) -> None:
        if not self.is_active:
            return
        pattern = f"checkpoint:{thread_id}:*"
        async for key in self._async_client.scan_iter(pattern):
            await self._async_client.delete(key)
        pattern = f"latest:{thread_id}:*"
        async for key in self._async_client.scan_iter(pattern):
            await self._async_client.delete(key)
        pattern = f"writes:{thread_id}:*"
        async for key in self._async_client.scan_iter(pattern):
            await self._async_client.delete(key)
